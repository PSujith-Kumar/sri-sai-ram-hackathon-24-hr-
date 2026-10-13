const clean = (value) => String(value ?? '').trim()

export function summarizeDescription(description, maxLength = 150) {
  const text = clean(description).replace(/\s+/g, ' ')
  if (!text) return 'No clinical summary was provided.'
  const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()
  const summary = firstSentence && firstSentence.length <= maxLength ? firstSentence : text
  return summary.length <= maxLength ? summary : `${summary.slice(0, maxLength - 1).trimEnd()}…`
}

export function createHealthRecord({ values, patientId, createdBy, id = `r${Date.now()}` }) {
  const description = clean(values.description)
  return {
    id,
    patientId,
    title: clean(values.title),
    hospital: clean(values.hospital),
    type: clean(values.type),
    date: clean(values.date),
    description,
    summary: clean(values.summary) || summarizeDescription(description),
    sharedWithFamily: Boolean(values.sharedWithFamily),
    createdBy,
    createdAt: new Date().toISOString(),
  }
}

export function filterHealthRecords(records, { patientIds, familyOnly = false, query = '' }) {
  const ids = new Set(patientIds)
  const needle = clean(query).toLowerCase()
  return records.filter((record) => {
    if (!ids.has(record.patientId) || (familyOnly && !record.sharedWithFamily)) return false
    const haystack = [record.title, record.hospital, record.type, record.description, record.summary].join(' ').toLowerCase()
    return !needle || haystack.includes(needle)
  })
}

export function addNotification(data, {
  message,
  recipientIds,
  page = 'dashboard',
  type = 'info',
  createdAt = new Date().toISOString(),
  id = `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
}) {
  const recipients = [...new Set((recipientIds || []).filter(Boolean))]
  if (!recipients.length) return data
  const notification = { id, message: clean(message), recipientIds: recipients, page, type, createdAt, readBy: [] }
  return { ...data, notifications: [notification, ...(data.notifications || [])] }
}

export function queueRecipientIds(data, queueId, actingUserId) {
  const patientIds = new Set(data.tokens.filter(token => token.queueId === queueId && token.status === 'waiting').map(token => token.patientId))
  const recipients = new Set(actingUserId ? [actingUserId] : [])
  data.patients.filter(patient => patientIds.has(patient.id)).forEach((patient) => {
    recipients.add(patient.userId)
    patient.familyLinks
      .filter(link => link.status === 'approved' && link.permissions.includes('queue'))
      .forEach(link => recipients.add(link.userId))
  })
  return [...recipients]
}

export function hydrateCareData(stored, seed) {
  const source = stored && typeof stored === 'object' ? stored : seed
  const now = new Date().toISOString()
  return {
    ...seed,
    ...source,
    records: (source.records || seed.records || []).map(record => {
      const description = clean(record.description) || `${record.type} issued by ${record.hospital}. Open the report to review the saved details.`
      return { ...record, description, summary: clean(record.summary) || summarizeDescription(description) }
    }),
    queues: (source.queues || seed.queues || []).map(queue => ({ ...queue, updatedAt: queue.updatedAt || now })),
    notifications: Array.isArray(source.notifications) ? source.notifications : (seed.notifications || []),
  }
}
