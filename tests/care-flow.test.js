import { describe, expect, it } from 'vitest'
import { addNotification, createHealthRecord, filterHealthRecords, hydrateCareData, queueRecipientIds, summarizeDescription } from '../src/careFlow'

describe('connected health records', () => {
  it('creates a report with a description and generated summary', () => {
    const record = createHealthRecord({
      patientId: 'p1',
      createdBy: 'u-ananya',
      id: 'r-new',
      values: {
        title: 'Blood pressure review', hospital: 'Sanjeevani', type: 'Consultation note', date: '2026-10-13',
        description: 'Blood pressure remained stable during the visit. Continue the existing monitoring plan.',
        summary: '', sharedWithFamily: true,
      },
    })
    expect(record.description).toContain('remained stable')
    expect(record.summary).toBe('Blood pressure remained stable during the visit.')
    expect(record.sharedWithFamily).toBe(true)
  })

  it('shows family only the records explicitly shared with them', () => {
    const records = [
      { id: 'shared', patientId: 'p1', title: 'Shared', sharedWithFamily: true, description: 'Visible result' },
      { id: 'private', patientId: 'p1', title: 'Private', sharedWithFamily: false, description: 'Hidden result' },
    ]
    expect(filterHealthRecords(records, { patientIds: ['p1'], familyOnly: true })).toEqual([records[0]])
    expect(filterHealthRecords(records, { patientIds: ['p1'], familyOnly: true, query: 'visible' })).toEqual([records[0]])
  })

  it('hydrates old saved reports so they can be opened with a readable description', () => {
    const seed = { records: [], queues: [], notifications: [] }
    const hydrated = hydrateCareData({ records: [{ id: 'r1', type: 'Scan', hospital: 'Demo Hospital' }], queues: [] }, seed)
    expect(hydrated.records[0].description).toContain('Scan issued by Demo Hospital')
    expect(hydrated.records[0].summary).toBeTruthy()
  })
})

describe('connected notifications and queues', () => {
  const data = {
    notifications: [],
    tokens: [{ queueId: 'q1', patientId: 'p1', status: 'waiting' }],
    patients: [{ id: 'p1', userId: 'u-patient', familyLinks: [{ userId: 'u-family', status: 'approved', permissions: ['queue'] }] }],
  }

  it('notifies the operator, patient and approved family when a queue changes', () => {
    expect(queueRecipientIds(data, 'q1', 'u-doctor')).toEqual(['u-doctor', 'u-patient', 'u-family'])
  })

  it('stores a navigable unread notification', () => {
    const next = addNotification(data, { id: 'n1', message: 'Queue advanced', recipientIds: ['u-patient'], page: 'queue' })
    expect(next.notifications[0]).toMatchObject({ id: 'n1', page: 'queue', readBy: [] })
  })

  it('creates concise summaries for long descriptions', () => {
    expect(summarizeDescription('A'.repeat(200), 50)).toHaveLength(50)
  })
})
