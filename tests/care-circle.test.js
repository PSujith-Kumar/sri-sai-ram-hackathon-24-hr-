import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data'
import { acknowledgeRequest, familyMay, sendCareRequest, setFamilyAccess, setFamilyPermission } from '../src/careCircle'

const ananya = seedData.users.find(u => u.id === 'u-ananya')
const ravi = seedData.users.find(u => u.id === 'u-ravi')
const meera = seedData.users.find(u => u.id === 'u-meera')

describe('CareCircle', () => {
  it('a check-in notifies approved family with care access', () => {
    const r = sendCareRequest(seedData, 'p1', 'I am okay', 'normal')
    expect(r.ok).toBe(true)
    expect(r.recipients).toEqual(['u-ravi'])
    expect(r.data.careRequests[0].status).toBe('waiting')
    expect(r.data.notifications[0].recipientIds).toEqual(['u-ravi'])
  })
  it('an urgent check-in also alerts the doctor', () => {
    const r = sendCareRequest(seedData, 'p1', 'I need help', 'high')
    expect(r.recipients).toEqual(['u-ravi', 'u-meera'])
    expect(r.data.notifications[0].type).toBe('warning')
  })
  it('does not notify revoked family', () => {
    const revoked = setFamilyAccess(seedData, 'p1', 'u-ravi', false, ananya).data
    const before = revoked.notifications.length
    expect(sendCareRequest(revoked, 'p1', 'I am okay', 'normal').data.notifications.length).toBe(before)
  })
  it('family acknowledge and the patient is told', () => {
    const sent = sendCareRequest(seedData, 'p1', 'Please call me', 'medium', { id: 'cx' }).data
    const r = acknowledgeRequest(sent, 'cx', ravi)
    expect(r.ok).toBe(true)
    expect(r.data.careRequests.find(c => c.id === 'cx').status).toBe('acknowledged')
    expect(r.data.notifications[0].recipientIds).toEqual(['u-ananya'])
    expect(acknowledgeRequest(sent, 'cx', meera).ok).toBe(false)
  })
  it('only the patient controls family access', () => {
    expect(setFamilyAccess(seedData, 'p1', 'u-ravi', false, ravi).ok).toBe(false)
    expect(setFamilyAccess(seedData, 'p1', 'u-ravi', false, meera).ok).toBe(false)
    const r = setFamilyAccess(seedData, 'p1', 'u-ravi', false, ananya)
    expect(r.data.patients[0].familyLinks[0].status).toBe('revoked')
    expect(r.data.notifications[0].recipientIds).toEqual(['u-ravi'])
    expect(seedData.patients[0].familyLinks[0].status).toBe('approved')
  })
  it('permissions switch one at a time and familyMay follows them', () => {
    const r = setFamilyPermission(seedData, 'p1', 'u-ravi', 'records', false, ananya)
    expect(r.data.patients[0].familyLinks[0].permissions).not.toContain('records')
    expect(familyMay(ravi, r.data.patients[0], 'records')).toBe(false)
    expect(familyMay(ravi, r.data.patients[0], 'queue')).toBe(true)
    expect(familyMay(meera, r.data.patients[0], 'records')).toBe(true)
    expect(setFamilyPermission(seedData, 'p1', 'u-ravi', 'bogus', true, ananya).ok).toBe(false)
  })
})
