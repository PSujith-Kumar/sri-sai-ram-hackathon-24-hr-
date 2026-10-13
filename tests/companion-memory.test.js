import { describe, expect, it } from 'vitest'
import { analyzeUtterance, LEVEL } from '../src/companion/brain'
import { DEFAULT_PROFILE, EMERGENCY_NUMBERS, MEMORY_RETENTION_DAYS } from '../src/companion/config'
import { appendConversationMemory, avoidRepeatedResponse, conversationSignals, pruneConversationMemory, responseSimilarity } from '../src/companion/memory'
import { recoveryReply, RESPONSE_REPLAY_DATASET } from '../src/companion/trainingData'

describe('patient-specific 30-day memory', () => {
  const now = new Date('2026-10-13T12:00:00.000Z').getTime()
  const message = (id, daysAgo, role = 'patient', text = id) => ({ id, role, text, createdAt: new Date(now - daysAgo * 86400000).toISOString() })

  it('keeps only valid messages from the most recent 30 days', () => {
    expect(MEMORY_RETENTION_DAYS).toBe(30)
    expect(pruneConversationMemory([message('old', 31), message('edge', 30), message('new', 2), { id: 'bad', createdAt: 'invalid' }], now).map(item => item.id)).toEqual(['edge', 'new'])
  })

  it('appends while enforcing retention', () => {
    const result = appendConversationMemory([message('old', 40)], message('now', 0), now)
    expect(result.map(item => item.id)).toEqual(['now'])
  })

  it('detects similar replies and selects a fresh alternative', () => {
    const previous = [{ role: 'ai', text: 'I am here with you. Tell me what you need right now.' }]
    const repeated = 'I am here with you; tell me what you need right now.'
    expect(responseSimilarity(previous[0].text, repeated)).toBeGreaterThan(0.7)
    expect(avoidRepeatedResponse(repeated, previous, ['Let us try a different approach.'])).toBe('Let us try a different approach.')
  })

  it('uses recent patient language only as a non-diagnostic conversation signal', () => {
    const signals = conversationSignals([
      message('1', 0, 'patient', 'Please stop repeating that, it makes me angry.'),
      message('2', 0, 'patient', 'This is repeating and annoying.'),
    ])
    expect(signals).toMatchObject({ suggestedTone: 'brief' })
    expect(signals.label).toMatch(/shorter/)
  })
})

describe('response repair and emergency safety defaults', () => {
  it('ships reviewed replacements for harmful reply patterns', () => {
    expect(RESPONSE_REPLAY_DATASET.length).toBeGreaterThanOrEqual(10)
    expect(recoveryReply('anger')).toMatch(/sorry/i)
    expect(recoveryReply('repetitive')).toMatch(/repeated/i)
  })

  it('requires explicit sensor consent and never enables it by default', () => {
    expect(DEFAULT_PROFILE.sensorEscalationConsent).toBe(false)
    expect(DEFAULT_PROFILE.memoryEnabled).toBe(true)
  })

  it('uses verified India emergency and mental-health support numbers', () => {
    expect(EMERGENCY_NUMBERS).toEqual({ india: '112', teleManas: '14416' })
    expect(Object.values(EMERGENCY_NUMBERS)).not.toContain('*123#')
  })

  it('treats an explicit panic statement as urgent so the care circle can be notified', () => {
    const analysis = analyzeUtterance('I am panicking and need you')
    expect(analysis.level).toBeGreaterThanOrEqual(LEVEL.urgent)
    expect(analysis.codes).toContain('ML')
  })
})
