// CareCircle rules as pure functions: check-ins from the patient, acknowledgements from family, and the
// patient's control over who in the family may see what. Every function returns new data; nothing is mutated.

import { addNotification } from './careFlow'

export const FAMILY_PERMISSIONS = [
  ['queue', 'Queue and appointments'],
  ['medications', 'Medicines'],
  ['care', 'CareCircle updates'],
  ['records', 'Shared reports'],
]
const PERMISSION_IDS = FAMILY_PERMISSIONS.map(([id]) => id)

/** Approved family link of this person to this patient, or undefined. */
export const familyLink = (patient, userId) => patient?.familyLinks?.find(l => l.userId === userId && l.status === 'approved')

/** May this person see this part of the patient's care? Only family are limited; other roles are decided elsewhere. */
export const familyMay = (user, patient, permission) => user?.role !== 'family' || Boolean(familyLink(patient, user.id)?.permissions.includes(permission))

const careRecipients = (patient) => patient.familyLinks.filter(l => l.status === 'approved' && l.permissions.includes('care')).map(l => l.userId)

/** A patient check-in: "I'm okay", "Please call me", "I need help". Family hear about every one; doctors hear about urgent ones. */
export function sendCareRequest(data, patientId, text, priority, { now = new Date(), id = `c${now.getTime()}` } = {}) {
  const patient = data.patients.find(p => p.id === patientId)
  if (!patient) return { ok: false, message: 'Patient not found.' }
  const patientUser = data.users.find(u => u.id === patient.userId)
  const request = { id, patientId, text, priority, status: 'waiting', createdAt: now.toISOString() }
  const withRequest = { ...data, careRequests: [request, ...(data.careRequests || [])] }
  const urgent = priority === 'high'
  const recipients = urgent ? [...careRecipients(patient), ...patient.doctorIds] : careRecipients(patient)
  const notified = addNotification(withRequest, {
    message: `${patientUser?.name || 'Your patient'}: "${text}"`, recipientIds: recipients, page: 'care', type: urgent ? 'warning' : 'info', createdAt: now.toISOString(),
  })
  return { ok: true, request, recipients, data: notified }
}

/** A family member lets the patient know they have seen a check-in. */
export function acknowledgeRequest(data, requestId, actor) {
  const request = data.careRequests.find(r => r.id === requestId)
  const patient = request && data.patients.find(p => p.id === request.patientId)
  if (!patient || !familyLink(patient, actor.id)?.permissions.includes('care')) return { ok: false, message: 'You cannot answer this update.' }
  if (request.status === 'acknowledged') return { ok: true, data }
  const next = { ...data, careRequests: data.careRequests.map(r => (r.id === requestId ? { ...r, status: 'acknowledged', acknowledgedBy: actor.id } : r)) }
  return { ok: true, data: addNotification(next, { message: `${actor.name} saw your update "${request.text}"`, recipientIds: [patient.userId], page: 'care' }) }
}

const ownPatient = (data, patientId, actor) => {
  const patient = data.patients.find(p => p.id === patientId)
  return patient && patient.userId === actor.id ? patient : null
}
const mapLinks = (data, patientId, userId, change) => ({
  ...data, patients: data.patients.map(p => (p.id === patientId ? { ...p, familyLinks: p.familyLinks.map(l => (l.userId === userId ? change(l) : l)) } : p)),
})

/** Only the patient decides whether a family member may see their care. */
export function setFamilyAccess(data, patientId, userId, approved, actor) {
  const patient = ownPatient(data, patientId, actor)
  const link = patient?.familyLinks.find(l => l.userId === userId)
  if (!link) return { ok: false, message: 'Only the patient can change family access.' }
  const status = approved ? 'approved' : 'revoked'
  if (link.status === status) return { ok: true, data }
  const next = mapLinks(data, patientId, userId, l => ({ ...l, status }))
  return { ok: true, data: addNotification(next, { message: approved ? `${actor.name} shared their care with you again` : `${actor.name} stopped sharing their care with you`, recipientIds: [userId], page: 'dashboard' }) }
}

/** Switch one kind of access on or off for one family member. */
export function setFamilyPermission(data, patientId, userId, permission, allowed, actor) {
  const patient = ownPatient(data, patientId, actor)
  const link = patient?.familyLinks.find(l => l.userId === userId)
  if (!link || !PERMISSION_IDS.includes(permission)) return { ok: false, message: 'Only the patient can change family access.' }
  const has = link.permissions.includes(permission)
  if (has === allowed) return { ok: true, data }
  const permissions = allowed ? [...link.permissions, permission] : link.permissions.filter(x => x !== permission)
  return { ok: true, data: mapLinks(data, patientId, userId, l => ({ ...l, permissions })) }
}
