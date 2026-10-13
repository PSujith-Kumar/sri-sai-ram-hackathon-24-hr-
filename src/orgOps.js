// Department management as pure functions: validate and add a department to a hospital, and remove an empty one.
// Department shape: { id, hospitalId, name, floor, room, headId, staff, icon }. Nothing is mutated.

const clean = (v) => String(v ?? '').trim()
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

export const canManageDepartments = (actor, hospitalId) => Boolean(actor && (actor.role === 'admin' || (actor.role === 'dean' && actor.hospitalIds.includes(hospitalId))))
export const DEPARTMENT_LIMITS = { name: 60, place: 20, staff: 500 }

export function validateDepartment(data, form, hospitalId) {
  const errors = {}
  const name = clean(form.name)
  if (name.length < 2) errors.name = 'Enter the department name.'
  else if (name.length > DEPARTMENT_LIMITS.name) errors.name = `Keep the name under ${DEPARTMENT_LIMITS.name} characters.`
  else if (data.departments.some(d => d.hospitalId === hospitalId && same(d.name, name))) errors.name = 'This hospital already has a department with this name.'
  if (!clean(form.floor)) errors.floor = 'Enter the floor.'
  else if (clean(form.floor).length > DEPARTMENT_LIMITS.place) errors.floor = 'Keep the floor short.'
  if (!clean(form.room)) errors.room = 'Enter the room.'
  else if (clean(form.room).length > DEPARTMENT_LIMITS.place) errors.room = 'Keep the room short.'
  const staff = Number(clean(form.staff))
  if (!Number.isInteger(staff) || staff < 1 || staff > DEPARTMENT_LIMITS.staff) errors.staff = `Enter a team size from 1 to ${DEPARTMENT_LIMITS.staff}.`
  const head = data.users.find(u => u.id === form.headId)
  if (!head || !['doctor', 'head', 'dean'].includes(head.role) || !head.hospitalIds.includes(hospitalId)) errors.headId = 'Choose a doctor or leader of this hospital as the head.'
  return { errors, ok: Object.keys(errors).length === 0 }
}

export function addDepartment(data, form, hospitalId, actor, { id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` } = {}) {
  if (!canManageDepartments(actor, hospitalId)) return { ok: false, errors: { name: 'You cannot change this hospital.' } }
  if (!data.hospitals.some(h => h.id === hospitalId)) return { ok: false, errors: { name: 'Hospital not found.' } }
  const check = validateDepartment(data, form, hospitalId)
  if (!check.ok) return { ok: false, errors: check.errors }
  const department = { id, hospitalId, name: clean(form.name), floor: clean(form.floor), room: clean(form.room), headId: form.headId, staff: Number(clean(form.staff)), icon: 'stethoscope' }
  return { ok: true, department, data: { ...data, departments: [...data.departments, department] } }
}

/** What stops a department from being removed (people, queues, appointments), empty when it is safe. */
export function departmentBlockers(data, departmentId) {
  const blockers = []
  const people = data.users.filter(u => u.departmentId === departmentId).length
  const queues = data.queues.filter(q => q.departmentId === departmentId).length
  const appointments = data.appointments.filter(a => a.departmentId === departmentId).length
  if (people) blockers.push(`${people} ${people === 1 ? 'person works' : 'people work'} in it`)
  if (queues) blockers.push(`${queues} ${queues === 1 ? 'queue uses' : 'queues use'} it`)
  if (appointments) blockers.push(`${appointments} ${appointments === 1 ? 'appointment is' : 'appointments are'} booked in it`)
  return blockers
}

export function removeDepartment(data, departmentId, actor) {
  const department = data.departments.find(d => d.id === departmentId)
  if (!department) return { ok: false, message: 'Department not found.' }
  if (!canManageDepartments(actor, department.hospitalId)) return { ok: false, message: 'You cannot change this hospital.' }
  const blockers = departmentBlockers(data, departmentId)
  if (blockers.length) return { ok: false, message: `${department.name} cannot be removed yet: ${blockers.join('; ')}.` }
  return { ok: true, department, data: { ...data, departments: data.departments.filter(d => d.id !== departmentId) } }
}
