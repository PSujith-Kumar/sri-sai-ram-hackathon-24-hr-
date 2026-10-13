// Appointment rules as pure functions: doctors book, change and cancel consultations for their own patients;
// patients (and family with queue access) see them and a patient can cancel their own. Nothing is mutated.
//
// Appointment shape: { id, patientId, doctorId, hospitalId, departmentId, date 'YYYY-MM-DD', time 'HH:MM', status, reason? }
// Statuses: scheduled, checked-in, completed, cancelled.

import { addNotification, localDate } from './careFlow'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const clean = (v) => String(v ?? '').trim()
export const STATUSES = ['scheduled', 'checked-in', 'completed', 'cancelled']
export const REASON_LIMIT = 100
export const isOpen = (a) => a.status === 'scheduled' || a.status === 'checked-in'

const isClinician = (user) => ['doctor', 'head'].includes(user?.role)
export const canBook = (user, patient) => Boolean(isClinician(user) && patient?.doctorIds.includes(user.id))

const fmtWhen = (a) => `${new Date(`${a.date}T${a.time}`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${new Date(`2026-01-01T${a.time}`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
const familyIds = (patient) => patient.familyLinks.filter(l => l.status === 'approved' && l.permissions.includes('queue')).map(l => l.userId)

/** Appointments this person may see, soonest first: doctors see their own, patients theirs, family those of their linked patient. */
export function appointmentsFor(data, user, patients) {
  const ids = new Set(patients.map(p => p.id))
  return data.appointments
    .filter(a => ids.has(a.patientId) && (!isClinician(user) || a.doctorId === user.id))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}

export function validateAppointment(data, form, actor, { today = localDate(), ignoreId = null } = {}) {
  const errors = {}
  const patient = data.patients.find(p => p.id === form.patientId)
  if (!patient) errors.patientId = 'Choose a patient.'
  else if (!canBook(actor, patient)) errors.patientId = 'You can book only your own patients.'
  const date = clean(form.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) errors.date = 'Choose the date.'
  else if (date < today) errors.date = 'The date cannot be in the past.'
  const time = clean(form.time)
  if (!TIME.test(time)) errors.time = 'Choose the time.'
  else if (!errors.date && data.appointments.some(a => a.id !== ignoreId && a.doctorId === actor.id && a.date === date && a.time === time && a.status !== 'cancelled')) errors.time = 'You already have an appointment at this time.'
  if (clean(form.reason).length > REASON_LIMIT) errors.reason = `Keep the reason under ${REASON_LIMIT} characters.`
  return { errors, ok: Object.keys(errors).length === 0 }
}

export function bookAppointment(data, form, actor, { id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, today = localDate() } = {}) {
  const check = validateAppointment(data, form, actor, { today })
  if (!check.ok) return { ok: false, errors: check.errors }
  const patient = data.patients.find(p => p.id === form.patientId)
  const appointment = {
    id, patientId: patient.id, doctorId: actor.id, hospitalId: patient.hospitalId, departmentId: actor.departmentId || null,
    date: clean(form.date), time: clean(form.time), status: 'scheduled', ...(clean(form.reason) ? { reason: clean(form.reason) } : {}),
  }
  const next = { ...data, appointments: [...data.appointments, appointment] }
  return { ok: true, appointment, data: addNotification(next, { message: `${actor.name} booked an appointment for ${fmtWhen(appointment)}`, recipientIds: [patient.userId, ...familyIds(patient)], page: 'appointments' }) }
}

/** Doctors move an appointment along; a patient may only cancel their own scheduled one. */
export function setAppointmentStatus(data, appointmentId, status, actor) {
  const appointment = data.appointments.find(a => a.id === appointmentId)
  const patient = appointment && data.patients.find(p => p.id === appointment.patientId)
  if (!appointment || !STATUSES.includes(status)) return { ok: false, message: 'Appointment not found.' }
  const doctorMay = isClinician(actor) && appointment.doctorId === actor.id
  const patientMay = patient.userId === actor.id && status === 'cancelled' && appointment.status === 'scheduled'
  if (!doctorMay && !patientMay) return { ok: false, message: 'You cannot change this appointment.' }
  if (appointment.status === status) return { ok: true, data }
  const next = { ...data, appointments: data.appointments.map(a => (a.id === appointmentId ? { ...a, status } : a)) }
  const recipients = doctorMay ? [patient.userId, ...familyIds(patient)] : [appointment.doctorId]
  const verb = { cancelled: 'cancelled', 'checked-in': 'checked in for', completed: 'completed', scheduled: 'rescheduled' }[status]
  return { ok: true, data: addNotification(next, { message: `${actor.name} ${verb} the appointment on ${fmtWhen(appointment)}`, recipientIds: recipients.filter(id => id !== actor.id), page: 'appointments' }) }
}
