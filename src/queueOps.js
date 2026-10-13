// QueueCare rules as pure functions: issuing a token to a patient, calling the next patient, and
// which tokens are still active. Every function returns new data; nothing is mutated.

import { addNotification } from './careFlow'

const ACTIVE = ['waiting', 'serving']
export const isActiveToken = (token) => ACTIVE.includes(token.status)

const pad = (n) => String(n).padStart(3, '0')

/** May this person run this queue? The doctor who owns it, or hospital staff (admin, dean, head) of that hospital. */
export function canManageQueue(user, queue) {
  if (!user || !queue) return false
  if (user.role === 'admin') return true
  if (user.role === 'doctor') return queue.doctorId === user.id
  return ['dean', 'head'].includes(user.role) && user.hospitalIds.includes(queue.hospitalId)
}

/** Patients of this queue's hospital who do not already hold an active token (in any queue). */
export function patientsToCheckIn(data, queueId) {
  const queue = data.queues.find(q => q.id === queueId)
  if (!queue) return []
  const busy = new Set(data.tokens.filter(isActiveToken).map(t => t.patientId))
  return data.patients.filter(p => p.hospitalId === queue.hospitalId && !busy.has(p.id))
}

/** The patient's current token, if any. */
export const activeTokenFor = (data, patientId) => data.tokens.find(t => t.patientId === patientId && isActiveToken(t))

export function issueToken(data, queueId, patientId, actor, { now = new Date(), id = `t${now.getTime()}` } = {}) {
  const queue = data.queues.find(q => q.id === queueId)
  if (!canManageQueue(actor, queue)) return { ok: false, message: 'You cannot run this queue.' }
  const patient = data.patients.find(p => p.id === patientId)
  if (!patient || patient.hospitalId !== queue.hospitalId) return { ok: false, message: 'Choose a patient of this hospital.' }
  if (activeTokenFor(data, patientId)) return { ok: false, message: 'This patient already has a token.' }
  const number = queue.lastIssued + 1
  const token = { id, queueId, patientId, number, status: 'waiting', createdAt: now.toISOString() }
  const next = {
    ...data,
    queues: data.queues.map(q => (q.id === queueId ? { ...q, lastIssued: number, updatedAt: now.toISOString() } : q)),
    tokens: [...data.tokens, token],
  }
  const ahead = Math.max(0, number - queue.serving - 1)
  const familyIds = patient.familyLinks.filter(l => l.status === 'approved' && l.permissions.includes('queue')).map(l => l.userId)
  return {
    ok: true, token,
    data: addNotification(next, { message: `You are checked in: token CAR-${pad(number)}, ${ahead} ${ahead === 1 ? 'person' : 'people'} ahead`, recipientIds: [patient.userId, ...familyIds], page: 'queue', type: 'queue', createdAt: now.toISOString() }),
  }
}

/** Call the next patient. Never moves past the last token issued. Tokens already passed are finished. */
export function callNext(data, queueId, actor, { now = new Date() } = {}) {
  const queue = data.queues.find(q => q.id === queueId)
  if (!canManageQueue(actor, queue)) return { ok: false, message: 'You cannot run this queue.' }
  if (queue.paused) return { ok: false, message: 'The queue is paused.' }
  if (queue.serving >= queue.lastIssued) return { ok: false, message: 'Nobody is waiting.' }
  const serving = queue.serving + 1
  const next = {
    ...data,
    queues: data.queues.map(q => (q.id === queueId ? { ...q, serving, updatedAt: now.toISOString() } : q)),
    tokens: data.tokens.map(t => {
      if (t.queueId !== queueId || !isActiveToken(t)) return t
      if (t.number < serving) return { ...t, status: 'done' }
      return t.number === serving ? { ...t, status: 'serving' } : t
    }),
  }
  const called = data.tokens.find(t => t.queueId === queueId && t.number === serving && isActiveToken(t))
  const patient = called && data.patients.find(p => p.id === called.patientId)
  const withTurn = patient
    ? addNotification(next, { message: `It is your turn: token CAR-${pad(serving)}`, recipientIds: [patient.userId], page: 'queue', type: 'queue', createdAt: now.toISOString() })
    : next
  return { ok: true, serving, data: withTurn }
}

export function setQueuePaused(data, queueId, paused, actor, { now = new Date() } = {}) {
  const queue = data.queues.find(q => q.id === queueId)
  if (!canManageQueue(actor, queue)) return { ok: false, message: 'You cannot run this queue.' }
  return { ok: true, data: { ...data, queues: data.queues.map(q => (q.id === queueId ? { ...q, paused, updatedAt: now.toISOString() } : q)) } }
}
