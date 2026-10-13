// Offline relay: builds a compact USSD/SMS payload that works with no internet.
// Browsers cannot send USSD silently, so the app prepares the code and a one-tap dial link;
// the phone's dialler sends it over the mobile network. The gateway shortcode is configurable.

export const USSD_CONFIG = {
  gatewayCode: '123',                 // dialled as *123*…#; replace with the hospital's real USSD service
  smsFallbackNumber: '+910000000000', // placeholder hospital emergency desk number
  maxLength: 182,                     // typical USSD string limit
}

const LEVEL_CODE = { 2: 'U', 3: 'C' }
const pad = (n) => String(n).padStart(2, '0')

/** "SMH-20481" → { hospital: 'SMH', number: '20481' } */
export function parseMrn(mrn = '') {
  const [hospital = 'UNK', number = '0'] = mrn.split('-')
  return { hospital: hospital.toUpperCase(), number: number.replace(/\D/g, '') || '0' }
}

export function buildUssdCode({ mrn, level, codes = [], at = new Date(), config = USSD_CONFIG }) {
  const { number } = parseMrn(mrn)
  const lv = LEVEL_CODE[level] || 'W'
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`
  const full = `*${config.gatewayCode}*${number}*${lv}*${codes.length ? codes.join('-') : 'GN'}*${time}#`
  return full.length <= config.maxLength ? full : `*${config.gatewayCode}*${number}*${lv}*${codes[0] || 'GN'}*${time}#`
}

/** tel: link. The '#' must be percent-encoded for the dialler to keep it. */
export const ussdDialHref = (code) => `tel:${code.replace(/#/g, '%23')}`

export function buildSmsText({ patientName, mrn, hospitalName, reasons = [], at = new Date() }) {
  const when = at.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
  return `CAREBRIDGE ALERT ${mrn}: ${patientName} needs attention (${reasons.join(', ') || 'general'}) at ${when}. ${hospitalName || ''}`.trim()
}

export const smsHref = (number, text) => `sms:${number}?body=${encodeURIComponent(text)}`

const ageFrom = (dob, now) => (dob ? Math.floor((now - new Date(dob)) / 31557600000) : null)

/** Everything a responder needs, as plain text to be spoken aloud, texted or read by the hospital desk. */
export function buildBriefing({ patient, patientName, hospitalName, meds = [], reasons = [], at = new Date() }) {
  const { conditions = [], allergies = [], bloodGroup = 'unknown' } = patient
  const age = ageFrom(patient.dob, at.getTime())
  const medicines = meds.map(m => `${m.name} ${m.instruction}`).join(', ')
  return [
    `Emergency alert for ${patientName}${age ? `, age ${age}` : ''}.`,
    `Medical ID ${patient.mrn}${hospitalName ? ` at ${hospitalName}` : ''}. Blood group ${bloodGroup}.`,
    `Reason: ${reasons.join(', ') || 'general concern'}.`,
    `Conditions: ${conditions.join(', ') || 'none recorded'}. Allergies: ${allergies.join(', ') || 'none recorded'}.`,
    medicines ? `Current medicines: ${medicines}.` : '',
    'Please send help.',
  ].filter(Boolean).join(' ')
}

export const isMobileDevice = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)

export function makeRelayItem({ patient, patientName, hospitalName, assessment, meds = [], at = new Date(), id = `relay-${at.getTime()}` }) {
  return {
    id,
    createdAt: at.toISOString(),
    mrn: patient.mrn,
    patientId: patient.id,
    level: assessment.level,
    codes: assessment.codes,
    reasons: assessment.reasons,
    ussd: buildUssdCode({ mrn: patient.mrn, level: assessment.level, codes: assessment.codes, at }),
    sms: buildSmsText({ patientName, mrn: patient.mrn, hospitalName, reasons: assessment.reasons, at }),
    briefing: buildBriefing({ patient, patientName, hospitalName, meds, reasons: assessment.reasons, at }),
    status: 'queued',
    via: null,
  }
}

// Queue helpers are immutable: they always return a new array.
export const enqueue = (queue = [], item) => [item, ...queue]
export const markSent = (queue = [], id, via, at = new Date()) => queue.map(i => (i.id === id ? { ...i, status: 'sent', via, sentAt: at.toISOString() } : i))
export const pending = (queue = []) => queue.filter(i => i.status === 'queued')
