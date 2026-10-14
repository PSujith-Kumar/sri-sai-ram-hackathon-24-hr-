import { describe, expect, it } from 'vitest'
import { analyzeUtterance, assessSituation, buildSnapshot, companionReply, dueMedications, LEVEL, overdueMedications } from '../src/companion/brain'
import { buildUssdCode, enqueue, makeRelayItem, markSent, parseMrn, pending, ussdDialHref } from '../src/companion/ussd'
import { frameDifference, initialMotionState, stepMotion } from '../src/companion/motion'
import { analyzeThermalFrame, initialThermalState, simulateFrame, stepThermal } from '../src/companion/thermal'
import { GUARD_MODE, cctvAllowed, initialGuard, recordingAllowed, stepGuard } from '../src/companion/privacy'
import { buildBriefing } from '../src/companion/ussd'
import { thermalSensorsEnabled, thermalStartsWithAi } from '../src/companion/config'

const fixedRng = () => 0.5

function runThermal(scenario, seconds, { warmup = 'normal' } = {}) {
  let state = initialThermalState(0)
  let prev = null
  const events = []
  let active = []
  let t = 0
  for (let i = 0; i < 4; i++) { // establish an upright, moving person first
    const f = simulateFrame(warmup, i, i % 2 ? () => 0.9 : () => 0.1)
    const r = stepThermal(state, analyzeThermalFrame(f, prev), t)
    state = r.state; prev = f; t += 1000
  }
  for (let i = 0; i < seconds; i++) {
    const f = simulateFrame(scenario, i, fixedRng)
    const r = stepThermal(state, analyzeThermalFrame(f, prev), t)
    state = r.state; prev = f; events.push(...r.events); active = r.active; t += 1000
  }
  return { events, active }
}

const meds = [
  { id: 'm1', name: 'Atorvastatin', instruction: '1 tablet', time: '20:00', note: 'After dinner', status: 'unconfirmed' },
  { id: 'm2', name: 'Vitamin D3', instruction: '1 tablet', time: '09:00', note: 'After breakfast', status: 'taken' },
]

describe('analyzeUtterance', () => {
  it('flags chest pain as critical', () => {
    const r = analyzeUtterance('I have chest pain')
    expect(r.level).toBe(LEVEL.critical)
    expect(r.codes).toContain('CP')
  })

  it('escalates dizziness to urgent for a hypertension patient', () => {
    const r = analyzeUtterance('I feel dizzy', { conditions: ['Hypertension monitoring'] })
    expect(r.level).toBe(LEVEL.urgent)
    expect(r.codes).toEqual(expect.arrayContaining(['SY', 'BP']))
  })

  it('keeps dizziness at watch level without a related condition', () => {
    expect(analyzeUtterance('I feel dizzy').level).toBe(LEVEL.watch)
  })

  it('flags a mentioned allergen as urgent', () => {
    const r = analyzeUtterance('they gave me penicillin', { allergies: ['Penicillin'] })
    expect(r.codes).toContain('AL')
    expect(r.level).toBe(LEVEL.urgent)
  })

  it('treats self-harm statements as critical', () => {
    const r = analyzeUtterance("I don't want to live anymore")
    expect(r.codes).toContain('MH')
    expect(r.level).toBe(LEVEL.critical)
  })

  it('detects mood and stays calm for normal chat', () => {
    expect(analyzeUtterance('I feel so lonely today')).toMatchObject({ mood: 'low', level: LEVEL.none })
  })

  it('does not alert on casual speech', () => {
    expect(analyzeUtterance('Hello there').level).toBe(LEVEL.none)
  })
})

describe('medications', () => {
  it('finds overdue unconfirmed medication only', () => {
    expect(overdueMedications(meds, 21 * 60 + 30).map(m => m.id)).toEqual(['m1'])
    expect(overdueMedications(meds, 20 * 60 + 10)).toHaveLength(0)
  })

  it('finds medication due around now', () => {
    expect(dueMedications(meds, 20 * 60 + 5).map(m => m.id)).toEqual(['m1'])
  })
})

describe('assessSituation', () => {
  it('stays normal when everything is fine', () => {
    const r = assessSituation({ camera: { status: 'live' }, meds, nowMinutes: 12 * 60 })
    expect(r.level).toBe(LEVEL.none)
    expect(r.actions.alertFamily).toBe(false)
  })

  it('alerts family on a possible fall, and the hospital if the patient does not respond', () => {
    const fall = assessSituation({ camera: { status: 'live', possibleFall: true } })
    expect(fall.actions).toMatchObject({ alertFamily: true, notifyHospital: false })
    const noReply = assessSituation({ camera: { status: 'live', possibleFall: true }, missedCheckins: 1 })
    expect(noReply.actions.notifyHospital).toBe(true)
    expect(noReply.codes).toEqual(expect.arrayContaining(['FL', 'NR']))
  })

  it('escalates missed voice check-ins when the camera is unavailable', () => {
    const base = { camera: { status: 'unavailable' } }
    expect(assessSituation({ ...base, missedCheckins: 1 }).level).toBe(LEVEL.none)
    expect(assessSituation({ ...base, missedCheckins: 2 }).level).toBe(LEVEL.urgent)
    expect(assessSituation({ ...base, missedCheckins: 3 }).level).toBe(LEVEL.critical)
  })

  it('asks for a check-in when medication is overdue', () => {
    const r = assessSituation({ camera: { status: 'live' }, meds, nowMinutes: 22 * 60 })
    expect(r.codes).toContain('MD')
    expect(r.actions.checkIn).toBe(true)
  })

  it('uses the medical record: symptoms plus hypertension is urgent', () => {
    const r = assessSituation({ utterance: 'bad headache', conditions: ['Hypertension monitoring'] })
    expect(r.actions.alertFamily).toBe(true)
  })
})

describe('companionReply', () => {
  it('responds to a crisis with support and the helpline', () => {
    const analysis = analyzeUtterance('I want to end my life')
    expect(companionReply({ analysis, name: 'Ananya Kumar' })).toMatch(/14416/)
  })

  it('answers warmly and by first name', () => {
    const analysis = analyzeUtterance('I feel lonely')
    expect(companionReply({ analysis, name: 'Ananya Kumar' })).toMatch(/^I'm sorry you're feeling that way, Ananya/)
  })
})

describe('buildSnapshot', () => {
  it('summarises adherence, latest record and mood trend', () => {
    const s = buildSnapshot({
      patient: { conditions: ['Hypertension'], allergies: [], bloodGroup: 'B+' },
      records: [{ title: 'Old', date: '2026-01-01' }, { title: 'New', date: '2026-10-08' }],
      meds,
      moods: [{ mood: 'low' }, { mood: 'low' }, { mood: 'anxious' }],
    })
    expect(s).toMatchObject({ adherence: 50, latestRecord: 'New', moodTrend: 'declining' })
  })
})

describe('ussd relay', () => {
  const at = new Date(2026, 9, 13, 21, 5)

  it('parses the MRN', () => {
    expect(parseMrn('SMH-20481')).toEqual({ hospital: 'SMH', number: '20481' })
  })

  it('builds a compact, valid USSD string', () => {
    const code = buildUssdCode({ mrn: 'SMH-20481', level: LEVEL.critical, codes: ['CP', 'BR'], at })
    expect(code).toBe('*123*20481*C*CP-BR*2105#')
    expect(code.length).toBeLessThanOrEqual(182)
  })

  it('percent-encodes # in the dial link', () => {
    expect(ussdDialHref('*123*1#')).toBe('tel:*123*1%23')
  })

  it('queues immutably and marks items as sent', () => {
    const item = makeRelayItem({
      patient: { id: 'p1', mrn: 'SMH-20481' }, patientName: 'Ananya Kumar', hospitalName: 'Sanjeevani',
      assessment: { level: LEVEL.critical, codes: ['CP'], reasons: ['chest pain'] }, at,
    })
    const q0 = []
    const q1 = enqueue(q0, item)
    expect(q0).toHaveLength(0)
    expect(pending(q1)).toHaveLength(1)
    const q2 = markSent(q1, item.id, 'internet')
    expect(pending(q2)).toHaveLength(0)
    expect(q2[0]).toMatchObject({ status: 'sent', via: 'internet' })
    expect(q1[0].status).toBe('queued')
  })
})

describe('thermal camera with realistic sensor noise', () => {
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  const run = (scenario, seconds) => {
    const rng = seeded(7)
    let state = initialThermalState(0), prev = null, t = 0
    const events = []
    for (let i = 0; i < seconds + 4; i++) {
      const f = simulateFrame(i < 4 ? 'normal' : scenario, i < 4 ? i : i - 4, rng)
      const r = stepThermal(state, analyzeThermalFrame(f, prev), t)
      state = r.state; prev = f; events.push(...r.events); t += 1000
    }
    return events
  }

  it('does not mistake noise for movement: a fall is still detected', () => {
    expect(run('fall', 15)).toContain('possible-fall')
  })

  it('does not raise false alarms for a normally moving person', () => {
    expect(run('normal', 60)).toEqual([])
  })

  it('still detects fever through noise', () => {
    expect(run('fever', 8)).toContain('fever')
  })
})

describe('thermal sensor startup policy', () => {
  it('keeps the hosted simulator available for testing', () => {
    expect(thermalStartsWithAi({ thermal: { kind: 'sim' } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: true, sensorEscalationConsent: true, thermal: { kind: 'sim' } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: false, sensorEscalationConsent: true, thermal: { kind: 'sim' } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: false, sensorEscalationConsent: false, thermal: { kind: 'sim' } })).toBe(true)
  })

  it('keeps real sources behind consent and their explicit activation policy', () => {
    expect(thermalStartsWithAi({ thermal: { kind: 'http', alwaysOn: true } })).toBe(true)
    expect(thermalStartsWithAi({ thermal: { kind: 'phone', alwaysOn: false } })).toBe(false)
    expect(thermalStartsWithAi({ thermal: { kind: 'phone', alwaysOn: true } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: false, sensorEscalationConsent: true, thermal: { kind: 'phone', alwaysOn: true } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: false, sensorEscalationConsent: false, thermal: { kind: 'phone', alwaysOn: true } })).toBe(false)
    expect(thermalSensorsEnabled({ sensorTestMode: true, autonomous: false, sensorEscalationConsent: false, thermal: { kind: 'phone', alwaysOn: true } })).toBe(true)
    expect(thermalSensorsEnabled({ autonomous: true, sensorEscalationConsent: true, thermal: { kind: 'http' } }, true)).toBe(true)
  })
})

describe('thermal camera', () => {
  it('sees a person, their posture and no identifiable imagery', () => {
    const a = analyzeThermalFrame(simulateFrame('still', 0, fixedRng), null)
    expect(a).toMatchObject({ presence: true, posture: 'upright', hazard: false })
  })

  it('sees nobody in an empty room', () => {
    expect(analyzeThermalFrame(simulateFrame('absent', 0, fixedRng), null).presence).toBe(false)
  })

  it('reports no anomaly for normal movement', () => {
    const r = runThermal('normal', 20)
    expect(r.events).toEqual([])
  })

  it('reports fever after consecutive hot frames', () => {
    expect(runThermal('fever', 6).events).toContain('fever')
  })

  it('reports a possible fall: drop to lying, then stillness', () => {
    const r = runThermal('fall', 15)
    expect(r.events).toContain('possible-fall')
    expect(r.active).toContain('possible-fall')
  })

  it('reports a heat hazard', () => {
    expect(runThermal('heat', 3).events).toContain('heat-hazard')
  })

  it('reports long stillness as no-motion', () => {
    expect(runThermal('still', 130).events).toContain('no-motion')
  })
})

describe('privacy guard', () => {
  it('keeps CCTV off and records nothing while all is normal', () => {
    const g = initialGuard()
    const r = stepGuard(g, { now: 1000, thermalActive: [] })
    expect(r.effects).toEqual([])
    expect(cctvAllowed(r.guard)).toBe(false)
    expect(recordingAllowed(r.guard)).toBe(false)
  })

  it('turns CCTV on for live analysis only when thermal sees an anomaly, without recording', () => {
    const r = stepGuard(initialGuard(), { now: 1000, thermalActive: ['fever'] })
    expect(r.effects).toEqual(['cctv-on'])
    expect(r.guard.mode).toBe(GUARD_MODE.verifying)
    expect(recordingAllowed(r.guard)).toBe(false)
  })

  it('turns CCTV back off with nothing saved when the anomaly clears', () => {
    let { guard } = stepGuard(initialGuard(), { now: 1000, thermalActive: ['fever'] })
    guard = stepGuard(guard, { now: 5000, thermalActive: [] }).guard
    const r = stepGuard(guard, { now: 36000, thermalActive: [] })
    expect(r.effects).toEqual(['cctv-off'])
    expect(r.guard.mode).toBe(GUARD_MODE.thermal)
  })

  it('stops watching if the patient answers but a mild flag lingers, and does not retrigger soon', () => {
    const { guard } = stepGuard(initialGuard(), { now: 0, thermalActive: ['fever'] })
    const off = stepGuard(guard, { now: 61000, thermalActive: ['fever'], responded: true })
    expect(off.effects).toEqual(['cctv-off'])
    expect(stepGuard(off.guard, { now: 120000, thermalActive: ['fever'] }).effects).toEqual([])
    expect(stepGuard(off.guard, { now: 120000, thermalActive: ['possible-fall'] }).effects).toEqual(['cctv-on'])
    expect(stepGuard(off.guard, { now: 700000, thermalActive: ['fever'] }).effects).toEqual(['cctv-on'])
  })

  it('starts recording and alerts once CCTV confirms the anomaly', () => {
    const { guard } = stepGuard(initialGuard(), { now: 1000, thermalActive: ['possible-fall'] })
    const r = stepGuard(guard, { now: 4000, thermalActive: ['possible-fall'], cctvEvents: ['possible-fall'] })
    expect(r.effects).toEqual(['start-recording', 'alert'])
    expect(recordingAllowed(r.guard)).toBe(true)
  })

  it('confirms a long-lasting thermal anomaly when the patient does not respond', () => {
    const { guard } = stepGuard(initialGuard(), { now: 1000, thermalActive: ['fever'] })
    expect(stepGuard(guard, { now: 25000, thermalActive: ['fever'], responded: true }).effects).toEqual([])
    expect(stepGuard(guard, { now: 25000, thermalActive: ['fever'] }).effects).toEqual(['start-recording', 'alert'])
  })

  it('stops recording and CCTV after the patient responds and things stay calm', () => {
    let { guard } = stepGuard(initialGuard(), { now: 0, thermalActive: ['fever'], cctvEvents: ['possible-fall'] })
    guard = stepGuard(guard, { now: 1000, thermalActive: ['fever'], cctvEvents: ['possible-fall'] }).guard
    expect(guard.mode).toBe(GUARD_MODE.recording)
    guard = stepGuard(guard, { now: 5000, responded: true }).guard
    const r = stepGuard(guard, { now: 70000, responded: true })
    expect(r.effects).toEqual(['stop-recording', 'cctv-off'])
  })
})

describe('thermal in assessSituation', () => {
  it('treats fever as a watch until CCTV confirms, then urgent', () => {
    expect(assessSituation({ thermal: ['fever'] }).level).toBe(LEVEL.watch)
    expect(assessSituation({ thermal: ['fever'], confirmed: true }).level).toBe(LEVEL.urgent)
  })

  it('treats a thermal fall like a camera fall, critical if the patient does not answer', () => {
    expect(assessSituation({ thermal: ['possible-fall'] }).actions.alertFamily).toBe(true)
    expect(assessSituation({ thermal: ['possible-fall'], missedCheckins: 1 }).actions.notifyHospital).toBe(true)
  })

  it('treats a heat hazard as urgent', () => {
    expect(assessSituation({ thermal: ['heat-hazard'] }).level).toBe(LEVEL.urgent)
  })
})

describe('emergency briefing', () => {
  it('contains everything a responder needs', () => {
    const text = buildBriefing({
      patient: { mrn: 'SMH-20481', dob: '2004-03-17', bloodGroup: 'B+', conditions: ['Hypertension monitoring'], allergies: ['Penicillin'] },
      patientName: 'Ananya Kumar', hospitalName: 'Sanjeevani', meds, reasons: ['a fall'], at: new Date(2026, 9, 13),
    })
    expect(text).toMatch(/Ananya Kumar, age 22/)
    expect(text).toMatch(/SMH-20481/)
    expect(text).toMatch(/B\+/)
    expect(text).toMatch(/Penicillin/)
    expect(text).toMatch(/Atorvastatin/)
    expect(text).toMatch(/a fall/)
  })
})

describe('motion analysis', () => {
  const run = (steps) => {
    let state = initialMotionState(0)
    const events = []
    for (const [score, t] of steps) {
      const r = stepMotion(state, score, t)
      state = r.state
      events.push(...r.events)
    }
    return events
  }

  it('measures frame difference', () => {
    expect(frameDifference([0, 0], [255, 255])).toBe(1)
    expect(frameDifference([10, 10], [10, 10])).toBe(0)
    expect(frameDifference([1], [1, 2])).toBe(0)
  })

  it('reports a possible fall: big burst followed by stillness', () => {
    expect(run([[0.3, 1000], [0.0, 5000], [0.0, 9500]])).toEqual(['possible-fall'])
  })

  it('does not report a fall if movement continues', () => {
    expect(run([[0.3, 1000], [0.1, 5000], [0.1, 9500]])).toEqual([])
  })

  it('reports inactivity after a long still period, once', () => {
    expect(run([[0, 60000], [0, 125000], [0, 130000]])).toEqual(['inactive'])
  })
})

describe('greeting intent', () => {
  it('a bare greeting is a greeting, a greeting plus a statement is not', async () => {
    const { detectIntent, detectMood } = await import('../src/companion/brain')
    expect(detectIntent('hello')).toBe('greeting')
    expect(detectIntent('Hello Asha')).toBe('greeting')
    expect(detectIntent('good morning!')).toBe('greeting')
    expect(detectIntent('Hello, I feel a bit tired today')).toBe('chat')
    expect(detectMood('Hello, I feel a bit tired today')).toBe('tired')
  })
})

describe('showing saved companion events', () => {
  it('handles events from the demo data that have no level or reasons', async () => {
    const { eventView, buildSnapshot } = await import('../src/companion/brain')
    expect(eventView({ id: 'evt-demo-1', kind: 'check-in', text: 'Morning wellbeing check completed', at: '2026-10-14T07:46:00.000Z' })).toEqual({ level: 0, text: 'Morning wellbeing check completed' })
    expect(eventView({ level: 2, reasons: ['a possible fall', 'no reply'] })).toEqual({ level: 2, text: 'a possible fall, no reply' })
    expect(eventView({ kind: 'check-in' }).text).toBe('check-in')
    expect(eventView(null)).toEqual({ level: 0, text: 'Event' })
    expect(eventView({ level: 9, reasons: [] }).level).toBe(0)
    const snap = buildSnapshot({ patient: { conditions: [], allergies: [], bloodGroup: 'A+' }, events: [{ id: 'x', kind: 'check-in', at: new Date().toISOString() }] })
    expect(snap.alerts24h).toBe(0)
  })
})
