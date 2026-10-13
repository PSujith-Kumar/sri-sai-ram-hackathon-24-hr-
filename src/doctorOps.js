// Doctor-side patient intake as pure functions: register a brand-new patient, or take on an existing
// hospital patient who has no doctor yet. Both assign the patient to the acting doctor. Nothing is mutated.

import { createUser } from './adminOps'
import { addNotification } from './careFlow'

export const canAddPatients = (actor) => ['doctor', 'head'].includes(actor?.role)

/** Patients in the doctor's hospital that no doctor looks after yet. */
export const unassignedPatients = (data, actor) =>
  data.patients.filter(p => actor.hospitalIds.includes(p.hospitalId) && p.doctorIds.length === 0)

/** Register a new patient (creates their sign-in and patient record) under this doctor. */
export function registerPatient(data, form, actor, options) {
  if (!canAddPatients(actor)) return { ok: false, errors: { role: 'Only doctors can add patients here.' } }
  const result = createUser(data, { ...form, role: 'patient', hospitalId: actor.hospitalIds[0], doctorId: actor.id }, actor, options)
  if (!result.ok) return result
  return { ...result, data: addNotification(result.data, { message: `${actor.name} added you as their patient`, recipientIds: [result.user.id], page: 'dashboard' }) }
}

/** Take on an existing patient who currently has no doctor. */
export function takeOnPatient(data, patientId, actor) {
  if (!canAddPatients(actor)) return { ok: false, message: 'Only doctors can take on patients.' }
  const patient = data.patients.find(p => p.id === patientId)
  if (!patient || !actor.hospitalIds.includes(patient.hospitalId)) return { ok: false, message: 'This patient is not at your hospital.' }
  if (patient.doctorIds.includes(actor.id)) return { ok: false, message: 'This patient is already yours.' }
  if (patient.doctorIds.length > 0) return { ok: false, message: 'This patient already has a doctor. Ask your hospital to reassign them.' }
  const next = { ...data, patients: data.patients.map(p => (p.id === patientId ? { ...p, doctorIds: [actor.id] } : p)) }
  return { ok: true, patient, data: addNotification(next, { message: `${actor.name} is now your doctor`, recipientIds: [patient.userId], page: 'dashboard' }) }
}
