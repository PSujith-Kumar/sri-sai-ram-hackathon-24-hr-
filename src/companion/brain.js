// Decision logic for the AI companion. Pure functions only: no browser APIs, easy to test.

import { detectLanguage, localize } from './language'
import { predictMood } from './mood'

export const LEVEL = { none: 0, watch: 1, urgent: 2, critical: 3 }
export const LEVEL_NAMES = ['normal', 'watch', 'urgent', 'critical']

// code → human label, shared with the USSD encoder
export const REASON_LABELS = {
  CP: 'chest pain', BR: 'trouble breathing', FN: 'fainting', ST: 'possible stroke signs', BL: 'heavy bleeding',
  FL: 'a fall', SY: 'concerning symptoms', HP: 'asked for help', PN: 'pain or discomfort', MH: 'emotional crisis',
  AL: 'allergy risk', BP: 'symptoms with known hypertension', NR: 'no response', MD: 'medication not confirmed', IN: 'unusual inactivity',
  FV: 'high body temperature', HZ: 'heat hazard in the room', AB: 'abnormal activity confirmed',
  ML: 'distress detected by the AI mood model', GM: 'distress noticed by the Gemma language model', VC: 'voice sounds weak, shaky or unwell',
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
  { re: /\b(panic attack|i am panicking|i'm panicking|having a panic)\b/i, code: 'ML', level: 2 },
  { re: /dizz(y|iness)|light-?headed|blurred vision|headache/i, code: 'SY', level: 1 },
  { re: /\bpain\b|hurts?|vomit|nausea|fever/i, code: 'PN', level: 1 },
  // Hindi / Tamil, in script and romanised (no \b: it does not work for non-Latin scripts)
  { re: /सीने में[^.!?]{0,14}(दर्द|जकड़न|दबाव)|seene mein[^.!?]{0,14}(dard|jakdan)|chest mein dard|நெஞ்சு[^.!?]{0,14}வலி|nenju[^.!?]{0,14}vali/i, code: 'CP', level: 3 },
  { re: /सा[ंँ]स नहीं|सा[ंँ]स लेने में (तकलीफ|दिक्कत)|saans (nahi|nahin|lene mein (takleef|dikkat))|மூச்சு ?(விட|திணறல்)|moochu ?(vida|thinaral|mudiyala)/i, code: 'BR', level: 3, selfNegating: true },
  { re: /बेहोश|behosh|மயக்கம்|மயங்கி|mayakkam|mayangi/i, code: 'FN', level: 3 },
  { re: /बहुत खून|khoon (beh|nikal)|இரத்தம் (கொட்ட|வடி)|ratham (kottu|vadi)/i, code: 'BL', level: 3 },
  { re: /मरना चाहत|मर जाना चाहिए|जीना नहीं|जीने की इच्छा नहीं|जान लेना चाहत|जिंदगी खत्म|ज़िंदगी खत्म|jeena nahi|marna chahta|marna chahti|mar jaana chahiye|zindagi khatam|jaan lena chahta|சாக வேண்டும்|சாகணும்|வாழ (பிடிக்கவில்லை|விரும்பவில்லை|வேண்டாம்)|உயிரை (மாய்த்|விட)|saaga vendum|saaganum|vaazha (pidikkala|virumbala|vendam)/i, code: 'MH', level: 3, selfNegating: true },
  { re: /गिर गया|गिर गई|gir gaya|gir gayi|கீழே விழுந்|vizhundhu|vizhundhen/i, code: 'FL', level: 2 },
  { re: /मदद|बचाओ|bachao|madad|உதவி|udavi|kaapathunga|காப்பாற்றுங்கள்/i, code: 'HP', level: 2 },
  { re: /चक्कर|chakkar|सिर दर्द|sir dard|தலை ?(சுற்று|வலி)|thalai ?(suthudhu|suthuthu|vali)/i, code: 'SY', level: 1 },
  { re: /दर्द|dard|வலி/i, code: 'PN', level: 1 },
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

const GREETING = /\bhello\b|\bhi\b|\bhey\b|good (morning|afternoon|evening)|namaste|namaskar|नमस्ते|vanakkam|வணக்கம்/i

export function detectIntent(text = '') {
  if (/(took|taken|had|finished) (my )?(medicine|medication|tablet|pill)s?|(dawai|dawa|goli|tablet|medicine).{0,12}(le li|kha li|li hai|liya)|(दवा|दवाई|गोली).{0,12}(ले ली|खा ली|ली)|(மாத்திரை|மருந்து).{0,12}(சாப்பிட்டேன்|போட்டேன்)|maathirai.{0,12}(sapitten|pottein)/i.test(text)) return 'medicine-taken'
  if (/medicine|medication|tablet|pill|dawai|dawa|goli|दवा|दवाई|गोली|மாத்திரை|மருந்து|maathirai/i.test(text)) return 'medicine'
  if (/\b(token|queue|my turn|how long|wait|baari)\b|टोकन|வரிசை/i.test(text)) return 'queue'
  if (/tell me about (yourself|you)|who are you|your name|what can you do|are you (a )?(robot|human|real)|aap kaun|tum kaun|apne baare|आप कौन|तुम कौन|अपने बारे|நீங்கள் யார்|நீ யார்|உன்னைப் பற்றி|neenga yaar|nee yaar|unga peyar/i.test(text)) return 'about'
  if (/how are you|how're you|how r u|aap kaise|tum kaise|kaise ho|कैसे हो|आप कैसे|எப்படி இருக்கிற|eppadi irukkeenga|epdi irukka/i.test(text)) return 'howAreYou'
  if (/what('?s| is) the time|what time is it|time now|kitne baje|कितने बजे|समय क्या|மணி என்ன/i.test(text)) return 'time'
  if (/what('?s| is) (the |today'?s )?(date|day)|today'?s date|आज की तारीख|இன்று என்ன (தேதி|கிழமை)/i.test(text)) return 'date'
  if (/\bjoke\b|make me laugh|चुटकुला|ஜோக்/i.test(text)) return 'joke'
  if (/\b(bye|goodbye|good night|see you|talk later)\b|अलविदा|शुभ रात्रि|poitu varen|போய் வருகிறேன்/i.test(text)) return 'goodbye'
  if (/thank|shukriya|dhanyavad|धन्यवाद|शुक्रिया|nandri|நன்றி/i.test(text)) return 'thanks'
  // a greeting is the whole message ("hello Asha"); "hello, I feel tired" is something to answer, not just greet back
  if (GREETING.test(text)) {
    const rest = text.replace(new RegExp(GREETING.source, 'gi'), ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    if (rest.length <= 2) return 'greeting'
  }
  return 'chat'
}

// "no chest pain", "I'm not dizzy anymore": a negation shortly before a symptom cancels it.
const NEGATION = /\b(no|not|never|without|free of|don'?t have|do not have|didn'?t have|haven'?t|hasn'?t|isn'?t|aren'?t|wasn'?t|nor)\b[^.!?,;]{0,25}$/i
// Hindi / Tamil negate after the symptom: "सीने में दर्द नहीं है", "vali illa"
const NEGATED_AFTER = /^[^.!?]{0,16}(नहीं|नही|\bnahi\b|\bnahin\b|\billa\b|\billai\b|இல்லை|இல்ல)/i
const isNegated = (text, index, end) => NEGATION.test(text.slice(Math.max(0, index - 40), index)) || NEGATED_AFTER.test(text.slice(end))
const matchesRule = (rule, text) => {
  const m = rule.re.exec(text)
  return Boolean(m) && (rule.selfNegating || !isNegated(text, m.index, m.index + m[0].length))
}

const MOOD_CONFIDENCE = 0.45
const CALM_MOODS = ['neutral', 'happy', 'angry', 'tired']
const DISTRESS_MOODS = ['distressed', 'low', 'anxious']
const STRONG_MOOD = 0.6
// Words that suggest pain, danger, fear or low mood (English, Hindi, Tamil; script and romanised).
const DISTRESS_CUE = new RegExp([
  '\\bpain(ful|s)?\\b|hurt|\\bache|aching|breath|blood|bleed|dizz|faint|pass(ed|ing)? out|collaps|\\bfall|\\bfell|stumbl|tumbl|slipp|landed|chest|heart|numb|swell|swollen|vomit|nausea|fever|temperature|shiver|sweat|itch|rash|allerg',
  '\\bhelp\\b|emergency|dying|\\bdie\\b|\\bdead|\\bkill|suicid|end (it|my life)|burning|unconscious|stroke|seiz|chok|gasp|wheez|cramp|weak|tremor|trembl|\\bshak|panic|cannot|unable|spinning|\\bblur|droop|slurr|confus',
  'cough|throat|swallow|\\bdark|black(ing)? out|\\bsting\\b|wound|broke|fracture|headache|migraine|stomach|vision|pressure|\\btight|crush|\\bsharp|unbearable|agony|terrible|severe|serious|\\bworse|scared|afraid|terrified',
  'worried|anxious|nervous|lonely|alone|sad|cry|hopeless|depress|worthless|burden|giving up|no point|better off|don.t want|can.t (move|feel|see|speak|stand|get up|take)',
  'दर्द|सीने|साँस|सांस|खून|चक्कर|बेहोश|मदद|बचाओ|गिर|बुखार|उल्टी|घबराहट|डर|अकेल|उदास|dard|saans|khoon|chakkar|behosh|madad|bachao|\\bgir\\b|bukhar|\\bulti|ghabra|dar lag|akela|udaas',
  'வலி|மூச்சு|ரத்த|இரத்த|மயக்க|உதவி|விழுந்|காய்ச்சல்|வாந்தி|பயம்|தனிமை|சோக|\\bvali|moochu|ratham|mayakkam|udhavi|udavi|vizhund|kaichal|vaanthi|bayam|thaniya|kashtam',
].join('|'), 'i')
const SEVERITY_CONFIDENCE = 0.6
const CRITICAL_CONFIDENCE = 0.85
// Chosen from the held-out trade-off table in ml/REPORT.md: 0.5 alerts ~77% of serious sentences at ~7% false alarms.
const SERIOUS_MASS = 0.25
const ALERT_CONFIDENCE = 0.5

/** Trained model's view of the sentence, or null if unavailable. Never overrides the safety rules downward. */
function modelView(text, prediction = null) {
  const ml = prediction || predictMood(text) // the fine-tuned model's answer when available, else the built-in one
  if (!ml) return null
  // With no keyword match, only a *confident* model may raise an alert. A moderate score just makes
  // the companion ask a gentle follow-up (watch level), because a false family alert is costly.
  let level = LEVEL.none
  if (ml.seriousProb >= ALERT_CONFIDENCE) level = ml.severityLevel === LEVEL.critical && ml.severityProb >= CRITICAL_CONFIDENCE ? LEVEL.critical : LEVEL.urgent
  else if (ml.seriousProb >= SERIOUS_MASS || (ml.severityLevel === LEVEL.watch && ml.severityProb >= SEVERITY_CONFIDENCE)) level = LEVEL.watch
  // Consistency check: both model heads must agree. If the same model reads the sentence as calm
  // (neutral, happy, angry or tired), a "serious" score is more likely unfamiliar wording than danger.
  if (level >= LEVEL.urgent && CALM_MOODS.includes(ml.mood) && ml.moodProb >= MOOD_CONFIDENCE) level = LEVEL.watch
  return { ...ml, level }
}

export function analyzeUtterance(text = '', { conditions = [], allergies = [], prediction = null } = {}) {
  const hits = SYMPTOM_RULES.filter(r => matchesRule(r, text))
  const codes = hits.map(h => h.code)
  let level = maxLevel(hits.map(h => h.level))
  const hasHypertension = conditions.some(c => /hypertension|blood pressure/i.test(c))
  if (hasHypertension && codes.includes('SY')) { codes.push('BP'); level = Math.max(level, LEVEL.urgent) }
  const mentionsAllergen = allergies.some(a => a && new RegExp(`\\b${a}\\b`, 'i').test(text)) && /(take|took|taken|give|gave|given|prescri|inject|eat|ate)/i.test(text)
  if (mentionsAllergen) { codes.push('AL'); level = Math.max(level, LEVEL.urgent) }
  const ml = modelView(text, prediction)
  // The model may only escalate on its own when there is something distress-like to go on: a cue word, or a
  // clearly distressed mood reading. Ordinary chit-chat in unfamiliar wording can then never raise an alert.
  const evidence = DISTRESS_CUE.test(text) || (ml && DISTRESS_MOODS.includes(ml.mood) && ml.moodProb >= STRONG_MOOD)
  if (ml && evidence && ml.level > level) { level = ml.level; codes.push('ML') }
  const mood = ml && ml.moodProb >= MOOD_CONFIDENCE ? ml.mood : detectMood(text)
  return { mood, moodConfidence: ml ? ml.moodProb : null, intent: detectIntent(text), lang: detectLanguage(text), level, codes: unique(codes) }
}

/**
 * Folds the Gemma language model's opinion into the local analysis. It can only RAISE concern:
 * 'watch' freely, 'urgent' only when the sentence has a distress cue, never 'critical' on its own.
 * The mood reading from Gemma replaces the local one when it gave a valid mood.
 */
export function mergeLlmAnalysis(analysis, llm, text) {
  if (!llm) return analysis
  const wanted = Math.min(LEVEL[llm.severity] ?? 0, LEVEL.urgent)
  const allowed = wanted <= LEVEL.watch || DISTRESS_CUE.test(text)
  const raise = allowed && wanted > analysis.level
  return {
    ...analysis,
    mood: llm.mood || analysis.mood,
    level: raise ? wanted : analysis.level,
    codes: raise ? unique([...analysis.codes, 'GM']) : analysis.codes,
    viaLlm: true,
  }
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
export function assessSituation({ utterance = null, prediction = null, llm = null, voice = null, camera = {}, thermal = [], confirmed = false, missedCheckins = 0, meds = [], nowMinutes = 0, conditions = [], allergies = [] } = {}) {
  const codes = []
  let level = LEVEL.none
  const raise = (code, lvl) => { codes.push(code); level = Math.max(level, lvl) }

  if (utterance) {
    const a = analyzeUtterance(utterance, { conditions, allergies, prediction })
    a.codes.forEach(c => codes.push(c))
    level = Math.max(level, a.level)
  }
  // `llm` is an analysis already merged with Gemma's opinion (mergeLlmAnalysis); it can only add to the local result.
  if (llm && llm.level > level) raise('GM', llm.level)
  // How the voice sounds (see voiceAnalysis.js): unusual alone is a watch; concerning, or unusual with
  // distress in the words, is serious enough to alert family and doctor.
  if (voice?.status === 'concerning') raise('VC', LEVEL.urgent)
  else if (voice?.status === 'unusual') raise('VC', level >= LEVEL.watch ? LEVEL.urgent : LEVEL.watch)
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

const LOCALES = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

/**
 * Chooses *what* to say from the situation (safety first, then voice, intent, mood) and
 * renders it in the patient's language. `voice` is the result of assessVoice().
 */
export function companionReply({ analysis, name = 'friend', companion = 'Asha', meds = [], queueInfo = '', seed = 0, now = new Date(), voice = null }) {
  const lang = analysis.lang || 'en'
  const next = meds.find(m => m.status === 'unconfirmed')
  const vars = {
    first: name.split(' ')[0], companion, seed, queueInfo,
    med: next ? `${next.name}, ${next.instruction.toLowerCase()}, ${next.note.toLowerCase()}` : '',
    time: now.toLocaleTimeString(LOCALES[lang], { hour: 'numeric', minute: '2-digit' }),
    date: now.toLocaleDateString(LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long' }),
  }
  const say = (key) => localize(lang, key, vars)

  if (analysis.codes.includes('MH')) return say('mh')
  if (analysis.level >= LEVEL.critical) return say('critical')
  if (analysis.level === LEVEL.urgent) return say('urgent')
  if (voice?.status === 'concerning') return say('voiceAlert')
  if (analysis.level === LEVEL.watch && analysis.codes.includes('SY')) return say('watchSymptom')

  switch (analysis.intent) {
    case 'medicine-taken': return say('medTaken')
    case 'medicine': return say(next ? 'medicine' : 'medicineDone')
    case 'queue': return queueInfo || say('queue')
    case 'greeting': return say('greeting')
    case 'thanks': return say('thanks')
    case 'about': return say('about')
    case 'howAreYou': return say('howAreYou')
    case 'goodbye': return say('goodbye')
    case 'time': return say('time')
    case 'date': return say('date')
    case 'joke': return say('joke')
    default: break
  }
  if (voice?.status === 'unusual') return say('voiceConcern')
  if (analysis.mood === 'low' && analysis.level === LEVEL.watch) return say('lowWatch')
  if (['angry', 'distressed', 'low', 'anxious', 'tired', 'happy'].includes(analysis.mood)) return say(analysis.mood)
  return say('default')
}

export const checkInPrompt = (name, attempt, lang = 'en') => localize(lang, attempt === 0 ? 'checkIn0' : 'checkIn1', { first: name.split(' ')[0] })

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
