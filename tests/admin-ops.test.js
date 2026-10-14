import { describe, expect, it } from 'vitest'
import { hydrateCareData } from '../src/careFlow'
import { floorPlans, seedData } from '../src/data'
import { routeBetween, routeFacts } from '../src/mapAnalysis'
import {
  accessibleHospitals, addHospital, canCreateUsers, canDeleteUsers, createUser, describeRemoval, draftFromPlan, emptyDraft, layoutPlaces, planFromDraft,
  removeUser, rolesActorMayCreate, templateDraft, updateHospitalMap, validateDraft, validateHospitalForm, validateNewUser,
} from '../src/adminOps'

const clone = (x) => JSON.parse(JSON.stringify(x))
const fresh = () => hydrateCareData(clone({ ...seedData, floorPlans: clone(floorPlans) }), clone({ ...seedData, floorPlans: clone(floorPlans) }))
const admin = seedData.users.find(u => u.role === 'admin')
const dean = seedData.users.find(u => u.role === 'dean')
const hospitalForm = { name: 'Lotus Care Hospital', code: 'lcg', city: 'Madurai', type: 'Speciality hospital', beds: 120 }

describe('map validation', () => {
  it('accepts both built-in templates', () => {
    expect(validateDraft(templateDraft('clinic')).ok).toBe(true)
    expect(validateDraft(templateDraft('hospital'))).toMatchObject({ ok: true, warnings: [] })
  })

  it('requires at least two places and an entrance', () => {
    expect(validateDraft(emptyDraft()).errors.join(' ')).toMatch(/at least two places/)
    const noEntrance = { places: [{ name: 'A', floor: 'G', type: 'room' }, { name: 'B', floor: 'G', type: 'room' }], paths: [{ from: 'A', to: 'B', distance: 1, accessible: true }] }
    expect(validateDraft(noEntrance).errors.join(' ')).toMatch(/Entrance/)
  })

  it('rejects empty, over-long and duplicate place names, and missing floors', () => {
    const d = templateDraft('clinic')
    d.places.push({ name: '', floor: 'G', type: 'room' }, { name: 'reception', floor: 'G', type: 'room' }, { name: 'x'.repeat(31), floor: 'G', type: 'room' }, { name: 'Attic', floor: '', type: 'room' })
    const errors = validateDraft(d).errors.join(' | ')
    expect(errors).toMatch(/needs a name/)
    expect(errors).toMatch(/two places called "reception"/i)
    expect(errors).toMatch(/too long/)
    expect(errors).toMatch(/needs a floor/)
  })

  it('rejects broken paths', () => {
    const d = templateDraft('clinic')
    d.paths.push({ from: 'Reception', to: 'Moon', distance: 1, accessible: true }, { from: 'Pharmacy', to: 'Pharmacy', distance: 1, accessible: true }, { from: 'Reception', to: 'Entrance', distance: 1, accessible: true })
    const errors = validateDraft(d).errors.join(' | ')
    expect(errors).toMatch(/does not exist/)
    expect(errors).toMatch(/to itself/)
    expect(errors).toMatch(/connected twice/)
  })

  it('requires every place to be reachable from the entrance', () => {
    const d = templateDraft('clinic')
    d.places.push({ name: 'Annexe', floor: 'G', type: 'room' })
    expect(validateDraft(d).errors).toContain('"Annexe" is not connected to the Entrance by any path.')
  })

  it('warns when wheelchair users cannot reach a room', () => {
    const d = templateDraft('hospital')
    d.paths = d.paths.filter(p => p.from !== 'Lift') // only the stairs reach the first floor now
    d.paths.push({ from: 'Reception', to: 'Lift', distance: 1, accessible: true })
    const r = validateDraft(d)
    expect(r.ok).toBe(false) // the lift no longer reaches the first floor, so the first-floor rooms are only on stairs paths
    const d2 = templateDraft('hospital')
    d2.paths = d2.paths.map(p => (p.from === 'Lift' && p.to === 'Wards' ? { ...p, accessible: false } : p))
    expect(validateDraft(d2).warnings.join(' ')).toMatch(/Wheelchair users cannot reach "Wards"/)
  })
})

describe('building the plan', () => {
  const plan = planFromDraft(templateDraft('hospital'), 'Lotus Care')

  it('uses the format the whole app already uses', () => {
    expect(plan.name).toMatch(/Lotus Care/)
    expect(Object.keys(plan.nodes)).toHaveLength(9)
    expect(plan.nodes.Lift).toMatchObject({ floor: 'G', type: 'lift' })
    plan.edges.forEach(([a, b, w, ok]) => { expect(plan.nodes[a] && plan.nodes[b]).toBeTruthy(); expect(w).toBeGreaterThanOrEqual(1); expect(typeof ok).toBe('boolean') })
  })

  it('keeps every place inside the map canvas and gives each its own spot', () => {
    const spots = Object.values(plan.nodes).map(n => `${n.x},${n.y}`)
    expect(new Set(spots).size).toBe(spots.length)
    Object.values(plan.nodes).forEach(n => { expect(n.x).toBeGreaterThanOrEqual(40); expect(n.x).toBeLessThanOrEqual(660); expect(n.y).toBeGreaterThanOrEqual(40); expect(n.y).toBeLessThanOrEqual(360) })
  })

  it('draws higher floors higher up', () => {
    expect(plan.nodes.Wards.y).toBeLessThan(plan.nodes.Reception.y)
  })

  it('never marks a path through stairs as wheelchair-friendly', () => {
    const d = templateDraft('hospital')
    d.paths = d.paths.map(p => (p.from === 'Reception' && p.to === 'Stairs' ? { ...p, accessible: true } : p))
    const edge = planFromDraft(d).edges.find(([a, b]) => a === 'Reception' && b === 'Stairs')
    expect(edge[3]).toBe(false)
  })

  it('lays out a crowded single floor without overlap', () => {
    const places = Array.from({ length: 12 }, (_, i) => ({ name: `Room ${i}`, floor: 'G', type: 'room' }))
    const spots = Object.values(layoutPlaces(places)).map(p => `${p.x},${p.y}`)
    expect(new Set(spots).size).toBe(12)
  })

  it('round-trips an existing plan, and routes work on a plan built here', () => {
    const rebuilt = planFromDraft(draftFromPlan(floorPlans.h1), 'Sanjeevani')
    expect(Object.keys(rebuilt.nodes).sort()).toEqual(Object.keys(floorPlans.h1.nodes).sort())
    expect(rebuilt.edges).toHaveLength(floorPlans.h1.edges.length)
    const route = routeBetween(plan, 'Entrance', 'Wards', true)
    expect(route).toEqual(['Entrance', 'Reception', 'Lift', 'Wards'])
    expect(routeFacts(plan, route)).toMatchObject({ steps: 3, stairLegs: 0, liftLegs: 2 })
  })
})

describe('adding a hospital', () => {
  it('checks the form', () => {
    const data = fresh()
    expect(validateHospitalForm(data, { ...hospitalForm, name: 'ab', code: 'x', city: '', beds: 0 }).errors).toMatchObject({ name: expect.any(String), code: expect.any(String), city: expect.any(String), beds: expect.any(String) })
    expect(validateHospitalForm(data, { ...hospitalForm, code: 'smh' }).errors.code).toMatch(/already used/)
    expect(validateHospitalForm(data, hospitalForm).ok).toBe(true)
  })

  it('refuses a hospital without a valid map', () => {
    const data = fresh()
    const noMap = addHospital(data, hospitalForm, emptyDraft(), { actorId: admin.id })
    expect(noMap.ok).toBe(false)
    expect(noMap.mapErrors.length).toBeGreaterThan(0)
    expect(data.hospitals).toHaveLength(seedData.hospitals.length)
  })

  it('creates the hospital together with its map, and gives every administrator access', () => {
    const data = fresh()
    const r = addHospital(data, hospitalForm, templateDraft('clinic'), { actorId: admin.id, id: 'h-new' })
    expect(r.ok).toBe(true)
    expect(r.data.hospitals.map(h => h.id)).toContain('h-new')
    expect(r.hospital).toMatchObject({ code: 'LCG', beds: 120, deanId: admin.id })
    expect(r.data.floorPlans['h-new'].nodes.Entrance).toBeTruthy()
    expect(r.data.users.find(u => u.id === admin.id).hospitalIds).toContain('h-new')
    expect(r.data.floorPlans.h1).toEqual(data.floorPlans.h1) // existing maps untouched
  })

  it('does not mutate the original data', () => {
    const data = fresh()
    const before = JSON.stringify(data)
    addHospital(data, hospitalForm, templateDraft('clinic'), { actorId: admin.id })
    expect(JSON.stringify(data)).toBe(before)
  })

  it('lets the admin edit a hospital map later, but only with a valid one', () => {
    const data = fresh()
    expect(updateHospitalMap(data, 'h1', emptyDraft()).ok).toBe(false)
    const draft = draftFromPlan(data.floorPlans.h1)
    draft.places.push({ name: 'Chapel', floor: 'G', type: 'room' })
    draft.paths.push({ from: 'Reception', to: 'Chapel', distance: 1, accessible: true })
    const r = updateHospitalMap(data, 'h1', draft)
    expect(r.ok).toBe(true)
    expect(r.data.floorPlans.h1.nodes.Chapel).toBeTruthy()
    expect(updateHospitalMap(data, 'nope', draft).ok).toBe(false)
  })

  it('shows administrators every hospital and everyone else only their own', () => {
    const data = addHospital(fresh(), hospitalForm, templateDraft('clinic'), { actorId: admin.id, id: 'h-new' }).data
    expect(accessibleHospitals({ role: 'admin', hospitalIds: ['h1'] }, data).map(h => h.id)).toEqual([...seedData.hospitals.map(h => h.id), 'h-new'])
    expect(accessibleHospitals({ role: 'doctor', hospitalIds: ['h1'] }, data).map(h => h.id)).toEqual(['h1'])
  })
})

describe('who may manage users', () => {
  it('lets administrators create and delete, deans only create (and not admins or deans)', () => {
    expect([canCreateUsers(admin), canDeleteUsers(admin)]).toEqual([true, true])
    expect([canCreateUsers(dean), canDeleteUsers(dean)]).toEqual([true, false])
    expect(canCreateUsers({ role: 'doctor' })).toBe(false)
    expect(rolesActorMayCreate(dean)).not.toContain('admin')
    expect(rolesActorMayCreate(dean)).not.toContain('dean')
    expect(rolesActorMayCreate(admin)).toContain('admin')
  })
})

describe('creating a user', () => {
  const base = { name: 'Rhea Menon', email: 'rhea@carebridge.demo', hospitalId: 'h1' }

  it('validates every role', () => {
    const data = fresh()
    expect(validateNewUser(data, { ...base, role: 'patient', dob: '' }, admin).errors.dob).toBeTruthy()
    expect(validateNewUser(data, { ...base, role: 'patient', dob: '2999-01-01' }, admin).errors.dob).toBeTruthy()
    expect(validateNewUser(data, { ...base, role: 'doctor' }, admin).errors.departmentId).toBeTruthy()
    expect(validateNewUser(data, { ...base, role: 'doctor', departmentId: 'd-family' }, admin).errors.departmentId).toBeTruthy() // other hospital's department
    expect(validateNewUser(data, { ...base, role: 'family', linkPatientId: 'p1' }, admin).errors.relationship).toBeTruthy()
    expect(validateNewUser(data, { ...base, role: 'admin', hospitalId: '' }, admin).ok).toBe(true)
    expect(validateNewUser(data, { ...base, role: 'doctor', departmentId: 'd-card', email: 'MEERA@sanjeevani.demo' }, admin).errors.email).toMatch(/already/)
    expect(validateNewUser(data, { ...base, role: 'doctor', departmentId: 'd-card', email: 'not-an-email' }, admin).errors.email).toBeTruthy()
  })

  it('stops a dean creating an administrator or adding people to another hospital', () => {
    const data = fresh()
    expect(validateNewUser(data, { ...base, role: 'admin' }, dean).errors.role).toMatch(/not allowed/)
    expect(validateNewUser(data, { ...base, role: 'doctor', hospitalId: 'h2', departmentId: 'd-family' }, dean).errors.hospitalId).toMatch(/own hospital/)
  })

  it('gives a new patient a real patient record, so their dashboard works', () => {
    const data = fresh()
    const r = createUser(data, { ...base, role: 'patient', dob: '1990-05-04', bloodGroup: 'O-', doctorId: 'u-meera', allergies: 'Dust, Latex', conditions: 'Asthma' }, admin, { id: 'u-rhea' })
    expect(r.ok).toBe(true)
    expect(r.user).toMatchObject({ id: 'u-rhea', role: 'patient', patientId: 'p-rhea', initials: 'RM', title: 'Patient' })
    expect(r.patient).toMatchObject({ userId: 'u-rhea', hospitalId: 'h1', mrn: 'SMH-20527', bloodGroup: 'O-', doctorIds: ['u-meera'], allergies: ['Dust', 'Latex'], conditions: ['Asthma'] })
    expect(r.data.patients.some(p => p.id === 'p-rhea')).toBe(true)
    expect(data.users.some(u => u.id === 'u-rhea')).toBe(false) // original untouched
  })

  it('numbers medical IDs per hospital', () => {
    const data = addHospital(fresh(), hospitalForm, templateDraft('clinic'), { actorId: admin.id, id: 'h-new' }).data
    const r = createUser(data, { ...base, hospitalId: 'h-new', role: 'patient', dob: '1990-05-04' }, admin, { id: 'u-x' })
    expect(r.patient.mrn).toBe('LCG-10001')
  })

  it('puts a doctor in a department, and a head only in a department that has none', () => {
    const data = fresh()
    const doctor = createUser(data, { ...base, role: 'doctor', departmentId: 'd-card', specialization: 'Cardiology' }, admin, { id: 'u-doc' })
    expect(doctor.user).toMatchObject({ departmentId: 'd-card', specialization: 'Cardiology' })
    const head = createUser(data, { ...base, email: 'h@x.demo', role: 'head', departmentId: 'd-card' }, admin, { id: 'u-head2' })
    expect(head.data.departments.find(d => d.id === 'd-card').headId).toBe('u-head') // existing head kept
    const noHead = { ...data, departments: data.departments.map(d => (d.id === 'd-lab' ? { ...d, headId: '' } : d)) }
    expect(createUser(noHead, { ...base, email: 'h2@x.demo', role: 'head', departmentId: 'd-lab' }, admin, { id: 'u-head3' }).data.departments.find(d => d.id === 'd-lab').headId).toBe('u-head3')
  })

  it('makes a new administrator a member of every hospital', () => {
    const r = createUser(fresh(), { ...base, role: 'admin', hospitalId: '' }, admin, { id: 'u-adm2' })
    expect(r.user.hospitalIds).toEqual(seedData.hospitals.map(h => h.id))
  })

  it('links a family member only when the admin confirms the patient agreed', () => {
    const data = fresh()
    const form = { ...base, role: 'family', linkPatientId: 'p2', relationship: 'Mother' }
    expect(createUser(data, form, admin, { id: 'u-f1' }).data.patients.find(p => p.id === 'p2').familyLinks).toHaveLength(0)
    const consented = createUser(data, { ...form, email: 'f2@x.demo', consent: true }, admin, { id: 'u-f2' })
    expect(consented.data.patients.find(p => p.id === 'p2').familyLinks[0]).toMatchObject({ userId: 'u-f2', relationship: 'Mother', status: 'approved' })
  })

  it('returns the errors instead of creating anything when the form is wrong', () => {
    const r = createUser(fresh(), { ...base, role: 'patient', dob: '' }, admin)
    expect(r.ok).toBe(false)
    expect(r.errors.dob).toBeTruthy()
  })
})

// every place in the data that can point at a person or patient
function danglingReferences(data, userId, patientId) {
  const refs = []
  if (data.users.some(u => u.id === userId)) refs.push('users')
  if (data.patients.some(p => p.userId === userId || p.doctorIds.includes(userId) || p.familyLinks.some(l => l.userId === userId))) refs.push('patients')
  if (data.hospitals.some(h => h.deanId === userId)) refs.push('hospitals.deanId')
  if (data.departments.some(d => d.headId === userId)) refs.push('departments.headId')
  if (data.queues.some(q => q.doctorId === userId)) refs.push('queues')
  if (data.appointments.some(a => a.doctorId === userId || a.patientId === patientId)) refs.push('appointments')
  if (patientId && [...data.tokens, ...data.records, ...data.medications, ...data.careRequests].some(x => x.patientId === patientId)) refs.push('patient data')
  if ((data.notifications || []).some(n => n.recipientIds.includes(userId))) refs.push('notifications')
  return refs
}

describe('deleting a user', () => {
  it('refuses to delete yourself, the last administrator or someone who does not exist', () => {
    const data = fresh()
    expect(describeRemoval(data, admin.id, admin.id)).toMatchObject({ ok: false, blocker: 'self' })
    expect(describeRemoval(data, admin.id, 'someone-else')).toMatchObject({ ok: false, blocker: 'last-admin' })
    expect(describeRemoval(data, 'ghost', admin.id)).toMatchObject({ ok: false, blocker: 'missing' })
    expect(removeUser(data, admin.id, admin.id).ok).toBe(false)
  })

  it('allows deleting an administrator once another exists', () => {
    const data = createUser(fresh(), { name: 'Second Admin', email: 'a2@x.demo', role: 'admin' }, admin, { id: 'u-adm2' }).data
    expect(removeUser(data, admin.id, 'u-adm2').ok).toBe(true)
  })

  it('tells the admin what will be affected before they confirm', () => {
    const r = describeRemoval(fresh(), 'u-meera', admin.id)
    expect(r.impact).toMatchObject({ unassignedPatients: 2, queues: 1, waitingTokens: 1, appointments: 2 })
    const p = describeRemoval(fresh(), 'u-ananya', admin.id)
    expect(p.impact).toMatchObject({ patientRecord: true, records: 2, medications: 2 })
  })

  it('deleting a patient removes their record and everything linked to it', () => {
    const data = fresh()
    const r = removeUser(data, 'u-ananya', admin.id)
    expect(r.ok).toBe(true)
    expect(danglingReferences(r.data, 'u-ananya', 'p1')).toEqual([])
    expect(r.data.patients.map(p => p.id)).toEqual(seedData.patients.filter(p => p.id !== 'p1').map(p => p.id)) // all other patients are untouched
    expect(r.data.records.every(x => x.patientId !== 'p1')).toBe(true)
    expect(r.data.records.some(x => x.patientId === 'p2')).toBe(true)
  })

  it('deleting a doctor unassigns patients and removes their queue, token and appointments', () => {
    const r = removeUser(fresh(), 'u-meera', admin.id)
    expect(danglingReferences(r.data, 'u-meera', null)).toEqual([])
    expect(r.data.patients.find(p => p.id === 'p1').doctorIds).toEqual([])
    expect(r.data.queues.map(q => q.id)).toEqual(seedData.queues.filter(q => q.doctorId !== 'u-meera').map(q => q.id))
    expect(r.data.tokens.map(t => t.id)).toEqual(seedData.tokens.filter(t => t.queueId !== 'q1').map(t => t.id))
  })

  it('hands leadership posts to someone, never leaving a missing person in charge', () => {
    const r = removeUser(fresh(), 'u-dean', admin.id)
    expect(danglingReferences(r.data, 'u-dean', null)).toEqual([])
    expect(r.data.hospitals.find(h => h.id === 'h1').deanId).toBe(admin.id)
    expect(r.data.departments.filter(d => d.hospitalId === 'h1').every(d => r.data.users.some(u => u.id === d.headId))).toBe(true)
  })

  it('deleting a family member removes only their link', () => {
    const r = removeUser(fresh(), 'u-ravi', admin.id)
    expect(r.data.patients.find(p => p.id === 'p1').familyLinks).toEqual([])
    expect(r.data.patients).toHaveLength(seedData.patients.length)
    expect(danglingReferences(r.data, 'u-ravi', null)).toEqual([])
  })

  it('cleans notifications and drops ones nobody can read any more', () => {
    const data = { ...fresh(), notifications: [{ id: 'n1', message: 'a', recipientIds: ['u-ravi'], readBy: [] }, { id: 'n2', message: 'b', recipientIds: ['u-ravi', 'u-ananya'], readBy: ['u-ravi'] }] }
    const r = removeUser(data, 'u-ravi', admin.id)
    expect(r.data.notifications).toEqual([{ id: 'n2', message: 'b', recipientIds: ['u-ananya'], readBy: [] }])
  })

  it('does not mutate the original data', () => {
    const data = fresh()
    const before = JSON.stringify(data)
    removeUser(data, 'u-meera', admin.id)
    expect(JSON.stringify(data)).toBe(before)
  })

  it('a person created here can be deleted again, leaving the data as it was', () => {
    const data = fresh()
    const created = createUser(data, { name: 'Rhea Menon', email: 'rhea@x.demo', role: 'patient', hospitalId: 'h1', dob: '1990-05-04' }, admin, { id: 'u-rhea' })
    const removed = removeUser(created.data, 'u-rhea', admin.id)
    expect(removed.data.users).toEqual(data.users)
    expect(removed.data.patients).toEqual(data.patients)
  })
})

describe('hospital details form', () => {
  const good = { name: 'Green Valley Hospital', code: 'gvh', city: 'Coimbatore', type: 'Community care', beds: '120' }
  it('accepts valid details, with the code in any case', async () => {
    const { validateHospitalForm } = await import('../src/adminOps')
    const { seedData } = await import('../src/data')
    expect(validateHospitalForm(seedData, good).ok).toBe(true)
  })
  it('rejects bed counts that are not a whole number from 1 to 5000', async () => {
    const { validateHospitalForm } = await import('../src/adminOps')
    const { seedData } = await import('../src/data')
    for (const beds of ['0', '-5', '1.5', '5001', '1000000000', 'abc', '']) expect(validateHospitalForm(seedData, { ...good, beds }).errors.beds, beds).toBeTruthy()
    for (const beds of ['1', '5000', 250]) expect(validateHospitalForm(seedData, { ...good, beds }).errors.beds, String(beds)).toBeUndefined()
  })
  it('rejects a duplicate name or code, and over-long text', async () => {
    const { validateHospitalForm } = await import('../src/adminOps')
    const { seedData } = await import('../src/data')
    const existing = seedData.hospitals[0]
    expect(validateHospitalForm(seedData, { ...good, name: existing.name.toUpperCase() }).errors.name).toMatch(/already exists/)
    expect(validateHospitalForm(seedData, { ...good, code: existing.code.toLowerCase() }).errors.code).toMatch(/already used/)
    expect(validateHospitalForm(seedData, { ...good, name: 'x'.repeat(81) }).errors.name).toMatch(/80/)
    expect(validateHospitalForm(seedData, { ...good, city: 'y'.repeat(61) }).errors.city).toMatch(/60/)
    expect(validateHospitalForm(seedData, { ...good, name: '  ', city: ' ' }).errors).toMatchObject({ name: expect.any(String), city: expect.any(String) })
  })
})
