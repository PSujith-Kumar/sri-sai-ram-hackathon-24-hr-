import { describe, expect, it } from 'vitest'
import { GUARD_CONFIG, GUARD_MODE, cctvAllowed, initialGuard, recordingAllowed, stepGuard } from '../src/companion/privacy'

const start = (soft = ['voice-change'], now = 1000) => stepGuard(initialGuard(), { now, thermalActive: [], softEvents: soft })

describe('switching to the normal camera on a change of tone', () => {
  it('a soft signal turns the camera on for a look, but nothing is recorded', () => {
    const r = start()
    expect(r.effects).toEqual(['cctv-on'])
    expect(r.guard).toMatchObject({ mode: GUARD_MODE.verifying, reasons: ['voice-change'] })
    expect(cctvAllowed(r.guard)).toBe(true)
    expect(recordingAllowed(r.guard)).toBe(false)
  })
  it('without a soft signal the camera stays off', () => {
    expect(stepGuard(initialGuard(), { now: 1000, thermalActive: [], softEvents: [] }).effects).toEqual([])
  })
  it('a soft signal alone never confirms an incident, however long the camera looks', () => {
    let { guard } = start()
    const effects = []
    for (let t = 2000; t < 25000; t += 1000) effects.push(...stepGuard(guard, { now: t, thermalActive: [], softEvents: [] }).effects)
    expect(effects).not.toContain('start-recording')
    expect(effects).not.toContain('alert')
  })
  it('if all is calm the camera goes off again by itself (hold time, then calm time)', () => {
    let { guard } = start(['voice-change'], 0)
    guard = stepGuard(guard, { now: GUARD_CONFIG.softHoldMs - 1, thermalActive: [] }).guard
    expect(guard.mode).toBe(GUARD_MODE.verifying)
    const calmStart = stepGuard(guard, { now: GUARD_CONFIG.softHoldMs + 1, thermalActive: [] })
    expect(calmStart.effects).toEqual([])
    const off = stepGuard(calmStart.guard, { now: GUARD_CONFIG.softHoldMs + 1 + GUARD_CONFIG.calmBeforeCctvOffMs, thermalActive: [] })
    expect(off.effects).toEqual(['cctv-off'])
    expect(off.guard.mode).toBe(GUARD_MODE.thermal)
  })
  it('another concern while looking keeps the camera on longer', () => {
    let { guard } = start(['voice-change'], 0)
    guard = stepGuard(guard, { now: 25000, thermalActive: [], softEvents: ['mood-distress'] }).guard
    expect(guard.reasons).toEqual(['voice-change', 'mood-distress'])
    expect(stepGuard(guard, { now: 50000, thermalActive: [] }).guard.mode).toBe(GUARD_MODE.verifying)
    expect(stepGuard(guard, { now: 50000, thermalActive: [] }).guard.calmSince).toBeNull()
  })
  it('when the camera itself sees something (Gemma 3 vision), it is confirmed: recording and alerts start', () => {
    const { guard } = start()
    const r = stepGuard(guard, { now: 5000, thermalActive: [], cctvEvents: ['possible-fall'] })
    expect(r.effects).toEqual(['start-recording', 'alert'])
    expect(recordingAllowed(r.guard)).toBe(true)
    expect(r.guard.reasons).toContain('possible-fall')
  })
  it('thermal and tone together: both are named, and thermal can still confirm as before', () => {
    const r = stepGuard(initialGuard(), { now: 0, thermalActive: ['no-motion'], softEvents: ['voice-change'] })
    expect(r.guard.reasons).toEqual(['no-motion', 'voice-change'])
    const later = stepGuard(r.guard, { now: GUARD_CONFIG.confirmAfterMs, thermalActive: ['no-motion'] })
    expect(later.effects).toEqual(['start-recording', 'alert'])
  })
  it('while recording, a fresh soft signal keeps it from winding down', () => {
    let { guard } = stepGuard(initialGuard(), { now: 0, thermalActive: ['possible-fall'], cctvEvents: ['possible-fall'] })
    guard = stepGuard(guard, { now: 1000, thermalActive: [], cctvEvents: ['possible-fall'] }).guard
    expect(guard.mode).toBe(GUARD_MODE.recording)
    guard = stepGuard(guard, { now: 2000, thermalActive: [] }).guard
    expect(guard.calmSince).toBe(2000)
    expect(stepGuard(guard, { now: 3000, thermalActive: [], softEvents: ['voice-change'] }).guard.calmSince).toBeNull()
  })
})
