import { describe, expect, it } from 'vitest'
import { hydrateCareData, localDate, rolloverMedications } from '../src/careFlow'
import { floorPlans, seedData } from '../src/data'
import {
  addMedication, adherenceToday, canMarkDose, canModify, canSchedule, deleteMedication, endDateFromDays, isActive, scheduleFor, scheduledByLabel,
  setDoseStatus, statusToday, updateMedication, validateMedication,
} from '../src/medminder'

const clone = (x) => JSON.parse(JSON.stringify(x))
const fresh = () => hydrateCareData(clone({ ...seedData, floorPlans: clone(floorPlans) }), clone({ ...seedData, floorPlans: clone(floorPlans) }))
const user = (id) => seedData.users.find(u => u.id === id)
const meera = user('u-meera')      // assigned doctor of p1
const arjun = user('u-arjun')      // doctor of p2, NOT p1's
const ravi = user('u-ravi')        // approved family of p1 with the medications permission
const ananya = user('u-ananya')    // patient p1
const admin = user('u-admin')
const NOW = new Date(2026, 9, 14, 9, 30) // 14 Oct 2026, 09:30
const TODAY = '2026-10-14'
const form = { name: 'Metformin', instruction: '1 tablet', time: '08:00', note: 'After breakfast', days: '' }

describe('who may schedule', () => {
  const data = fresh()
  const p1 = data.patients.find(p => p.id === 'p1')

  it('lets the assigned doctor and an approved family caregiver schedule, nobody else', () => {
    expect(canSchedule(meera, p1)).toBe(true)
    expect(canSchedule(ravi, p1)).toBe(true)
    expect(canSchedule(arjun, p1)).toBe(false)   // a doctor who is not this patient's doctor
    expect(canSchedule(ananya, p1)).toBe(false)  // patients track, they do not prescribe
    expect(canSchedule(admin, p1)).toBe(false)
    expect(canSchedule(null, p1)).toBe(false)
  })

  it('needs an approved link that includes the medications permission', () => {
    const revoked = { ...p1, familyLinks: [{ ...p1.familyLinks[0], status: 'revoked' }] }
    const noPerm = { ...p1, familyLinks: [{ ...p1.familyLinks[0], permissions: ['queue', 'records'] }] }
    expect(canSchedule(ravi, revoked)).toBe(false)
    expect(canSchedule(ravi, noPerm)).toBe(false)
  })

  it('lets doctors change any medicine but family only the ones they added', () => {
    const familyMed = { id: 'x', scheduledBy: 'u-ravi' }
    const doctorMed = { id: 'y', scheduledBy: 'u-meera' }
    expect(canModify(meera, p1, familyMed)).toBe(true)
    expect(canModify(meera, p1, doctorMed)).toBe(true)
    expect(canModify(ravi, p1, familyMed)).toBe(true)
    expect(canModify(ravi, p1, doctorMed)).toBe(false)           // a family member cannot alter a prescription
    expect(canModify(ravi, p1, { id: 'z' })).toBe(false)         // nor an older entry with no author
    expect(canModify(ananya, p1, familyMed)).toBe(false)
  })

  it('lets only the patient mark doses', () => {
    expect(canMarkDose(ananya, p1)).toBe(true)
    expect([meera, ravi, admin].some(u => canMarkDose(u, p1))).toBe(false)
  })
})

describe('validateMedication', () => {
  it('accepts a good form', () => expect(validateMedication(form).ok).toBe(true))

  it('checks each field', () => {
    const errors = validateMedication({ name: 'a', instruction: '', time: '25:99', note: 'x'.repeat(121), days: '0' }).errors
    expect(Object.keys(errors).sort()).toEqual(['days', 'instruction', 'name', 'note', 'time'])
  })

  it('rejects the same medicine at the same time twice, but allows another time', () => {
    const existing = [{ id: 'm1', name: 'metformin', time: '08:00' }]
    expect(validateMedication(form, { existing }).errors.time).toMatch(/already scheduled/)
    expect(validateMedication({ ...form, time: '20:00' }, { existing }).ok).toBe(true)
    expect(validateMedication(form, { existing, ignoreId: 'm1' }).ok).toBe(true) // editing itself
  })
})

describe('dates and daily status', () => {
  it('counts the end date inclusively and across month ends', () => {
    expect(endDateFromDays('5', TODAY)).toBe('2026-10-18')
    expect(endDateFromDays(3, '2026-10-30')).toBe('2026-11-01')
    expect(endDateFromDays(1, TODAY)).toBe(TODAY)
    expect(endDateFromDays('', TODAY)).toBeNull()
    expect(endDateFromDays(0, TODAY)).toBeNull()
  })

  it('knows when a course has ended', () => {
    expect(isActive({ endDate: TODAY }, TODAY)).toBe(true)
    expect(isActive({ endDate: '2026-10-13' }, TODAY)).toBe(false)
    expect(isActive({}, TODAY)).toBe(true)
  })

  it('does not let yesterday\'s "taken" count today', () => {
    expect(statusToday({ status: 'taken', statusDate: '2026-10-13' }, TODAY)).toBe('unconfirmed')
    expect(statusToday({ status: 'taken', statusDate: TODAY }, TODAY)).toBe('taken')
    expect(statusToday({ status: 'taken' }, TODAY)).toBe('taken') // older entry without a date
  })

  it('resets old statuses at rollover and returns the same array when nothing changed', () => {
    const meds = [{ id: 'a', status: 'taken', statusDate: '2026-10-13' }, { id: 'b', status: 'taken', statusDate: TODAY }, { id: 'c', status: 'taken' }]
    const rolled = rolloverMedications(meds, TODAY)
    expect(rolled.map(m => m.status)).toEqual(['unconfirmed', 'taken', 'taken'])
    expect(rolled.every(m => m.statusDate === TODAY)).toBe(true)
    expect(rolloverMedications(rolled, TODAY)).toBe(rolled)
    expect(meds[0].status).toBe('taken') // original untouched
  })

  it('applies the rollover when the app loads its data', () => {
    const stored = { ...clone(seedData), medications: [{ id: 'old', patientId: 'p1', name: 'X', instruction: '1', time: '09:00', note: '', status: 'taken', statusDate: '2020-01-01' }] }
    expect(hydrateCareData(stored, clone(seedData)).medications[0]).toMatchObject({ status: 'unconfirmed', statusDate: localDate() })
  })

  it('lists today\'s schedule in time order, with finished courses separate', () => {
    let data = fresh()
    data = addMedication(data, { ...form, name: 'Early', time: '06:00' }, 'p1', meera, { now: NOW, id: 'e' }).data
    data = addMedication(data, { ...form, name: 'Short', time: '07:00', days: '1' }, 'p1', meera, { now: new Date(2026, 9, 10), id: 's' }).data // ended on the 10th
    const { active, ended } = scheduleFor(data, 'p1', TODAY)
    expect(active.map(m => m.time)).toEqual([...active.map(m => m.time)].sort())
    expect(active[0].name).toBe('Early')
    expect(ended.map(m => m.name)).toEqual(['Short'])
    expect(adherenceToday(active)).toMatchObject({ taken: expect.any(Number), pending: expect.any(Number) })
  })
})

describe('scheduling a medicine', () => {
  it('lets the doctor schedule it, and tells the patient and the family', () => {
    const data = fresh()
    const r = addMedication(data, form, 'p1', meera, { now: NOW, id: 'm-new' })
    expect(r.ok).toBe(true)
    expect(r.medication).toMatchObject({ id: 'm-new', patientId: 'p1', name: 'Metformin', instruction: '1 tablet', time: '08:00', note: 'After breakfast', status: 'unconfirmed', statusDate: TODAY, scheduledBy: 'u-meera', scheduledByRole: 'doctor' })
    expect(r.medication.endDate).toBeUndefined()
    expect(r.data.medications.some(m => m.id === 'm-new')).toBe(true)
    const n = r.data.notifications[0]
    expect(n.recipientIds.sort()).toEqual(['u-ananya', 'u-ravi'])
    expect(n.message).toMatch(/Dr\. Meera Shah scheduled Metformin \(1 tablet\) at 8:00/i)
    expect(n.page).toBe('medications')
  })

  it('lets family schedule it, and tells the patient and the doctor but not themselves', () => {
    const r = addMedication(fresh(), { ...form, days: '7' }, 'p1', ravi, { now: NOW, id: 'm-fam' })
    expect(r.ok).toBe(true)
    expect(r.medication).toMatchObject({ scheduledByRole: 'family', endDate: '2026-10-20' })
    expect(r.data.notifications[0].recipientIds.sort()).toEqual(['u-ananya', 'u-meera'])
    expect(scheduledByLabel(r.medication)).toBe('Added by Ravi Kumar (family)')
  })

  it('labels doctors\' prescriptions and older entries', () => {
    expect(scheduledByLabel({ scheduledBy: 'u-meera', scheduledByRole: 'doctor', scheduledByName: 'Dr. Meera Shah' })).toBe('Prescribed by Dr. Meera Shah')
    expect(scheduledByLabel({ name: 'old' })).toBe('Existing prescription')
  })

  it('refuses anyone who is not allowed, without changing anything', () => {
    const data = fresh()
    const before = JSON.stringify(data)
    for (const who of [arjun, ananya, admin]) {
      const r = addMedication(data, form, 'p1', who, { now: NOW })
      expect(r).toMatchObject({ ok: false, error: 'not-allowed' })
    }
    expect(JSON.stringify(data)).toBe(before)
  })

  it('returns field errors for a bad form and does not create anything', () => {
    const data = fresh()
    const r = addMedication(data, { ...form, name: '', time: '' }, 'p1', meera, { now: NOW })
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['name', 'time'])
  })

  it('does not mutate the original data', () => {
    const data = fresh()
    const before = JSON.stringify(data)
    addMedication(data, form, 'p1', meera, { now: NOW })
    expect(JSON.stringify(data)).toBe(before)
  })
})

describe('editing and deleting', () => {
  const base = addMedication(fresh(), form, 'p1', ravi, { now: NOW, id: 'fam-med' }).data
  const withRx = addMedication(base, { ...form, name: 'Aspirin', time: '09:00' }, 'p1', meera, { now: NOW, id: 'rx' }).data

  it('lets the doctor change a family entry, and resets the dose when the instruction changes', () => {
    const marked = setDoseStatus(withRx, 'fam-med', 'taken', ananya, { now: NOW }).data
    const r = updateMedication(marked, 'fam-med', { ...form, instruction: '2 tablets' }, meera, { now: NOW })
    expect(r.ok).toBe(true)
    expect(r.medication).toMatchObject({ instruction: '2 tablets', status: 'unconfirmed', updatedBy: 'u-meera' })
    expect(r.data.notifications[0].recipientIds).toContain('u-ananya')
  })

  it('keeps today\'s status when only the note changes', () => {
    const marked = setDoseStatus(withRx, 'fam-med', 'taken', ananya, { now: NOW }).data
    const r = updateMedication(marked, 'fam-med', { ...form, note: 'With milk' }, ravi, { now: NOW })
    expect(r.medication).toMatchObject({ note: 'With milk', status: 'taken' })
  })

  it('stops family changing or deleting a doctor\'s prescription', () => {
    expect(updateMedication(withRx, 'rx', { ...form, name: 'Aspirin', instruction: '5 tablets', time: '09:00' }, ravi, { now: NOW })).toMatchObject({ ok: false, error: 'not-allowed' })
    expect(deleteMedication(withRx, 'rx', ravi)).toMatchObject({ ok: false, error: 'not-allowed' })
  })

  it('stops an edit that would duplicate another entry', () => {
    const r = updateMedication(withRx, 'fam-med', { ...form, name: 'Aspirin', time: '09:00' }, meera, { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.errors.time).toMatch(/already scheduled/)
  })

  it('lets family delete their own entry and the doctor delete any, telling the patient', () => {
    const own = deleteMedication(withRx, 'fam-med', ravi)
    expect(own.ok).toBe(true)
    expect(own.data.medications.some(m => m.id === 'fam-med')).toBe(false)
    expect(own.data.notifications[0].recipientIds).toContain('u-ananya')
    expect(deleteMedication(withRx, 'rx', meera).ok).toBe(true)
    expect(deleteMedication(withRx, 'missing', meera).ok).toBe(false)
  })
})

describe('marking doses', () => {
  const data = addMedication(fresh(), form, 'p1', meera, { now: NOW, id: 'dose' }).data

  it('lets the patient mark taken, skipped or undo, stamped with today', () => {
    const taken = setDoseStatus(data, 'dose', 'taken', ananya, { now: NOW })
    expect(taken.data.medications.find(m => m.id === 'dose')).toMatchObject({ status: 'taken', statusDate: TODAY })
    expect(setDoseStatus(taken.data, 'dose', 'unconfirmed', ananya, { now: NOW }).data.medications.find(m => m.id === 'dose').status).toBe('unconfirmed')
  })

  it('refuses everyone else and unknown statuses', () => {
    expect(setDoseStatus(data, 'dose', 'taken', ravi, { now: NOW })).toMatchObject({ ok: false })
    expect(setDoseStatus(data, 'dose', 'taken', meera, { now: NOW })).toMatchObject({ ok: false })
    expect(setDoseStatus(data, 'dose', 'eaten', ananya, { now: NOW })).toMatchObject({ ok: false })
  })

  it('tells the doctor and family about a skipped dose, but stays quiet about a taken one', () => {
    const before = data.notifications.length
    expect(setDoseStatus(data, 'dose', 'taken', ananya, { now: NOW }).data.notifications).toHaveLength(before)
    const skipped = setDoseStatus(data, 'dose', 'skipped', ananya, { now: NOW }).data.notifications[0]
    expect(skipped.recipientIds.sort()).toEqual(['u-meera', 'u-ravi'])
    expect(skipped.message).toMatch(/Ananya Kumar skipped Metformin/)
  })
})
