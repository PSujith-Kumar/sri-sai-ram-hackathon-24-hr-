const clean = (value) => String(value ?? '').trim()
const arrayOr = (value, fallback = []) => (Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : []))
export const REPORT_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Today's date as YYYY-MM-DD in the user's own time zone (not UTC), so "today" matches their clock. */
export const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/**
 * Doses are tracked per day. A dose marked on an earlier day goes back to "unconfirmed", so yesterday's
 * "taken" never hides today's dose. Returns the SAME array when nothing changed (cheap to compare).
 */
export function rolloverMedications(medications = [], today = localDate()) {
  let changed = false
  const next = medications.map((m) => {
    if (m.statusDate === today) return m
    changed = true
    // entries created before daily tracking existed keep their status once, then follow the rule
    return m.statusDate ? { ...m, status: 'unconfirmed', statusDate: today } : { ...m, statusDate: today }
  })
  return changed ? next : medications
}

export function summarizeDescription(description, maxLength = 150) {
  const text = clean(description).replace(/\s+/g, ' ')
  if (!text) return 'No clinical summary was provided.'
  const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()
  const summary = firstSentence && firstSentence.length <= maxLength ? firstSentence : text
  return summary.length <= maxLength ? summary : `${summary.slice(0, maxLength - 1).trimEnd()}…`
}

export function createHealthRecord({ values, patientId, createdBy, id = `r${Date.now()}`, createdAt = new Date().toISOString() }) {
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
    createdAt,
  }
}

export function healthRecordDeletionPolicy(record, userId, now = Date.now()) {
  if (!record || record.createdBy !== userId) {
    return { allowed: false, reason: 'creator-only', expiresAt: null, remainingMs: 0 }
  }

  const createdAtMs = new Date(record.createdAt).getTime()
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : new Date(now).getTime()
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) {
    return { allowed: false, reason: 'expired', expiresAt: null, remainingMs: 0 }
  }

  const expiresAtMs = createdAtMs + REPORT_DELETE_WINDOW_MS
  const remainingMs = Math.max(0, expiresAtMs - nowMs)
  return {
    allowed: remainingMs > 0,
    reason: remainingMs > 0 ? 'allowed' : 'expired',
    expiresAt: new Date(expiresAtMs).toISOString(),
    remainingMs,
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
  const seedPatients = arrayOr(seed.patients)
  const patients = arrayOr(source.patients, seedPatients).map(patient => {
    const seeded = seedPatients.find(item => item.id === patient.id) || {}
    const merged = { ...seeded, ...patient }
    const seededLinks = arrayOr(seeded.familyLinks)
    return {
      ...merged,
      doctorIds: arrayOr(merged.doctorIds, seeded.doctorIds),
      allergies: arrayOr(merged.allergies, seeded.allergies),
      conditions: arrayOr(merged.conditions, seeded.conditions),
      familyLinks: arrayOr(merged.familyLinks, seededLinks).map(link => {
        const seededLink = seededLinks.find(item => item.userId === link.userId) || {}
        const next = { ...seededLink, ...link }
        return { ...next, permissions: arrayOr(next.permissions, seededLink.permissions) }
      }),
    }
  })
  const seedCompanion = seed.companion && typeof seed.companion === 'object' ? seed.companion : {}
  const sourceCompanion = source.companion && typeof source.companion === 'object' ? source.companion : seedCompanion
  const companion = Object.fromEntries(Object.entries(sourceCompanion).map(([patientId, value]) => {
    const seeded = seedCompanion[patientId] || {}
    const saved = value && typeof value === 'object' ? value : {}
    const merged = { ...seeded, ...saved }
    return [patientId, {
      ...merged,
      profile: { ...(seeded.profile || {}), ...(saved.profile || {}) },
      moods: arrayOr(merged.moods, seeded.moods),
      events: arrayOr(merged.events, seeded.events).map(event => ({ ...event, reasons: arrayOr(event.reasons) })),
      relayQueue: arrayOr(merged.relayQueue, seeded.relayQueue).map(item => ({ ...item, reasons: arrayOr(item.reasons) })),
      memory: arrayOr(merged.memory, seeded.memory),
      learning: { ...(seeded.learning || {}), ...(saved.learning || {}) },
    }]
  }))
  return {
    ...seed,
    ...source,
    users: arrayOr(source.users, seed.users).map(user => {
      const seeded = arrayOr(seed.users).find(seedUser => seedUser.id === user.id) || {}
      const merged = { ...seeded, ...user }
      return { ...merged, hospitalIds: arrayOr(merged.hospitalIds, seeded.hospitalIds) }
    }),
    patients,
    records: arrayOr(source.records, seed.records).map(record => {
      const description = clean(record.description) || `${record.type} issued by ${record.hospital}. Open the report to review the saved details.`
      const legacyDate = record.date ? new Date(`${record.date}T12:00:00.000Z`) : new Date(0)
      const createdAt = record.createdAt || (Number.isFinite(legacyDate.getTime()) ? legacyDate.toISOString() : new Date(0).toISOString())
      return {
        ...record,
        description,
        summary: clean(record.summary) || summarizeDescription(description),
        createdBy: record.createdBy || 'system',
        createdAt,
      }
    }),
    queues: arrayOr(source.queues, seed.queues).map(queue => ({ ...queue, updatedAt: queue.updatedAt || now })),
    notifications: arrayOr(source.notifications, seed.notifications).map(item => ({
      ...item,
      recipientIds: arrayOr(item.recipientIds),
      readBy: arrayOr(item.readBy),
    })),
    medications: rolloverMedications(arrayOr(source.medications, seed.medications)),
    hospitalAlerts: arrayOr(source.hospitalAlerts, seed.hospitalAlerts).map(alert => {
      const seeded = arrayOr(seed.hospitalAlerts).find(item => item.id === alert.id) || {}
      const merged = { ...seeded, ...alert }
      return { ...merged, reasons: arrayOr(merged.reasons, seeded.reasons) }
    }),
    companion,
    // hospital maps: built-in ones plus any the admin created or edited (stored ones win)
    floorPlans: { ...(seed.floorPlans || {}), ...(source.floorPlans || {}) },
  }
}
