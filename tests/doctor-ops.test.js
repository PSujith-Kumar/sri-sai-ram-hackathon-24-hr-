import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data'
import { registerPatient, takeOnPatient, unassignedPatients, canAddPatients } from '../src/doctorOps'

const meera = seedData.users.find(u => u.id === 'u-meera')
const form = { name: 'Rohan Das', email: 'rohan@example.com', dob: '1990-05-01', bloodGroup: 'A+', allergies: 'Dust', conditions: 'Asthma' }

describe('doctor adds patients', () => {
  it('lets doctors and heads add, nobody else', () => {
    expect(canAddPatients(meera)).toBe(true)
    expect(canAddPatients({ role: 'patient' })).toBe(false)
    expect(canAddPatients({ role: 'family' })).toBe(false)
  })
  it('registers a new patient assigned to the doctor in their hospital', () => {
    const r = registerPatient(seedData, form, meera)
    expect(r.ok).toBe(true)
    const p = r.data.patients.find(x => x.userId === r.user.id)
    expect(p.doctorIds).toEqual([meera.id])
    expect(p.hospitalId).toBe('h1')
    expect(p.conditions).toEqual(['Asthma'])
    expect(r.data.notifications[0].recipientIds).toEqual([r.user.id])
    expect(seedData.patients).toHaveLength(2)
  })
  it('rejects invalid input and duplicate email', () => {
    expect(registerPatient(seedData, { ...form, name: '' }, meera).errors.name).toBeTruthy()
    expect(registerPatient(seedData, { ...form, email: 'ananya@carebridge.demo' }, meera).errors.email).toBeTruthy()
    expect(registerPatient(seedData, { ...form, dob: '2999-01-01' }, meera).errors.dob).toBeTruthy()
  })
  it('refuses non-doctors', () => {
    expect(registerPatient(seedData, form, { role: 'patient', hospitalIds: ['h1'] }).ok).toBe(false)
  })
  it('takes on an unassigned patient only', () => {
    const added = registerPatient(seedData, { ...form, email: 'x@example.com' }, meera).data
    const lonely = { ...added, patients: added.patients.map(p => (p.id === 'p2' ? { ...p, doctorIds: [] } : p)) }
    expect(unassignedPatients(lonely, meera).map(p => p.id)).toEqual(['p2'])
    const r = takeOnPatient(lonely, 'p2', meera)
    expect(r.ok).toBe(true)
    expect(r.data.patients.find(p => p.id === 'p2').doctorIds).toEqual([meera.id])
    expect(takeOnPatient(seedData, 'p1', meera).message).toMatch(/already yours/)
    expect(takeOnPatient(seedData, 'p2', meera).message).toMatch(/already has a doctor/)
  })
})

describe('new doctors get a queue', () => {
  it('creating a doctor adds an empty live queue for them', async () => {
    const { createUser } = await import('../src/adminOps')
    const admin = seedData.users.find(u => u.id === 'u-admin')
    const r = createUser(seedData, { role: 'doctor', name: 'Dr. Lena Park', email: 'lena@example.com', hospitalId: 'h1', departmentId: 'd-card' }, admin, { id: 'unew' })
    expect(r.ok).toBe(true)
    expect(r.data.queues.find(q => q.doctorId === 'unew')).toMatchObject({ hospitalId: 'h1', departmentId: 'd-card', serving: 0, lastIssued: 0, paused: false })
    expect(seedData.queues).toHaveLength(2)
  })
})
