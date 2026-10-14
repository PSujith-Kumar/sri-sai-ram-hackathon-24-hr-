// Admin operations as pure functions (no React, no browser): easy to test and safe to reason about.
//   1. Hospital maps: build, validate and lay out a floor plan from what the admin enters.
//   2. Adding a hospital (which now REQUIRES a valid map).
//   3. Creating a user (with the records each role needs) and deleting one without leaving dangling references.
// Every function returns new data; nothing is mutated.

import { roleLabels } from './data'

export const USER_ROLES = ['patient', 'family', 'doctor', 'head', 'dean', 'admin']
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const PLACE_TYPES = [
  { value: 'entrance', label: 'Entrance' },
  { value: 'room', label: 'Room / department' },
  { value: 'lift', label: 'Lift' },
  { value: 'stairs', label: 'Stairs' },
]
export const FLOORS = ['B', 'G', '1', '2', '3', '4', '5', '6']
const HOSPITAL_COLORS = ['#138F84', '#2B70D5', '#C2603F', '#7B5EA7', '#B7791F', '#2F855A']
const MAX_PLACE_NAME = 30
const clean = (v) => String(v ?? '').trim()
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()
const unique = (items) => [...new Set(items)]

// ============================================================ hospital maps

/** An empty map draft the editor starts from. */
export const emptyDraft = () => ({ places: [], paths: [] })

export const PLAN_TEMPLATES = {
  clinic: {
    label: 'Small clinic (one floor)',
    places: [
      { name: 'Entrance', floor: 'G', type: 'entrance' }, { name: 'Reception', floor: 'G', type: 'room' }, { name: 'Consultation', floor: 'G', type: 'room' },
      { name: 'Pharmacy', floor: 'G', type: 'room' }, { name: 'Laboratory', floor: 'G', type: 'room' }, { name: 'Restrooms', floor: 'G', type: 'room' },
    ],
    paths: [
      { from: 'Entrance', to: 'Reception', distance: 1, accessible: true }, { from: 'Reception', to: 'Consultation', distance: 1, accessible: true },
      { from: 'Reception', to: 'Pharmacy', distance: 1, accessible: true }, { from: 'Reception', to: 'Laboratory', distance: 2, accessible: true },
      { from: 'Reception', to: 'Restrooms', distance: 1, accessible: true },
    ],
  },
  hospital: {
    label: 'Two-floor hospital',
    places: [
      { name: 'Entrance', floor: 'G', type: 'entrance' }, { name: 'Reception', floor: 'G', type: 'room' }, { name: 'Pharmacy', floor: 'G', type: 'room' },
      { name: 'Emergency', floor: 'G', type: 'room' }, { name: 'Lift', floor: 'G', type: 'lift' }, { name: 'Stairs', floor: 'G', type: 'stairs' },
      { name: 'Outpatient', floor: '1', type: 'room' }, { name: 'Laboratory', floor: '1', type: 'room' }, { name: 'Wards', floor: '1', type: 'room' },
    ],
    paths: [
      { from: 'Entrance', to: 'Reception', distance: 1, accessible: true }, { from: 'Reception', to: 'Pharmacy', distance: 1, accessible: true },
      { from: 'Reception', to: 'Emergency', distance: 2, accessible: true }, { from: 'Reception', to: 'Lift', distance: 1, accessible: true },
      { from: 'Reception', to: 'Stairs', distance: 1, accessible: false }, { from: 'Lift', to: 'Outpatient', distance: 2, accessible: true },
      { from: 'Lift', to: 'Laboratory', distance: 2, accessible: true }, { from: 'Lift', to: 'Wards', distance: 2, accessible: true },
      { from: 'Stairs', to: 'Outpatient', distance: 1, accessible: false },
    ],
  },
}

export const templateDraft = (key) => JSON.parse(JSON.stringify({ places: PLAN_TEMPLATES[key].places, paths: PLAN_TEMPLATES[key].paths }))

/** Turns a stored plan back into an editable draft. */
export function draftFromPlan(plan) {
  if (!plan) return emptyDraft()
  return {
    // older maps did not mark the entrance, so a place called "Entrance" is recognised as one
    places: Object.entries(plan.nodes).map(([name, n]) => ({ name, floor: String(n.floor), type: n.type || (/^entrance$/i.test(name) ? 'entrance' : 'room') })),
    paths: plan.edges.map(([from, to, distance, accessible]) => ({ from, to, distance: Number(distance) || 1, accessible: Boolean(accessible) })),
  }
}

const floorRank = (floor) => { const i = FLOORS.indexOf(String(floor)); return i === -1 ? 99 : i }

/** Auto layout on the 700x390 map canvas: one band per floor (higher floors higher up), wrapping long floors. */
export function layoutPlaces(places) {
  const floors = unique(places.map(p => String(p.floor))).sort((a, b) => floorRank(a) - floorRank(b))
  const PER_ROW = 5
  const rowsOf = (f) => Math.max(1, Math.ceil(places.filter(p => String(p.floor) === f).length / PER_ROW))
  const totalRows = floors.reduce((n, f) => n + rowsOf(f), 0)
  const gap = Math.min(85, totalRows > 1 ? 250 / (totalRows - 1) : 0)
  const baseY = totalRows > 1 ? 325 : 200
  const positions = {}
  let row = 0
  floors.forEach((floor) => {
    const members = places.filter(p => String(p.floor) === floor)
    members.forEach((place, i) => {
      const r = Math.floor(i / PER_ROW)
      const inRow = Math.min(PER_ROW, members.length - r * PER_ROW)
      const col = i % PER_ROW
      positions[place.name] = { x: Math.round(inRow === 1 ? 350 : 80 + (col * 540) / (inRow - 1)), y: Math.round(baseY - (row + r) * gap) }
    })
    row += rowsOf(floor)
  })
  return positions
}

/** Draft → the plan format the whole app uses (nodes with positions, edges with weight + wheelchair flag). */
export function planFromDraft(draft, hospitalName = 'New hospital') {
  const positions = layoutPlaces(draft.places)
  const typeOf = Object.fromEntries(draft.places.map(p => [p.name, p.type]))
  const nodes = {}
  draft.places.forEach((p) => { nodes[p.name] = { ...positions[p.name], floor: String(p.floor), type: p.type } })
  const edges = draft.paths.map(({ from, to, distance, accessible }) => {
    const stairs = typeOf[from] === 'stairs' || typeOf[to] === 'stairs' // stairs are never wheelchair-friendly
    return [from, to, Math.max(1, Number(distance) || 1), stairs ? false : Boolean(accessible)]
  })
  return { name: `${clean(hospitalName)} — floor plan`, nodes, edges }
}

const reachable = (start, edges) => {
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const here = queue.shift()
    edges.forEach(([a, b]) => {
      const next = a === here ? b : b === here ? a : null
      if (next && !seen.has(next)) { seen.add(next); queue.push(next) }
    })
  }
  return seen
}

/** Errors block saving; warnings are advice (for example a place wheelchair users cannot reach). */
export function validateDraft(draft) {
  const errors = []
  const warnings = []
  const names = draft.places.map(p => clean(p.name))
  if (draft.places.length < 2) errors.push('Add at least two places, for example an Entrance and one department.')
  names.forEach((name, i) => {
    if (!name) errors.push(`Place ${i + 1} needs a name.`)
    else if (name.length > MAX_PLACE_NAME) errors.push(`"${name.slice(0, 12)}…" is too long (maximum ${MAX_PLACE_NAME} characters).`)
  })
  const dupes = unique(names.filter((n, i) => n && names.findIndex(m => same(m, n)) !== i))
  dupes.forEach(n => errors.push(`There are two places called "${n}". Names must be unique.`))
  draft.places.forEach(p => { if (!FLOORS.includes(String(p.floor))) errors.push(`"${clean(p.name) || 'A place'}" needs a floor.`) })
  if (!draft.places.some(p => p.type === 'entrance')) errors.push('Mark one place as the Entrance, so routes have a starting point.')

  const known = new Set(names)
  const seenPairs = new Set()
  draft.paths.forEach((path, i) => {
    if (!known.has(path.from) || !known.has(path.to)) return errors.push(`Path ${i + 1} connects a place that does not exist.`)
    if (path.from === path.to) return errors.push(`Path ${i + 1} connects "${path.from}" to itself.`)
    const key = [path.from, path.to].sort().join('|')
    if (seenPairs.has(key)) return errors.push(`"${path.from}" and "${path.to}" are connected twice.`)
    seenPairs.add(key)
    if (!(Number(path.distance) >= 1)) errors.push(`The path ${path.from} to ${path.to} needs a distance of at least 1.`)
    return undefined
  })

  const entrance = draft.places.find(p => p.type === 'entrance')
  if (entrance && !errors.length) {
    const valid = draft.paths.map(({ from, to }) => [from, to])
    const reach = reachable(entrance.name, valid)
    draft.places.filter(p => !reach.has(p.name)).forEach(p => errors.push(`"${p.name}" is not connected to the Entrance by any path.`))
    if (!errors.length) {
      const stairsTypes = new Set(draft.places.filter(p => p.type === 'stairs').map(p => p.name))
      const accessibleEdges = draft.paths.filter(p => p.accessible && !stairsTypes.has(p.from) && !stairsTypes.has(p.to)).map(({ from, to }) => [from, to])
      const reachChair = reachable(entrance.name, accessibleEdges)
      draft.places.filter(p => p.type === 'room' && !reachChair.has(p.name)).forEach(p => warnings.push(`Wheelchair users cannot reach "${p.name}" (no step-free path). Add a lift or a step-free path if that is wrong.`))
    }
  }
  return { errors, warnings, ok: errors.length === 0 }
}

// ============================================================ hospitals

export function validateHospitalForm(data, form) {
  const errors = {}
  const name = clean(form.name)
  if (name.length < 3) errors.name = 'Enter the hospital name (at least 3 characters).'
  else if (name.length > 80) errors.name = 'Keep the hospital name under 80 characters.'
  else if (data.hospitals.some(h => same(h.name, name))) errors.name = 'A hospital with this name already exists.'
  const code = clean(form.code).toUpperCase()
  if (!/^[A-Z0-9]{2,5}$/.test(code)) errors.code = 'Use 2 to 5 letters or digits.'
  else if (data.hospitals.some(h => same(h.code, code))) errors.code = `The code ${code} is already used by another hospital.`
  const city = clean(form.city)
  if (!city) errors.city = 'Enter the city.'
  else if (city.length > 60) errors.city = 'Keep the city under 60 characters.'
  const beds = Number(clean(form.beds))
  if (!Number.isInteger(beds) || beds < 1 || beds > 5000) errors.beds = 'Enter a whole number of beds from 1 to 5000.'
  return { errors, ok: Object.keys(errors).length === 0 }
}

/**
 * Adds a hospital AND its map in one step. A hospital without a valid map is refused, so ClinicCompass
 * always has something to show for every facility.
 */
export function addHospital(data, form, draft, { actorId, id = `h${Date.now()}` } = {}) {
  const formCheck = validateHospitalForm(data, form)
  const mapCheck = validateDraft(draft)
  if (!formCheck.ok || !mapCheck.ok) return { ok: false, errors: formCheck.errors, mapErrors: mapCheck.errors }
  const hospital = {
    id, name: clean(form.name), code: clean(form.code).toUpperCase(), city: clean(form.city), type: clean(form.type) || 'Community care',
    beds: Number(form.beds), status: 'active', deanId: actorId || '', color: HOSPITAL_COLORS[data.hospitals.length % HOSPITAL_COLORS.length],
  }
  return {
    ok: true, hospital,
    data: {
      ...data,
      hospitals: [...data.hospitals, hospital],
      // network administrators work across every hospital, including this new one
      users: data.users.map(u => (u.role === 'admin' ? { ...u, hospitalIds: unique([...u.hospitalIds, id]) } : u)),
      floorPlans: { ...(data.floorPlans || {}), [id]: planFromDraft(draft, hospital.name) },
    },
  }
}

export function updateHospitalMap(data, hospitalId, draft) {
  const check = validateDraft(draft)
  const hospital = data.hospitals.find(h => h.id === hospitalId)
  if (!hospital) return { ok: false, mapErrors: ['That hospital no longer exists.'] }
  if (!check.ok) return { ok: false, mapErrors: check.errors }
  return { ok: true, data: { ...data, floorPlans: { ...(data.floorPlans || {}), [hospitalId]: planFromDraft(draft, hospital.name) } } }
}

/** Hospitals the signed-in person may work in: administrators see every hospital, others only their own. */
export const accessibleHospitals = (user, data) => (user.role === 'admin' ? data.hospitals : data.hospitals.filter(h => user.hospitalIds.includes(h.id)))

// ============================================================ users

export const canCreateUsers = (actor) => ['admin', 'dean'].includes(actor?.role)
export const canDeleteUsers = (actor) => actor?.role === 'admin'
/** Doctors and heads may register patients (assigned to themselves). Deans may add people to their own hospital but never create administrators or other deans. */
export const rolesActorMayCreate = (actor) => (actor?.role === 'admin' ? USER_ROLES : actor?.role === 'dean' ? ['patient', 'family', 'doctor', 'head'] : ['doctor', 'head'].includes(actor?.role) ? ['patient'] : [])

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateNewUser(data, form, actor) {
  const errors = {}
  const role = form.role
  if (!USER_ROLES.includes(role)) errors.role = 'Choose a role.'
  else if (!rolesActorMayCreate(actor).includes(role)) errors.role = 'You are not allowed to create this role.'
  if (clean(form.name).length < 2) errors.name = 'Enter the full name.'
  const email = clean(form.email).toLowerCase()
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.'
  else if (data.users.some(u => same(u.email, email))) errors.email = 'Another person already uses this email.'

  const hospital = data.hospitals.find(h => h.id === form.hospitalId)
  if (role !== 'admin') {
    if (!hospital) errors.hospitalId = 'Choose a hospital.'
    else if (actor.role !== 'admin' && !actor.hospitalIds.includes(hospital.id)) errors.hospitalId = 'You can only add people to your own hospital.'
  }
  if (['doctor', 'head'].includes(role)) {
    const dept = data.departments.find(d => d.id === form.departmentId)
    if (!dept || dept.hospitalId !== form.hospitalId) errors.departmentId = 'Choose a department of this hospital (add one on the Organization page first).'
  }
  if (role === 'patient') {
    const dob = clean(form.dob)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(new Date(dob).getTime()) || new Date(dob) > new Date()) errors.dob = 'Enter a valid date of birth (not in the future).'
    if (form.bloodGroup && !BLOOD_GROUPS.includes(form.bloodGroup)) errors.bloodGroup = 'Choose a valid blood group.'
    if (form.doctorId && !data.users.some(u => u.id === form.doctorId && ['doctor', 'head'].includes(u.role))) errors.doctorId = 'Choose a doctor from the list.'
  }
  if (role === 'family' && form.linkPatientId) {
    if (!data.patients.some(p => p.id === form.linkPatientId)) errors.linkPatientId = 'Choose a patient from the list.'
    if (!clean(form.relationship)) errors.relationship = 'Say how this person is related to the patient.'
  }
  return { errors, ok: Object.keys(errors).length === 0 }
}

const initialsOf = (name) => clean(name).split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()
const splitList = (text) => clean(text).split(/[,;\n]/).map(clean).filter(Boolean)

function nextMrn(data, code) {
  const numbers = data.patients.filter(p => p.mrn?.startsWith(`${code}-`)).map(p => Number(p.mrn.split('-')[1])).filter(Number.isFinite)
  return `${code}-${Math.max(10000, ...numbers) + 1}`
}

/** Creates the person and the records their role needs (a patient record, a department link, a family link). */
export function createUser(data, form, actor, { id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` } = {}) {
  const check = validateNewUser(data, form, actor)
  if (!check.ok) return { ok: false, errors: check.errors }
  const role = form.role
  const hospital = data.hospitals.find(h => h.id === form.hospitalId)
  const user = {
    id, name: clean(form.name), email: clean(form.email).toLowerCase(), role, title: roleLabels[role] || role,
    hospitalIds: role === 'admin' ? data.hospitals.map(h => h.id) : [hospital.id], initials: initialsOf(form.name),
  }
  let next = { ...data }
  if (['doctor', 'head'].includes(role)) {
    user.departmentId = form.departmentId
    if (clean(form.specialization)) user.specialization = clean(form.specialization)
    // every doctor gets a live queue, so patients can be checked in from day one
    next = { ...next, queues: [...next.queues, { id: `q-${id}`, hospitalId: hospital.id, departmentId: form.departmentId, doctorId: id, serving: 0, lastIssued: 0, avgMinutes: 6, paused: false, updatedAt: new Date().toISOString() }] }
    if (role === 'head') {
      // a new head takes over only a department that has none
      next = { ...next, departments: next.departments.map(d => (d.id === form.departmentId && !data.users.some(u => u.id === d.headId && u.role === 'head') ? { ...d, headId: id } : d)) }
    }
  }
  if (role === 'dean') {
    const currentDean = data.users.find(u => u.id === hospital.deanId)
    if (!currentDean || currentDean.role !== 'dean') next = { ...next, hospitals: next.hospitals.map(h => (h.id === hospital.id ? { ...h, deanId: id } : h)) }
  }
  let patient = null
  if (role === 'patient') {
    patient = {
      id: `p${id.slice(1)}`, userId: id, hospitalId: hospital.id, mrn: nextMrn(data, hospital.code), dob: clean(form.dob), bloodGroup: form.bloodGroup || 'Unknown',
      doctorIds: form.doctorId ? [form.doctorId] : [], familyLinks: [], allergies: splitList(form.allergies), conditions: splitList(form.conditions),
    }
    user.patientId = patient.id
    next = { ...next, patients: [...next.patients, patient] }
  }
  if (role === 'family' && form.linkPatientId) {
    // the link is created only when the admin confirms the patient agreed (consent-first access)
    if (form.consent) {
      next = { ...next, patients: next.patients.map(p => (p.id === form.linkPatientId ? { ...p, familyLinks: [...p.familyLinks, { userId: id, relationship: clean(form.relationship), status: 'approved', permissions: ['queue', 'medications', 'care', 'records'] }] } : p)) }
    }
  }
  return { ok: true, user, patient, data: { ...next, users: [...next.users, user] } }
}

/** What deleting this person would touch, shown to the admin before they confirm. */
export function describeRemoval(data, userId, actorId) {
  const user = data.users.find(u => u.id === userId)
  if (!user) return { ok: false, blocker: 'missing', message: 'This person no longer exists.' }
  if (userId === actorId) return { ok: false, user, blocker: 'self', message: 'You cannot delete your own account while signed in.' }
  if (user.role === 'admin' && data.users.filter(u => u.role === 'admin').length <= 1) return { ok: false, user, blocker: 'last-admin', message: 'This is the only network administrator. Create another one first.' }
  const patient = data.patients.find(p => p.userId === userId)
  const queues = data.queues.filter(q => q.doctorId === userId)
  const queueIds = new Set(queues.map(q => q.id))
  const impact = {
    patientRecord: Boolean(patient),
    records: patient ? data.records.filter(r => r.patientId === patient.id).length : 0,
    medications: patient ? data.medications.filter(m => m.patientId === patient.id).length : 0,
    appointments: data.appointments.filter(a => a.doctorId === userId || (patient && a.patientId === patient.id)).length,
    unassignedPatients: data.patients.filter(p => p.doctorIds.includes(userId)).length,
    familyLinks: data.patients.filter(p => p.familyLinks.some(l => l.userId === userId)).length,
    queues: queues.length,
    waitingTokens: data.tokens.filter(t => queueIds.has(t.queueId)).length,
    departmentsLeadershipMoved: data.departments.filter(d => d.headId === userId).length,
    hospitalsLeadershipMoved: data.hospitals.filter(h => h.deanId === userId).length,
  }
  return { ok: true, user, impact }
}

/**
 * Deletes a person and cleans up everything that pointed at them, so no screen is left holding a missing user.
 * Leadership posts they held pass to the hospital's dean (or to the administrator doing the deletion).
 */
export function removeUser(data, userId, actorId) {
  const check = describeRemoval(data, userId, actorId)
  if (!check.ok) return check
  const patient = data.patients.find(p => p.userId === userId)
  const patientId = patient?.id
  const removedQueues = new Set(data.queues.filter(q => q.doctorId === userId).map(q => q.id))
  const deanOf = (hospitalId) => data.users.find(u => u.role === 'dean' && u.id !== userId && u.hospitalIds.includes(hospitalId))?.id
  const companion = { ...(data.companion || {}) }
  if (patientId) delete companion[patientId]
  const notifications = (data.notifications || [])
    .map(n => ({ ...n, recipientIds: n.recipientIds.filter(r => r !== userId), readBy: (n.readBy || []).filter(r => r !== userId) }))
    .filter(n => n.recipientIds.length)
  const next = {
    ...data,
    users: data.users.filter(u => u.id !== userId),
    patients: data.patients.filter(p => p.userId !== userId).map(p => ({
      ...p, doctorIds: p.doctorIds.filter(d => d !== userId), familyLinks: p.familyLinks.filter(l => l.userId !== userId),
    })),
    hospitals: data.hospitals.map(h => (h.deanId === userId ? { ...h, deanId: deanOf(h.id) || actorId } : h)),
    departments: data.departments.map(d => (d.headId === userId ? { ...d, headId: deanOf(d.hospitalId) || actorId } : d)),
    queues: data.queues.filter(q => !removedQueues.has(q.id)),
    tokens: data.tokens.filter(t => !removedQueues.has(t.queueId) && t.patientId !== patientId),
    records: data.records.filter(r => r.patientId !== patientId),
    medications: data.medications.filter(m => m.patientId !== patientId),
    careRequests: data.careRequests.filter(c => c.patientId !== patientId),
    appointments: data.appointments.filter(a => a.doctorId !== userId && a.patientId !== patientId),
    hospitalAlerts: (data.hospitalAlerts || []).filter(a => a.patientId !== patientId),
    notifications,
    companion,
  }
  return { ok: true, data: next, user: check.user, impact: check.impact }
}
