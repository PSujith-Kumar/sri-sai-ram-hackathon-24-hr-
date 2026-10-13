import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data'
import { appointmentsFor, bookAppointment, setAppointmentStatus } from '../src/appointmentOps'

const u = (id) => seedData.users.find(x => x.id === id)
const meera = u('u-meera'), arjun = u('u-arjun'), ananya = u('u-ananya'), ravi = u('u-ravi')
const form = { patientId: 'p1', date: '2099-10-20', time: '11:30', reason: 'Follow-up' }
const today = '2026-10-14'
const a1 = seedData.appointments[0]

describe('appointments', () => {
  it('a doctor books for their own patient and the patient and family are told', () => {
    const r = bookAppointment(seedData, form, meera, { today, id: 'ax' })
    expect(r.ok).toBe(true)
    expect(r.appointment).toMatchObject({ doctorId: 'u-meera', hospitalId: 'h1', departmentId: 'd-card', status: 'scheduled', reason: 'Follow-up' })
    expect(r.data.notifications[0].recipientIds).toEqual(['u-ananya', 'u-ravi'])
  })
  it('validates patient, date, time, conflicts', () => {
    expect(bookAppointment(seedData, { ...form, patientId: 'p2' }, meera, { today }).errors.patientId).toBeTruthy()
    expect(bookAppointment(seedData, { ...form, date: '2026-10-01' }, meera, { today }).errors.date).toBeTruthy()
    expect(bookAppointment(seedData, { ...form, time: '' }, meera, { today }).errors.time).toBeTruthy()
    expect(bookAppointment(seedData, { ...form, date: a1.date, time: a1.time }, meera, { today: a1.date }).errors.time).toMatch(/already/)
    expect(bookAppointment(seedData, form, ananya, { today }).ok).toBe(false)
  })
  it('a cancelled slot can be reused', () => {
    const cancelled = setAppointmentStatus(seedData, 'a1', 'cancelled', meera).data
    expect(bookAppointment(cancelled, { ...form, date: a1.date, time: a1.time }, meera, { today: a1.date }).ok).toBe(true)
  })
  it('doctor changes status, patient may only cancel a scheduled one', () => {
    expect(setAppointmentStatus(seedData, 'a1', 'completed', meera).data.appointments[0].status).toBe('completed')
    expect(setAppointmentStatus(seedData, 'a1', 'completed', arjun).ok).toBe(false)
    expect(setAppointmentStatus(seedData, 'a1', 'cancelled', ananya).ok).toBe(false)
    const mine = bookAppointment(seedData, form, meera, { today, id: 'ax' }).data
    const r = setAppointmentStatus(mine, 'ax', 'cancelled', ananya)
    expect(r.ok).toBe(true)
    expect(r.data.notifications[0].recipientIds).toEqual(['u-meera'])
    expect(setAppointmentStatus(mine, 'ax', 'completed', ananya).ok).toBe(false)
    expect(setAppointmentStatus(mine, 'ax', 'cancelled', ravi).ok).toBe(false)
  })
  it('lists appointments by role, soonest first', () => {
    const d = bookAppointment(seedData, { ...form, date: '2000-01-01' }, meera, { today: '1999-01-01', id: 'early' }).data
    expect(appointmentsFor(d, meera, [d.patients[0]]).map(a => a.id)).toEqual(['early', 'a1'])
    expect(appointmentsFor(d, ananya, [d.patients[0]]).length).toBe(2)
    expect(appointmentsFor(d, arjun, [d.patients[1]]).map(a => a.id)).toEqual(['a2'])
  })
})
