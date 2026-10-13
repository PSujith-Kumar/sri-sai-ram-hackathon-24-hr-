import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data'
import { activeTokenFor, callNext, canManageQueue, issueToken, patientsToCheckIn, setQueuePaused } from '../src/queueOps'

const u = (id) => seedData.users.find(x => x.id === id)
const meera = u('u-meera'), arjun = u('u-arjun'), ananya = u('u-ananya')
const cleared = { ...seedData, tokens: seedData.tokens.map(t => ({ ...t, status: 'done' })) }

describe('QueueCare', () => {
  it('only the queue doctor or hospital staff manage a queue', () => {
    const q1 = seedData.queues[0]
    expect(canManageQueue(meera, q1)).toBe(true)
    expect(canManageQueue(arjun, q1)).toBe(false)
    expect(canManageQueue(u('u-dean'), q1)).toBe(true)
    expect(canManageQueue(ananya, q1)).toBe(false)
  })
  it('lists only patients without an active token', () => {
    expect(patientsToCheckIn(seedData, 'q1')).toEqual([])
    expect(patientsToCheckIn(cleared, 'q1').map(p => p.id)).toEqual(['p1', 'p2'])
  })
  it('issues the next token number and tells the patient and family', () => {
    const r = issueToken(cleared, 'q1', 'p1', meera)
    expect(r.ok).toBe(true)
    expect(r.token.number).toBe(29)
    expect(r.data.queues[0].lastIssued).toBe(29)
    expect(r.data.notifications[0].recipientIds).toEqual(['u-ananya', 'u-ravi'])
    expect(issueToken(r.data, 'q1', 'p1', meera).message).toMatch(/already has a token/)
    expect(issueToken(cleared, 'q1', 'p1', arjun).ok).toBe(false)
  })
  it('call next advances one at a time, finishes passed tokens, tells the called patient', () => {
    let d = seedData
    for (let i = 0; i < 5; i += 1) d = callNext(d, 'q1', meera).data
    expect(d.queues[0].serving).toBe(25)
    expect(d.tokens.find(t => t.id === 't1').status).toBe('serving')
    expect(d.notifications[0].recipientIds).toEqual(['u-ananya'])
    d = callNext(d, 'q1', meera).data
    expect(d.tokens.find(t => t.id === 't1').status).toBe('done')
    expect(activeTokenFor(d, 'p1')).toBeUndefined()
  })
  it('never calls past the last issued token and respects pause', () => {
    const atEnd = { ...seedData, queues: seedData.queues.map(q => (q.id === 'q1' ? { ...q, serving: 28 } : q)) }
    expect(callNext(atEnd, 'q1', meera)).toMatchObject({ ok: false, message: 'Nobody is waiting.' })
    const paused = setQueuePaused(seedData, 'q1', true, meera).data
    expect(callNext(paused, 'q1', meera).message).toMatch(/paused/)
    expect(setQueuePaused(seedData, 'q1', true, arjun).ok).toBe(false)
  })
})
