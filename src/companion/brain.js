// Decision logic for the AI companion. Pure functions only: no browser APIs, easy to test.

import { predictMood } from './mood'

export const LEVEL = { none: 0, watch: 1, urgent: 2, critical: 3 }
export const LEVEL_NAMES = ['normal', 'watch', 'urgent', 'critical']

// code → human label, shared with the USSD encoder
export const REASON_LABELS = {
  CP: 'chest pain', BR: 'trouble breathing', FN: 'fainting', ST: 'possible stroke signs', BL: 'heavy bleeding',
  FL: 'a fall', SY: 'concerning symptoms', HP: 'asked for help', PN: 'pain or discomfort', MH: 'emotional crisis',
  AL: 'allergy risk', BP: 'symptoms with known hypertension', NR: 'no response', MD: 'medication not confirmed', IN: 'unusual inactivity',
  FV: 'high body temperature', HZ: 'heat hazard in the room', AB: 'abnormal activity confirmed',
  ML: 'distress detected by the AI mood model',
}

const SYMPTOM_RULES = [
  { re: /chest (pain|tight|pressure)|heart attack/i, code: 'CP', level: 3 },
  { re: /(can'?t|cannot|unable to) breathe|short(ness)? of breath|breathless|difficulty breathing/i, code: 'BR', level: 3, selfNegating: true },
  { re: /faint(ed|ing)?|pass(ed|ing)? out|unconscious|blacked? out|about to collapse|i collapsed/i, code: 'FN', level: 3 },
  { re: /stroke|face (is )?droop|slurred|can'?t (move|feel) (my )?(arm|leg|face)/i, code: 'ST', level: 3 },
  { re: /bleeding (a lot|heavily)|severe bleeding/i, code: 'BL', level: 3 },
  { re: /(don'?t|do not) want to (live|be here|go on)|end my life|kill myself|hurt myself|better off (dead|without me)|tired of living|wish i (were|was) dead|no reason to (live|go on)|ending it all|disappear (for good|forever)|(don'?t|do not) see (why|the point)[^.]{0,30}(carry on|go on|live|continue)/i, code: 'MH', level: 3, selfNegating: true },
  { re: /\bi fell\b|\bfell down\b|had a fall|slipped (and|on)|tumbled|stumbled|landed on the (floor|ground)|lost my balance|legs gave way/i, code: 'FL', level: 2 },
  { re: /help me|i need help|emergency|call (a |the )?doctor/i, code: 'HP', level: 2 },
  { re: /dizz(y|iness)|light-?headed|blurred vision|headache/i, code: 'SY', level: 1 },
  { re: /\bpain\b|hurts?|vomit|nausea|fever/i, code: 'PN', level: 1 },
]

const MOOD_RULES = [
  { mood: 'low', re: /lonely|alone|sad|depress|cry(ing)?|hopeless|miss (my|home)|bored/i },
  { mood: 'anxious', re: /worried|scared|afraid|nervous|anxious|panic|stress/i },
  { mood: 'tired', re: /tired|exhaust|sleepy|can'?t sleep|weak/i },
  { mood: 'happy', re: /great|good|happy|fine|better|wonderful|okay|\bok\b/i },
]

const maxLevel = (levels) => levels.reduce((m, l) => Math.max(m, l), 0)
const unique = (items) => [...new Set(items)]

export function detectMood(text = '') {
  const hit = MOOD_RULES.find(r => r.re.test(text))
  return hit ? hit.mood : 'neutral'
}

export function detectIntent(text = '') {
  if (/(took|taken|had|finished) (my )?(medicine|medication|tablet|pill)/i.test(text)) return 'medicine-taken'
  if (/medicine|medication|tablet|pill/i.test(text)) return 'medicine'
  if (/token|queue|my turn|how long|wait/i.test(text)) return 'queue'
  if (/\bhello\b|\bhi\b|\bhey\b|good (morning|afternoon|evening)/i.test(text)) return 'greeting'
  if (/thank/i.test(text)) return 'thanks'
  return 'chat'
}

// "no chest pain", "I'm not dizzy anymore": a negation shortly before a symptom cancels it.
const NEGATION = /\b(no|not|never|without|free of|don'?t have|do not have|didn'?t have|haven'?t|hasn'?t|isn'?t|aren'?t|wasn'?t|nor)\b[^.!?,;]{0,25}$/i
const isNegated = (text, index) => NEGATION.test(text.slice(Math.max(0, index - 40), index))
const matchesRule = (rule, text) => {
  const m = rule.re.exec(text)
  return Boolean(m) && (rule.selfNegating || !isNegated(text, m.index))
}

const MOOD_CONFIDENCE = 0.45
const SEVERITY_CONFIDENCE = 0.6
const CRITICAL_CONFIDENCE = 0.85
// Chosen from the held-out trade-off table in ml/REPORT.md: 0.5 alerts ~77% of serious sentences at ~7% false alarms.
const SERIOUS_MASS = 0.25
const ALERT_CONFIDENCE = 0.5

/** Trained model's view of the sentence, or null if unavailable. Never overrides the safety rules downward. */
function modelView(text) {
  const ml = predictMood(text)
  if (!ml) return null
  // With no keyword match, only a *confident* model may raise an alert. A moderate score just makes
  // the companion ask a gentle follow-up (watch level), because a false family alert is costly.
  let level = LEVEL.none
  if (ml.seriousProb >= ALERT_CONFIDENCE) level = ml.severityLevel === LEVEL.critical && ml.severityProb >= CRITICAL_CONFIDENCE ? LEVEL.critical : LEVEL.urgent
  else if (ml.seriousProb >= SERIOUS_MASS || (ml.severityLevel === LEVEL.watch && ml.severityProb >= SEVERITY_CONFIDENCE)) level = LEVEL.watch
  return { ...ml, level }
}

export function analyzeUtterance(text = '', { conditions = [], allergies = [] } = {}) {
  const hits = SYMPTOM_RULES.filter(r => matchesRule(r, text))
  const codes = hits.map(h => h.code)
  let level = maxLevel(hits.map(h => h.level))
  const hasHypertension = conditions.some(c => /hypertension|blood pressure/i.test(c))
  if (hasHypertension && codes.includes('SY')) { codes.push('BP'); level = Math.max(level, LEVEL.urgent) }
  const mentionsAllergen = allergies.some(a => a && new RegExp(`\\b${a}\\b`, 'i').test(text)) && /(take|took|taken|give|gave|given|prescri|inject|eat|ate)/i.test(text)
  if (mentionsAllergen) { codes.push('AL'); level = Math.max(level, LEVEL.urgent) }
  const ml = modelView(text)
  if (ml && ml.level > level) { level = ml.level; codes.push('ML') }
  const mood = ml && ml.moodProb >= MOOD_CONFIDENCE ? ml.mood : detectMood(text)
  return { mood, moodConfidence: ml ? ml.moodProb : null, intent: detectIntent(text), level, codes: unique(codes) }
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

export function overdueMedications(meds = [], nowMinutes, graceMinutes = 60) {
  return meds
    .filter(m => m.status === 'unconfirmed' && nowMinutes - toMinutes(m.time) >= graceMinutes)
    .map(m => ({ ...m, overdueBy: nowMinutes - toMinutes(m.time) }))
}

export function dueMedications(meds = [], nowMinutes, windowMinutes = 15) {
  return meds.filter(m => m.status === 'unconfirmed' && Math.abs(nowMinutes - toMinutes(m.time)) <= windowMinutes)
}

/**
 * Combine every signal (what the patient said, camera, missed check-ins, medicines, record)
 * into one decision. `camera.status === 'live'` means the AI can see the patient.
 */
export function assessSituation({ utterance = null, camera = {}, thermal = [], confirmed = false, missedCheckins = 0, meds = [], nowMinutes = 0, conditions = [], allergies = [] } = {}) {
  const codes = []
  let level = LEVEL.none
  const raise = (code, lvl) => { codes.push(code); level = Math.max(level, lvl) }

  if (utterance) {
    const a = analyzeUtterance(utterance, { conditions, allergies })
    a.codes.forEach(c => codes.push(c))
    level = Math.max(level, a.level)
  }
  // Thermal sensor findings (privacy-safe); `confirmed` means the CCTV check verified something abnormal.
  const fall = camera.possibleFall || thermal.includes('possible-fall')
  const still = camera.inactive || thermal.includes('no-motion')
  if (thermal.includes('fever')) raise('FV', confirmed ? LEVEL.urgent : LEVEL.watch)
  if (thermal.includes('heat-hazard')) raise('HZ', LEVEL.urgent)
  if (confirmed && thermal.length && !fall) raise('AB', LEVEL.urgent)

  if (fall) raise('FL', missedCheckins >= 1 ? LEVEL.critical : LEVEL.urgent)
  if (still) raise('IN', LEVEL.watch)
  if (fall && missedCheckins >= 1) raise('NR', LEVEL.critical)
  else if (camera.status !== 'live' && missedCheckins >= 3) raise('NR', LEVEL.critical)
  else if (camera.status !== 'live' && missedCheckins >= 2) raise('NR', LEVEL.urgent)
  else if (still && missedCheckins >= 2) raise('NR', LEVEL.urgent)

  const overdue = overdueMedications(meds, nowMinutes)
  const skipped = meds.some(m => m.status === 'skipped')
  if (overdue.length || skipped) raise('MD', LEVEL.watch)

  const finalCodes = unique(codes)
  return {
    level,
    levelName: LEVEL_NAMES[level],
    codes: finalCodes,
    reasons: finalCodes.map(c => REASON_LABELS[c]),
    actions: {
      checkIn: level === LEVEL.watch,
      alertFamily: level >= LEVEL.urgent,
      notifyHospital: level >= LEVEL.critical,
    },
  }
}

const pick = (list, seed) => list[Math.abs(seed) % list.length]

export function companionReply({ analysis, name = 'friend', meds = [], queueInfo = '', seed = 0 }) {
  const first = name.split(' ')[0]
  if (analysis.codes.includes('MH')) {
    return `${first}, I'm really glad you told me. You matter, and you don't have to carry this alone. I'm letting your family know right now so someone can be with you. If you feel unsafe, please call Tele-MANAS on 14416 any time. I'm staying right here with you.`
  }
  if (analysis.level >= LEVEL.critical) {
    return `${first}, this sounds serious, so I'm acting now. I'm alerting your family and your hospital right away. Please sit or lie down somewhere safe and stay with me. Help is on the way.`
  }
  if (analysis.level === LEVEL.urgent) {
    return `I'm worried about that, ${first}. I'm letting your family know so you're not alone. Can you tell me exactly how you feel right now?`
  }
  if (analysis.level === LEVEL.watch && analysis.codes.includes('SY')) {
    return `Thanks for telling me, ${first}. Let's keep a close eye on that. Please rest and sip some water. If it gets worse, just say "I need help" and I'll alert everyone.`
  }
  switch (analysis.intent) {
    case 'medicine-taken': return `That's wonderful, ${first}. I'll note that down. Taking it on time really helps.`
    case 'medicine': {
      const next = meds.find(m => m.status === 'unconfirmed')
      return next ? `Your next one is ${next.name}, ${next.instruction.toLowerCase()}, ${next.note.toLowerCase()}. Shall I remind you when it's time?` : `You've taken everything on your list for today. Well done, ${first}!`
    }
    case 'queue': return queueInfo || `I'll keep watching your queue and tell you when your turn is close.`
    case 'greeting': return pick([`Hello ${first}! It's lovely to hear from you. How are you feeling today?`, `Hi ${first}! I'm here. How has your day been so far?`], seed)
    case 'thanks': return `Always, ${first}. That's what friends are for.`
    default: break
  }
  if (analysis.mood === 'low' && analysis.level === LEVEL.watch) {
    return `That sounds really heavy, ${first}, and not eating or sleeping well makes it harder. I'm here with you. I'll let your care team know you're having a low time so they can support you, and I'll check in on you again soon.`
  }
  switch (analysis.mood) {
    case 'angry': return `I hear you, ${first}, and your frustration is completely fair. I'm sorry you're being kept waiting. Let me look at your queue, and I'll make sure the staff know how you feel.`
    case 'distressed': return `I'm sorry you're not feeling well, ${first}. Can you tell me where it hurts and how long it has been going on? I'm paying close attention, and I'll call for help the moment you ask.`
    case 'low': return `I'm sorry you're feeling that way, ${first}. I'm right here, and I'd love to keep you company. Would you like to tell me what's on your mind, or shall we talk about something that makes you smile?`
    case 'anxious': return `It's okay to feel worried, ${first}. Let's take a slow breath together: in for four, hold, and out for six. I'm with you, and everything is being looked after.`
    case 'tired': return `You sound tired, ${first}. Rest is part of healing. I'll keep watch while you relax.`
    case 'happy': return `I'm so glad to hear that, ${first}! Anything nice planned for today?`
    default: return pick([`I'm listening, ${first}. Tell me more.`, `Mm-hm, I'm here with you, ${first}. Go on.`], seed)
  }
}

export const checkInPrompt = (name, attempt) => {
  const first = name.split(' ')[0]
  return attempt === 0
    ? `Hi ${first}, just checking in. How are you feeling right now?`
    : `${first}, I haven't heard back yet. Are you okay? Please say something or tap the screen.`
}

/** Compact, structured snapshot that the AI keeps for each patient so analysis stays quick. */
export function buildSnapshot({ patient, records = [], meds = [], moods = [], events = [], now = Date.now() }) {
  const taken = meds.filter(m => m.status === 'taken').length
  const recentMoods = moods.slice(-10).map(m => m.mood)
  const lowCount = recentMoods.filter(m => ['low', 'anxious', 'distressed'].includes(m)).length
  return {
    conditions: patient.conditions,
    allergies: patient.allergies,
    bloodGroup: patient.bloodGroup,
    adherence: meds.length ? Math.round((taken / meds.length) * 100) : 100,
    recordCount: records.length,
    latestRecord: [...records].sort((a, b) => b.date.localeCompare(a.date))[0]?.title || 'None',
    moodTrend: lowCount >= 3 ? 'declining' : lowCount >= 1 ? 'mixed' : 'stable',
    latestMood: moods.length ? moods[moods.length - 1] : null,
    alerts24h: events.filter(e => e.level >= LEVEL.urgent && now - new Date(e.at).getTime() < 864e5).length,
  }
}
