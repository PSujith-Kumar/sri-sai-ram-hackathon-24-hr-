import { describe, expect, it } from 'vitest'
import { floorPlans, seedData } from '../src/data'

const ids = list => new Set(list.map(item => item.id))

describe('fictional demo data', () => {
  it('is rich enough to exercise every main workflow', () => {
    expect(seedData.hospitals.length).toBeGreaterThanOrEqual(4)
    expect(seedData.users.length).toBeGreaterThanOrEqual(25)
    expect(seedData.patients.length).toBeGreaterThanOrEqual(10)
    expect(seedData.records.length).toBeGreaterThanOrEqual(15)
    expect(seedData.medications.length).toBeGreaterThanOrEqual(15)
    expect(seedData.appointments.length).toBeGreaterThanOrEqual(10)
    expect(seedData.notifications.length).toBeGreaterThanOrEqual(7)
    expect(seedData.hospitalAlerts.length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(seedData.companion).length).toBeGreaterThanOrEqual(1)
  })

  it('keeps every hospital, person and care relationship connected', () => {
    const hospitalIds = ids(seedData.hospitals)
    const userIds = ids(seedData.users)
    const patientIds = ids(seedData.patients)
    const departmentIds = ids(seedData.departments)
    const queueIds = ids(seedData.queues)

    for (const hospital of seedData.hospitals) {
      expect(userIds.has(hospital.deanId)).toBe(true)
      expect(seedData.departments.some(department => department.hospitalId === hospital.id)).toBe(true)
      expect(floorPlans[hospital.id]).toBeTruthy()
    }
    for (const patient of seedData.patients) {
      expect(userIds.has(patient.userId)).toBe(true)
      expect(hospitalIds.has(patient.hospitalId)).toBe(true)
      expect(patient.doctorIds.every(id => userIds.has(id))).toBe(true)
      expect(patient.familyLinks.every(link => userIds.has(link.userId))).toBe(true)
    }
    for (const queue of seedData.queues) {
      expect(hospitalIds.has(queue.hospitalId)).toBe(true)
      expect(departmentIds.has(queue.departmentId)).toBe(true)
      expect(userIds.has(queue.doctorId)).toBe(true)
    }
    expect(seedData.tokens.every(token => queueIds.has(token.queueId) && patientIds.has(token.patientId))).toBe(true)
    expect(seedData.records.every(record => patientIds.has(record.patientId) && userIds.has(record.createdBy))).toBe(true)
    expect(seedData.medications.every(medicine => patientIds.has(medicine.patientId))).toBe(true)
    expect(seedData.appointments.every(appointment => patientIds.has(appointment.patientId) && userIds.has(appointment.doctorId) && hospitalIds.has(appointment.hospitalId) && departmentIds.has(appointment.departmentId))).toBe(true)
    expect(seedData.hospitalAlerts.every(alert => patientIds.has(alert.patientId) && hospitalIds.has(alert.hospitalId))).toBe(true)
  })

  it('gives every report and medicine useful test content', () => {
    expect(seedData.records.every(record => record.description.length >= 20 && record.summary.length >= 10)).toBe(true)
    expect(seedData.medications.every(medicine => medicine.name && medicine.instruction && /^\d{2}:\d{2}$/.test(medicine.time) && medicine.note)).toBe(true)
  })
})
