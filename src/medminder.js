// MedMinder rules as pure functions (no React): who may schedule medicines for a patient, validation,
// add / edit / delete, marking doses, and who gets notified. Every function returns new data; nothing is mutated.
//
//  * The patient's assigned doctor can schedule, edit and delete any medicine for that patient.
//  * An approved family caregiver (with the "medications" permission) can schedule medicines, and can edit
//    and delete only the ones they added, never a doctor's prescription.
//  * Only the patient marks doses taken or skipped. Doses are tracked per day.

import { addNotification, localDate } from './careFlow'

export const LIMITS = { name: 60, dose: 60, note: 120, days: 365 }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const clean = (v) => String(v ?? '').trim()
const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

export const isClinician = (user) => ['doctor', 'head'].includes(user?.role)
const medicationLink = (patient, userId) => patient?.familyLinks?.find(l => l.userId === userId && l.status === 'approved' && l.permissions.includes('medications'))

export const formatTime = (hhmm) => new Date(`2026-01-01T${hhmm}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

// ------------------------------------------------------------------ permissions

/** May this person add medicines to this patient's schedule? */
export const canSchedule = (user, patient) => Boolean(patient && user && ((isClinician(user) && patient.doctorIds.includes(user.id)) || (user.role === 'family' && medicationLink(patient, user.id))))

/** May this person edit or delete this particular medicine? Doctors: any of their patient's. Family: only their own. */
export const canModify = (user, patient, med) => Boolean(patient && med && user && ((isClinician(user) && patient.doctorIds.includes(user.id)) || (user.role === 'family' && medicationLink(patient, user.id) && med.scheduledBy === user.id)))

/** Only the patient confirms whether a dose was taken. */
export const canMarkDose = (user, patient) => Boolean(patient && user && patient.userId === user.id)

/** "Prescribed by Dr. X" / "Added by Ravi (family)" / older entries with no author. */
export function scheduledByLabel(med) {
  if (!med.scheduledBy) return 'Existing prescription'
  return ['doctor', 'head'].includes(med.scheduledByRole) ? `Prescribed by ${med.scheduledByName}` : `Added by ${med.scheduledByName} (family)`
}

// ------------------------------------------------------------------ dates and status

export function endDateFromDays(days, today = localDate()) {
  const n = Number(days)
  if (!Number.isInteger(n) || n < 1) return null
  const [y, m, d] = today.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n - 1)) // "for 5 days" includes today
}

export const isActive = (med, today = localDate()) => !med.endDate || med.endDate >= today
/** The dose status for today: yesterday's "taken" does not count today. */
export const statusToday = (med, today = localDate()) => (med.statusDate && med.statusDate !== today ? 'unconfirmed' : med.status)

export function scheduleFor(data, patientId, today = localDate()) {
  const all = data.medications.filter(m => m.patientId === patientId).map(m => ({ ...m, today: statusToday(m, today) }))
  const byTime = (a, b) => a.time.localeCompare(b.time)
  return { active: all.filter(m => isActive(m, today)).sort(byTime), ended: all.filter(m => !isActive(m, today)).sort(byTime) }
}

export const adherenceToday = (meds) => ({ taken: meds.filter(m => m.today === 'taken').length, skipped: meds.filter(m => m.today === 'skipped').length, pending: meds.filter(m => m.today === 'unconfirmed').length })

// ------------------------------------------------------------------ validation

export function validateMedication(form, { existing = [], ignoreId = null } = {}) {
  const errors = {}
  const name = clean(form.name)
  if (name.length < 2) errors.name = 'Enter the medicine name.'
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`
  const dose = clean(form.instruction)
  if (!dose) errors.instruction = 'Enter the dose, for example "1 tablet".'
  else if (dose.length > LIMITS.dose) errors.instruction = `Keep the dose under ${LIMITS.dose} characters.`
  if (!TIME.test(clean(form.time))) errors.time = 'Choose the time of day.'
  else if (name.length >= 2 && existing.some(m => m.id !== ignoreId && sameText(m.name, name) && m.time === clean(form.time))) errors.time = 'This medicine is already scheduled at this time.'
  if (clean(form.note).length > LIMITS.note) errors.note = `Keep the note under ${LIMITS.note} characters.`
  const days = clean(form.days)
  if (days && !(Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= LIMITS.days)) errors.days = `Enter a number of days from 1 to ${LIMITS.days}, or leave empty.`
  return { errors, ok: Object.keys(errors).length === 0 }
}

// ------------------------------------------------------------------ notifications

const familyWithAccess = (patient) => patient.familyLinks.filter(l => l.status === 'approved' && l.permissions.includes('medications')).map(l => l.userId)
const notifyAbout = (data, patient, actor, message) => {
  const recipients = isClinician(actor) ? [patient.userId, ...familyWithAccess(patient)] : [patient.userId, ...patient.doctorIds, ...familyWithAccess(patient)]
  return addNotification(data, { message, recipientIds: recipients.filter(id => id !== actor.id), page: 'medications' })
}

const refuse = (message) => ({ ok: false, error: 'not-allowed', message })
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

// ------------------------------------------------------------------ operations

export function addMedication(data, form, patientId, actor, { id = newId(), now = new Date() } = {}) {
  const patient = data.patients.find(p => p.id === patientId)
  if (!canSchedule(actor, patient)) return refuse('You can schedule medicines only for patients you care for.')
  const check = validateMedication(form, { existing: data.medications.filter(m => m.patientId === patientId) })
  if (!check.ok) return { ok: false, errors: check.errors }
  const today = localDate(now)
  const endDate = endDateFromDays(form.days, today)
  const medication = {
    id, patientId, name: clean(form.name), instruction: clean(form.instruction), time: clean(form.time), note: clean(form.note),
    status: 'unconfirmed', statusDate: today, scheduledBy: actor.id, scheduledByRole: actor.role, scheduledByName: actor.name, createdAt: now.toISOString(),
    ...(endDate ? { endDate } : {}),
  }
  const withMed = { ...data, medications: [...data.medications, medication] }
  return { ok: true, medication, data: notifyAbout(withMed, patient, actor, `${actor.name} scheduled ${medication.name} (${medication.instruction}) at ${formatTime(medication.time)}`) }
}

export function updateMedication(data, medId, form, actor, { now = new Date() } = {}) {
  const med = data.medications.find(m => m.id === medId)
  const patient = med && data.patients.find(p => p.id === med.patientId)
  if (!canModify(actor, patient, med)) return refuse('You can only change medicines you are allowed to manage.')
  const check = validateMedication(form, { existing: data.medications.filter(m => m.patientId === med.patientId), ignoreId: medId })
  if (!check.ok) return { ok: false, errors: check.errors }
  const today = localDate(now)
  const next = { ...med, name: clean(form.name), instruction: clean(form.instruction), time: clean(form.time), note: clean(form.note), updatedBy: actor.id, updatedAt: now.toISOString() }
  const endDate = endDateFromDays(form.days, today)
  if (endDate) next.endDate = endDate; else delete next.endDate
  // a changed medicine, dose or time is a new instruction: yesterday's confirmation no longer applies
  if (next.name !== med.name || next.instruction !== med.instruction || next.time !== med.time) { next.status = 'unconfirmed'; next.statusDate = today }
  const updated = { ...data, medications: data.medications.map(m => (m.id === medId ? next : m)) }
  return { ok: true, medication: next, data: notifyAbout(updated, patient, actor, `${actor.name} updated ${next.name} (${next.instruction}) to ${formatTime(next.time)}`) }
}

export function deleteMedication(data, medId, actor) {
  const med = data.medications.find(m => m.id === medId)
  const patient = med && data.patients.find(p => p.id === med.patientId)
  if (!canModify(actor, patient, med)) return refuse('You can only remove medicines you are allowed to manage.')
  const without = { ...data, medications: data.medications.filter(m => m.id !== medId) }
  return { ok: true, medication: med, data: notifyAbout(without, patient, actor, `${actor.name} removed ${med.name} from the schedule`) }
}

export function setDoseStatus(data, medId, status, actor, { now = new Date() } = {}) {
  const med = data.medications.find(m => m.id === medId)
  const patient = med && data.patients.find(p => p.id === med.patientId)
  if (!['taken', 'skipped', 'unconfirmed'].includes(status)) return refuse('Unknown dose status.')
  if (!canMarkDose(actor, patient)) return refuse('Only the patient can mark a dose.')
  const marked = { ...data, medications: data.medications.map(m => (m.id === medId ? { ...m, status, statusDate: localDate(now) } : m)) }
  if (status !== 'skipped') return { ok: true, data: marked }
  // a skipped dose matters to the people who look after the patient
  const recipients = [...patient.doctorIds, ...familyWithAccess(patient)].filter(id => id !== actor.id)
  return { ok: true, data: addNotification(marked, { message: `${actor.name} skipped ${med.name} (${formatTime(med.time)})`, recipientIds: recipients, page: 'medications', type: 'warning' }) }
}
