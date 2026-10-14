import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Power } from 'lucide-react'
import { Empty, PageTitle } from '../ui'
import { LEVEL, analyzeUtterance, assessSituation, buildSnapshot, checkInPrompt, companionReply, dueMedications, mergeLlmAnalysis } from './brain'
import { ConversationPanel, ModelPanel, RelayPanel, StatusStrip, UnderstandingPanel, VoicePanel } from './CompanionPanels'
import { ClipsPanel, ContactsPanel, PrivacyPanel } from './PrivacyPanels'
import { deleteClip, listClips, saveClip } from './incidentStore'
import { GUARD_MODE, initialGuard, stepGuard } from './privacy'
import { enqueue, makeRelayItem, markSent, pending } from './ussd'
import { SAMPLE_WORDS, explainSpeechError, loadVoiceSample, useVoice } from './useVoice'
import { assessVoice, updateBaseline } from './voiceAnalysis'
import { SPEECH_LANG, detectLanguage, localize } from './language'
import { useCamera } from './useCamera'
import { useThermal } from './useThermal'
import { usePhoneLink } from './usePhoneLink'
import { PhonePanel } from './PhonePanels'
import { describeObservation, describeScene, trackObservation, visionLevel } from './vision'
import { loadMoodModel } from './mood'
import { localDate } from '../careFlow'
import { isActive } from '../medminder'
import { LLM_DEFAULTS, askGemma, buildSensingHint, buildSystemPrompt, checkGemma, warmGemma } from './llm'
import { CLASSIFIER_DEFAULTS, checkClassifier, classifyRemote } from './remoteModel'
import { EMPTY_COMPANION, mergeProfile, thermalSensorsEnabled } from './config'
import { appendConversationMemory, avoidRepeatedResponse, conversationSignals, pruneConversationMemory } from './memory'
import { recoveryReply } from './trainingData'

const EMPTY = EMPTY_COMPANION
const ALERT_COOLDOWN_MS = 60000
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
const uid = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}`
const toThermalTokens = (reasons) => reasons.map(r => (r === 'inactive' ? 'no-motion' : r))
const THERMAL_WORDS = { 'possible-fall': 'a possible fall', fever: 'a high body temperature', 'heat-hazard': 'a heat hazard', 'no-motion': 'no movement for a long time', 'voice-change': 'a change in the voice', 'mood-distress': 'some worrying words', 'visual-distress': 'visible signs of distress' }
const SOFT_REASONS = ['voice-change', 'mood-distress'] // worth a look with the camera, but not proof of anything
const DISTRESS_MOODS = ['distressed', 'low', 'anxious']
const TEST_CAMERA_MS = 20000
const MOOD_VOICE_MS = 5 * 60000
const ageFromDob = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / 31557600000) : null)

export default function CompanionPage({ data, setData, user, patients, notify, setPage }) {
  const patient = patients[0]
  if (!patient) return <Empty title="No linked patient" text="The AI companion needs a patient account."/>
  return <CompanionInner {...{ data, setData, user, patient, notify, setPage }}/>
}

function CompanionInner({ data, setData, user, patient, notify, setPage }) {
  const stored = data.companion?.[patient.id]
  const state = useMemo(() => ({ ...EMPTY, ...stored }), [stored])
  const profile = useMemo(() => mergeProfile(state.profile), [state.profile])
  const meds = useMemo(() => data.medications.filter(m => m.patientId === patient.id && isActive(m)), [data.medications, patient.id])
  const records = useMemo(() => data.records.filter(r => r.patientId === patient.id), [data.records, patient.id])
  const hospital = data.hospitals.find(h => h.id === patient.hospitalId)
  const linkedContacts = patient.familyLinks.filter(link => link.status === 'approved').map(link => data.users.find(person => person.id === link.userId)).filter(person => person?.phone).map(person => ({ id: person.id, name: person.name, phone: person.phone, role: 'family' }))
  const careContacts = [...linkedContacts, ...profile.contacts]

  const [messages, setMessages] = useState(() => profile.memoryEnabled ? pruneConversationMemory(state.memory, Date.now(), profile.memoryDays) : [])
  const [cctvOn, setCctvOn] = useState(false)
  const [safetySensorsActive, setSafetySensorsActive] = useState(false)
  const [guard, setGuard] = useState(initialGuard)
  const [scenario, setScenario] = useState('normal')
  const [sensorLoss, setSensorLoss] = useState(false)
  const [simulateOffline, setSimulateOffline] = useState(false)
  const [browserOnline, setBrowserOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [recordingSample, setRecordingSample] = useState(false)
  const [recordingActive, setRecordingActive] = useState(false)
  const [hasSample, setHasSample] = useState(() => Boolean(loadVoiceSample(patient.id)))
  const [clips, setClips] = useState([])
  const [level, setLevel] = useState(LEVEL.none)
  const [visionNote, setVisionNote] = useState(null)
  const [testingCamera, setTestingCamera] = useState(false)
  const online = browserOnline && !simulateOffline
  const cameraOn = profile.sensorTestMode || cctvOn

  // Volatile values read from timers/callbacks live in refs so closures never go stale.
  const live = useRef({})
  const guardRef = useRef(guard)
  const busyRef = useRef(false)
  const missedRef = useRef(0)
  const lastContactRef = useRef(Date.now())
  const respondedAtRef = useRef(0)
  const lastAlertRef = useRef({ key: '', at: 0 })
  const fallRef = useRef(false)
  const inactiveRef = useRef(false)
  const typedRef = useRef(null)
  const remindedRef = useRef(new Set())
  const thermalActiveRef = useRef([])
  const cctvEventsRef = useRef([])
  const softEventsRef = useRef([])      // a change of tone or worrying words: lets the camera look, never proves anything
  const visionBusyRef = useRef(false)
  const visionHistoryRef = useRef([])
  const lastVisionRef = useRef(null)    // { observation, at } of the latest Gemma 3 camera check
  const testTimerRef = useRef(null)
  const lastMoodRef = useRef({ mood: null, at: 0 }) // the patient's latest mood, so the voice can match it for a few minutes

  const update = useCallback((fn) => setData(d => ({ ...d, companion: { ...d.companion, [patient.id]: fn({ ...EMPTY, ...d.companion?.[patient.id] }) } })), [setData, patient.id])
  const setProfile = useCallback((patch) => update(c => ({ ...c, profile: { ...mergeProfile(c.profile), ...patch } })), [update])
  const setThermalSource = useCallback((patch) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, thermal: { ...p.thermal, ...patch } } } }), [update])
  const setSensorTestMode = useCallback((enabled) => {
    setCctvOn(enabled)
    setSafetySensorsActive(enabled)
    update(c => {
      const p = mergeProfile(c.profile)
      return { ...c, profile: { ...p, sensorTestMode: enabled } }
    })
  }, [update])
  const setVision = useCallback((patch) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, vision: { ...p.vision, ...patch } } } }), [update])
  const addContact = useCallback((contact) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, contacts: [...p.contacts, { ...contact, id: uid('k') }] } } }), [update])
  const removeContact = useCallback((id) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, contacts: p.contacts.filter(k => k.id !== id) } } }), [update])

  const voice = useVoice({ profile, patientId: patient.id, onProblem: (code, lang) => live.current.onMicProblem?.(code, lang) })
  // The zero-hardware simulator starts with AI care mode so its controls work on the hosted demo.
  // A real phone remains governed by its explicit always-on choice; other sources start after escalation.
  const sensorsOn = thermalSensorsEnabled(profile, safetySensorsActive)
  const wakeReason = guard.mode !== GUARD_MODE.thermal ? guard.reasons.map(r => THERMAL_WORDS[r] || r).join(' and ') : testingCamera ? 'a test from CareBridge' : ''
  const cctv = useCamera({
    source: { kind: profile.thermal.cctvKind, url: profile.thermal.cctvUrl }, enabled: cameraOn, forceUnavailable: false, patientId: patient.id, reason: wakeReason,
    onEvent: (e) => { cctvEventsRef.current.push(e); live.current.onCameraEvent?.(e) },
  })
  const thermal = useThermal({
    source: profile.thermal, patientId: patient.id, enabled: sensorsOn, scenario, forceUnavailable: sensorLoss,
    onUpdate: ({ active }) => { thermalActiveRef.current = active },
  })
  const phoneLink = usePhoneLink(patient.id)

  // "Eyes" = can the AI currently see the patient (thermal, or CCTV while it is on)? If not, it uses voice.
  const eyes = thermal.status === 'live' || (cameraOn && cctv.status === 'live') ? 'live' : profile.autonomous ? 'unavailable' : 'off'
  const ctx = profile.useRecordContext ? { conditions: patient.conditions, allergies: patient.allergies } : { conditions: [], allergies: [] }
  const companionName = profile.companionName
  live.current = { ...live.current, online, eyes, meds, profile, ctx, patient, name: user.name, messages, careContacts, cctv, sensorsOn }

  const addMessage = useCallback((role, text, extra = {}) => {
    const message = { id: uid('m'), role, text, createdAt: new Date().toISOString(), ...extra }
    setMessages(current => [...current.slice(-120), message])
    update(companion => {
      const p = mergeProfile(companion.profile)
      return p.memoryEnabled ? { ...companion, memory: appendConversationMemory(companion.memory, message, Date.now(), p.memoryDays) } : companion
    })
    return message
  }, [update])
  // Language the patient last spoke (or the one chosen in settings); replies are written and voiced in it.
  const replyLangRef = useRef(profile.lang === 'auto' ? 'en' : profile.lang.slice(0, 2))
  const seedRef = useRef(0)
  const say = useCallback(async (text, lang = replyLangRef.current) => {
    const L = live.current
    const finalText = L.profile.avoidRepetition ? avoidRepeatedResponse(text, L.messages, [
      'Let me answer differently. What would feel most useful right now: a short answer, reassurance, or contacting someone?',
      'I do not want to repeat myself. Tell me the single next step you want help with.',
      'We can pause and try a new approach. I am listening.',
    ]) : text
    addMessage('ai', finalText)
    const heard = lastMoodRef.current
    await voice.speak(finalText, lang, Date.now() - heard.at < MOOD_VOICE_MS ? heard.mood : null)
  }, [addMessage, voice])
  live.current.onMicProblem = (code, lang) => { const help = explainSpeechError(code, lang); if (help) addMessage('system', help) }
  const refreshClips = useCallback(() => listClips().then(setClips), [])
  useEffect(() => { refreshClips() }, [refreshClips])
  useEffect(() => { loadMoodModel().catch(() => {}) }, []) // falls back to keyword rules if the model cannot load

  const hearReply = useCallback(async (ms) => {
    typedRef.current = null
    if (voice.canListen) return voice.listen(ms)
    const end = Date.now() + ms
    while (Date.now() < end && !typedRef.current) await new Promise(r => setTimeout(r, 400))
    return typedRef.current
  }, [voice])

  const relayToHospital = useCallback((assessment, at) => {
    const L = live.current
    const item = makeRelayItem({ patient: L.patient, patientName: L.name, hospitalName: hospital?.name, assessment, meds: L.meds, at })
    const who = ['family', 'doctor', ...L.profile.contacts.map(c => `${c.role} ${c.name}`)].join(', ')
    if (L.online) {
      setData(d => ({ ...d, hospitalAlerts: [{ id: uid('ha'), patientId: L.patient.id, hospitalId: L.patient.hospitalId, level: assessment.level, reasons: assessment.reasons, via: 'internet', at: at.toISOString(), status: 'new' }, ...(d.hospitalAlerts || [])] }))
      update(c => ({ ...c, relayQueue: enqueue(c.relayQueue, { ...item, status: 'sent', via: 'internet' }) }))
      notify('Medical department alerted')
      addMessage('system', `Alerted: ${who}. Use the "Text" buttons in the relay panel to send the briefing to contacts' phones.`)
    } else {
      update(c => ({ ...c, relayQueue: enqueue(c.relayQueue, item) }))
      notify('No internet: emergency briefing prepared')
      addMessage('system', `No internet. The fictional hospital relay ${item.ussd} and an SMS briefing are ready. For a real emergency, tap Call 112. Nothing is dialled silently.`)
      say(item.briefing)
    }
  }, [hospital, setData, update, notify, addMessage, say])

  const raise = useCallback((assessment, { toDoctor = false } = {}) => {
    setLevel(assessment.level)
    if (assessment.level < LEVEL.urgent) return
    const key = assessment.codes.join('-')
    if (lastAlertRef.current.key === key && Date.now() - lastAlertRef.current.at < ALERT_COOLDOWN_MS) return
    lastAlertRef.current = { key, at: Date.now() }
    const at = new Date()
    const L = live.current
    update(c => ({ ...c, events: [{ id: uid('e'), at: at.toISOString(), level: assessment.level, codes: assessment.codes, reasons: assessment.reasons }, ...c.events].slice(0, 100) }))
    if (L.profile.caregiverEscalationConsent) {
      const approvedFamily = L.patient.familyLinks.filter(link => link.status === 'approved').map(link => link.userId)
      const recipients = [...new Set([...approvedFamily, ...L.patient.doctorIds])]
      setData(d => ({ ...d, careRequests: [{ id: uid('c'), patientId: L.patient.id, text: `AI alert: ${L.name} — ${assessment.reasons.join(', ')}`, priority: 'high', status: 'waiting', createdAt: at.toISOString(), source: 'ai-companion' }, ...d.careRequests] }))
      notify(`Urgent alert sent to the approved care circle: ${assessment.reasons.join(', ')}`, { recipientIds: recipients, page: 'care', type: 'emergency' })
      const favourite = L.careContacts.find(contact => contact.id === L.profile.favouriteContactId) || L.careContacts[0]
      addMessage('system', `${favourite ? `${favourite.name} is your favourite contact. ` : ''}Your approved care circle has an in-app alert. Use the call buttons below for a real phone call.`)
    } else addMessage('system', 'An urgent wellbeing signal was detected, but care-circle alerts are disabled in Settings. Use the emergency buttons below if help is needed.')
    if ((assessment.actions.notifyHospital || toDoctor) && L.profile.caregiverEscalationConsent) relayToHospital(assessment, at)
  }, [update, setData, addMessage, relayToHospital, notify])

  const assess = useCallback((extra = {}) => {
    const L = live.current
    return assessSituation({ camera: { status: L.eyes, possibleFall: fallRef.current, inactive: inactiveRef.current }, thermal: thermalActiveRef.current, confirmed: guardRef.current.mode === GUARD_MODE.recording, missedCheckins: missedRef.current, meds: L.meds, nowMinutes: nowMinutes(), ...L.ctx, ...extra })
  }, [])

  const [voiceCheck, setVoiceCheck] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [classifierOk, setClassifierOk] = useState(null) // null = not tried yet
  useEffect(() => { checkClassifier(live.current.profile.classifier).then(r => setClassifierOk(r.ok ? r : false)) }, [])
  const [llmStatus, setLlmStatus] = useState(null)
  const llmWarnedRef = useRef(false)
  const setLlm = useCallback((patch) => {
    update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, llm: { ...p.llm, ...patch } } } })
    if (patch.enabled) warmGemma({ ...live.current.profile.llm, ...patch }) // load the model now, not on the first message
  }, [update])
  const testLlm = async () => {
    setLlmStatus('testing')
    const status = await checkGemma(live.current.profile.llm)
    setLlmStatus(status)
    if (status.ok && status.hasModel) warmGemma(live.current.profile.llm)
  }

  /** Asks Gemma for a reply + second opinion. Skipped for emergencies, so nothing slows the safety path. */
  const consultGemma = useCallback(async (text, analysis, voiceResult) => {
    const L = live.current
    const cfg = L.profile.llm
    // Facts the app knows exactly (queue, time, date, medicines) are answered by the app, not guessed by a model.
    const knownFacts = ['queue', 'time', 'date', 'medicine', 'medicine-taken'].includes(analysis.intent)
    if (!cfg.enabled || knownFacts || analysis.level >= LEVEL.urgent || analysis.codes.includes('MH') || voiceResult?.status === 'concerning') return null
    setThinking(true)
    const system = buildSystemPrompt({ companion: L.profile.companionName, name: L.name, age: ageFromDob(L.patient.dob), conditions: L.patient.conditions, allergies: L.patient.allergies, medicines: L.meds.map(m => m.name) })
    const seen = lastVisionRef.current
    const hint = buildSensingHint({
      rating: analysis.level > 0 ? ['none', 'watch', 'urgent', 'critical'][analysis.level] : '',
      mood: analysis.mood,
      voiceReasons: voiceResult?.status === 'unusual' ? voiceResult.reasons : [],
      camera: seen && Date.now() - seen.at < 120000 ? seen.observation.summary : '',
      thermal: thermalActiveRef.current,
    })
    const result = await askGemma(cfg, { system, history: L.messages, text, hint })
    setThinking(false)
    if (!result && !llmWarnedRef.current) { llmWarnedRef.current = true; addMessage('system', 'Gemma did not answer, so I used my built-in replies. Open "Gemma 3 language model" below and press Test connection.') }
    if (result) llmWarnedRef.current = false
    return result
  }, [addMessage])

  const processUtterance = useCallback(async (text, heard = null) => {
    const L = live.current
    // Ask the fine-tuned model first (resolves null if its service is not running → built-in model is used).
    const prediction = await classifyRemote(text, L.profile.classifier)
    setClassifierOk(Boolean(prediction))
    const localAnalysis = analyzeUtterance(text, { ...L.ctx, prediction })
    replyLangRef.current = localAnalysis.lang
    // How the voice itself sounded, compared with this patient's usual voice (see voiceAnalysis.js).
    const voiceResult = heard?.features ? assessVoice(heard.features, L.profile.voiceBaseline, text.trim().split(/\s+/).length) : null
    setVoiceCheck(voiceResult)
    const gemma = await consultGemma(text, localAnalysis, voiceResult)
    const analysis = mergeLlmAnalysis(localAnalysis, gemma, text)
    if (voiceResult?.status === 'normal') setProfile({ voiceBaseline: updateBaseline(L.profile.voiceBaseline, heard.features, voiceResult.rate) })
    lastMoodRef.current = { mood: analysis.mood, at: Date.now() }
    update(c => ({ ...c, moods: [...c.moods, { mood: analysis.mood, confidence: analysis.moodConfidence, level: analysis.level, voice: voiceResult?.status || null, at: new Date().toISOString() }].slice(-60) }))
    if (analysis.intent === 'medicine-taken') {
      const target = L.meds.find(m => m.status !== 'taken')
      if (target) setData(d => ({ ...d, medications: d.medications.map(m => (m.id === target.id ? { ...m, status: 'taken', statusDate: localDate() } : m)) }))
    }
    const assessment = assess({ utterance: text, prediction, llm: gemma ? analysis : null, voice: voiceResult, missedCheckins: 0 })
    // A worrying voice alerts the family AND the doctor (and Asha tells the patient she is doing so).
    raise(assessment, { toDoctor: assessment.codes.includes('VC') && assessment.level >= LEVEL.urgent })
    // A change in tone, or worrying words: switch the normal camera on for a live look (only with the patient's sensor consent).
    if (L.profile.autonomous && L.profile.sensorEscalationConsent) {
      const concerns = []
      if (voiceResult && ['unusual', 'concerning'].includes(voiceResult.status)) concerns.push('voice-change')
      if (assessment.level >= LEVEL.watch && (assessment.level >= LEVEL.urgent || DISTRESS_MOODS.includes(analysis.mood))) concerns.push('mood-distress')
      if (concerns.length) { softEventsRef.current.push(...concerns); setSafetySensorsActive(true) }
    }
    const token = data.tokens.find(t => t.patientId === L.patient.id && t.status === 'waiting')
    const queue = data.queues.find(q => q.id === token?.queueId)
    const ahead = token && queue ? Math.max(0, token.number - queue.serving - 1) : null
    const queueInfo = ahead === null || analysis.lang !== 'en' ? '' : `Your token is CAR-${String(token.number).padStart(3, '0')}. There ${ahead === 1 ? 'is 1 person' : `are ${ahead} people`} ahead of you, about ${ahead * queue.avgMinutes} minutes.`
    const correction = /\b(repeat|repeating|same thing again)\b/i.test(text) ? 'repetitive' : /\b(your reply|you are|you'?re).{0,35}\b(angry|annoyed|frustrated)\b/i.test(text) ? 'anger' : null
    // Gemma writes the reply unless this is an alert-level moment, where the fixed multilingual templates are used.
    if (!correction && gemma && assessment.level < LEVEL.urgent) {
      const lang = detectLanguage(gemma.reply)
      replyLangRef.current = lang
      await say(gemma.reply, lang)
      return
    }
    await say(correction ? recoveryReply(correction) : companionReply({ analysis, voice: voiceResult, name: L.name, companion: L.profile.companionName, meds: L.meds, queueInfo, seed: seedRef.current++, now: new Date() }), analysis.lang)
  }, [update, setProfile, setData, raise, assess, say, consultGemma, data.tokens, data.queues])

  const handleHeard = useCallback(async (text, heard = null) => {
    lastContactRef.current = Date.now()
    respondedAtRef.current = Date.now()
    missedRef.current = 0
    fallRef.current = false
    inactiveRef.current = false
    if (guardRef.current.mode === GUARD_MODE.thermal) setSafetySensorsActive(false)
    typedRef.current = text
    addMessage('patient', text)
    await processUtterance(text, heard)
  }, [addMessage, processUtterance])

  const handleFeedback = useCallback(async (messageId, reason) => {
    update(companion => ({
      ...companion,
      memory: companion.memory.map(message => message.id === messageId ? { ...message, feedback: reason } : message),
      learning: { ...EMPTY.learning, ...companion.learning, [reason]: (companion.learning?.[reason] || 0) + 1, corrected: (companion.learning?.corrected || 0) + (reason === 'helpful' ? 0 : 1) },
    }))
    setMessages(current => current.map(message => message.id === messageId ? { ...message, feedback: reason } : message))
    if (reason === 'helpful') { notify('Thanks — this response style will be preferred'); return }
    const better = recoveryReply(reason)
    addMessage('system', 'Feedback saved. A safer reply is being replayed now.')
    await say(better)
  }, [update, notify, addMessage, say])

  const runCheckIn = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const L = live.current
      for (const attempt of [0, 1]) {
        await say(checkInPrompt(L.name, attempt, replyLangRef.current))
        const heardText = await hearReply(10000)
        if (heardText) { await handleHeard(heardText, voice.heard()); return }
      }
      missedRef.current += 1
      lastContactRef.current = Date.now()
      addMessage('system', `No reply to check-in (${missedRef.current}).`)
      if (L.profile.sensorEscalationConsent) {
        setSafetySensorsActive(true)
        addMessage('system', 'The unanswered check-in activated the thermal safety sensor. CCTV remains off unless the thermal check finds an abnormal event.')
      }
      raise(assess(), { toDoctor: guardRef.current.mode === GUARD_MODE.recording })
    } finally {
      busyRef.current = false
    }
  }, [say, hearReply, handleHeard, addMessage, raise, assess, voice])
  live.current.say = say
  live.current.runCheckIn = runCheckIn

  const onCameraEvent = useCallback((event) => {
    if (event === 'possible-fall') { fallRef.current = true; addMessage('system', 'CCTV check: possible fall confirmed.') }
    else if (event === 'inactive') { inactiveRef.current = true; addMessage('system', 'CCTV check: unusually still.') }
    else if (event === 'visual-distress') addMessage('system', 'Camera check: visible signs of distress.')
    raise(assess())
    runCheckIn()
  }, [addMessage, raise, assess, runCheckIn])
  live.current.onCameraEvent = onCameraEvent

  const applyEffect = useCallback(async (effect, reasons) => {
    const words = reasons.map(r => THERMAL_WORDS[r] || r).join(' and ')
    if (effect === 'cctv-on') {
      setCctvOn(true)
      addMessage('system', `Something unusual was noticed: ${words}. The camera is on for a live check. Nothing is recorded or shared.`)
      if (!reasons.every(r => SOFT_REASONS.includes(r))) runCheckIn() // the patient has just spoken if it was a tone or word concern
    } else if (effect === 'start-recording') {
      const ok = cctv.startRecording()
      setRecordingActive(ok)
      addMessage('system', ok ? 'Abnormal event confirmed. Recording on this device only.' : 'Abnormal event confirmed. CCTV could not record, but alerts are going out.')
    } else if (effect === 'alert') {
      raise(assess({ thermal: toThermalTokens(reasons), confirmed: true }), { toDoctor: true })
      runCheckIn()
    } else if (effect === 'stop-recording') {
      const blob = await cctv.stopRecording()
      setRecordingActive(false)
      if (blob) { await saveClip({ blob, reasons, kind: profile.thermal.cctvKind }); refreshClips(); addMessage('system', 'Clip saved on this device only. It is deleted after 7 days.') }
    } else if (effect === 'cctv-off') {
      setCctvOn(false)
      addMessage('system', live.current.profile.sensorTestMode ? 'All clear. The camera remains visible because both-sensor test mode is on.' : 'All clear. CCTV switched off.')
    }
  }, [addMessage, runCheckIn, cctv, raise, assess, profile.thermal.cctvKind, refreshClips])
  live.current.applyEffect = applyEffect // read by the guard timer below: a timer must not restart on every render

  // Privacy guard tick: decides when CCTV may turn on and when anything may be recorded.
  useEffect(() => {
    if (!sensorsOn) return undefined
    const timer = setInterval(async () => {
      const current = guardRef.current
      const cctvEvents = cctvEventsRef.current.splice(0)
      const input = { now: Date.now(), thermalActive: thermalActiveRef.current, cctvEvents: toThermalTokens(cctvEvents), softEvents: softEventsRef.current.splice(0), responded: respondedAtRef.current >= current.since && current.since > 0 }
      const { guard: next, effects } = stepGuard(current, input)
      if (next !== current) { guardRef.current = next; setGuard(next) }
      for (const effect of effects) await live.current.applyEffect(effect, next.reasons.length ? next.reasons : current.reasons)
    }, 1000)
    return () => clearInterval(timer)
  }, [sensorsOn])

  // Turning AI care mode off must leave nothing running.
  useEffect(() => {
    if (sensorsOn) return
    guardRef.current = initialGuard()
    setGuard(guardRef.current)
    setCctvOn(false)
    setSafetySensorsActive(false)
    thermalActiveRef.current = []
    softEventsRef.current = []
  }, [sensorsOn])

  // Gemma 3 looks at the camera picture while the camera is on. A finding needs two looks in a row to agree, and goes to the
  // privacy guard as a camera event; the guard still decides about recording and alerts.
  const visionOn = cameraOn && cctv.status === 'live' && profile.llm.enabled && profile.vision.enabled
  useEffect(() => {
    if (!visionOn) { visionHistoryRef.current = []; return undefined }
    const look = async () => {
      if (visionBusyRef.current) return
      const frame = await live.current.cctv.grabFrame()
      if (!frame) return
      visionBusyRef.current = true
      try {
        const L = live.current
        const context = guardRef.current.reasons.map(r => THERMAL_WORDS[r] || r).join(', ')
        const result = await describeScene(L.profile.llm, frame, context)
        if (!result.ok) { setVisionNote({ text: `Camera check unavailable (${result.error}).`, at: Date.now() }); return }
        const { observation } = result
        lastVisionRef.current = { observation, at: Date.now() }
        const { history, event } = trackObservation(visionHistoryRef.current, observation)
        visionHistoryRef.current = history
        setVisionNote({ text: describeObservation(observation), at: Date.now() })
        if (visionLevel(observation).level !== 'none') addMessage('system', describeObservation(observation))
        if (event && live.current.sensorsOn) { cctvEventsRef.current.push(event); live.current.onCameraEvent?.(event) }
      } finally { visionBusyRef.current = false }
    }
    look()
    const timer = setInterval(look, Math.max(5, profile.vision.intervalSec) * 1000)
    return () => clearInterval(timer)
  }, [visionOn, profile.vision.intervalSec, addMessage])

  // Setup check: switch the camera phone on for a short, visible test.
  const testCameraPhone = () => {
    if (testingCamera) return
    setTestingCamera(true)
    setCctvOn(true)
    addMessage('system', 'Testing the camera phone. Its camera is on only for the next 20 seconds.')
    clearTimeout(testTimerRef.current)
    testTimerRef.current = setTimeout(() => {
      setTestingCamera(false)
      if (guardRef.current.mode === GUARD_MODE.thermal) setCctvOn(false)
    }, TEST_CAMERA_MS)
  }
  useEffect(() => () => clearTimeout(testTimerRef.current), [])

  // Autonomous loop: medicine reminders, and voice check-ins whenever nothing can see the patient.
  useEffect(() => {
    if (!profile.autonomous) return undefined
    const timer = setInterval(() => {
      const L = live.current
      dueMedications(L.meds, nowMinutes()).filter(m => !remindedRef.current.has(m.id)).forEach(m => {
        remindedRef.current.add(m.id)
        live.current.say(localize(replyLangRef.current, 'medReminder', { med: `${m.name}, ${m.instruction.toLowerCase()}, ${m.note.toLowerCase()}` }))
      })
      if (L.eyes !== 'live' && !busyRef.current && Date.now() - lastContactRef.current >= L.profile.checkInSeconds * 1000) L.runCheckIn()
    }, 5000)
    return () => clearInterval(timer)
  }, [profile.autonomous])

  useEffect(() => {
    const on = () => setBrowserOnline(true)
    const off = () => setBrowserOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Reconnect: send everything that was queued while offline.
  useEffect(() => {
    if (!online) return
    const waiting = pending(state.relayQueue)
    if (!waiting.length) return
    setData(d => ({ ...d, hospitalAlerts: [...waiting.map(i => ({ id: uid('ha'), patientId: i.patientId, hospitalId: patient.hospitalId, level: i.level, reasons: i.reasons, via: 'internet-resume', at: i.createdAt, status: 'new' })), ...(d.hospitalAlerts || [])] }))
    update(c => ({ ...c, relayQueue: waiting.reduce((q, i) => markSent(q, i.id, 'internet-resume'), c.relayQueue) }))
    notify('Connection restored: queued alerts sent to the hospital')
  }, [online, state.relayQueue, patient.hospitalId, setData, update, notify])

  const toggleAi = async () => {
    const turningOn = !profile.autonomous
    if (!turningOn && guardRef.current.mode === GUARD_MODE.recording) await applyEffect('stop-recording', guardRef.current.reasons)
    setProfile({ autonomous: turningOn })
    lastContactRef.current = Date.now()
    if (turningOn) await say(`Hello ${user.name.split(' ')[0]}, I'm ${companionName}. I'll be right here with you. ${profile.sensorTestMode ? 'Both-sensor test mode is active, so your selected thermal and camera sources stay visible together.' : profile.sensorEscalationConsent ? 'The thermal watch can stay active, while CCTV opens only for an unusual event.' : 'The thermal simulator remains available; the real camera stays off unless you enable it.'} I'll also look after your medicines. Just talk to me any time.`)
  }

  const onMic = async () => {
    if (voice.listening) { voice.stopListening(); return }
    voice.stopSpeaking() // otherwise the microphone hears Asha instead of the patient
    const heardText = await voice.listen(10000)
    if (heardText) await handleHeard(heardText, voice.heard())
  }
  const onRecordSample = async () => {
    setRecordingSample(true)
    try {
      const { saved, features } = await voice.recordSample(8)
      setHasSample(saved)
      if (features) {
        const words = SAMPLE_WORDS
        const rate = words / (features.durationSec * (1 - features.pauseRatio))
        setProfile({ voiceBaseline: updateBaseline(null, features, rate) })
        addMessage('system', 'Voice sample saved. I will use it to notice when your voice sounds weaker or different than usual.')
      } else addMessage('system', 'The sample was too quiet or too short to learn from. Please try again closer to the microphone.')
    } catch { notify('Microphone permission is needed to record a sample') } finally { setRecordingSample(false) }
  }
  const removeClip = async (id) => { await deleteClip(id); refreshClips() }

  const snapshot = buildSnapshot({ patient, records, meds, moods: state.moods, events: state.events })
  const signals = conversationSignals(messages)
  const eyesText = profile.sensorTestMode ? `${profile.thermal.kind === 'phone' ? 'thermal phone' : profile.thermal.kind === 'http' ? 'thermal gateway' : 'thermal simulator'} and ${profile.thermal.cctvKind === 'phone' ? 'camera phone' : profile.thermal.cctvKind === 'ip' ? 'IP camera' : 'this device camera'} (continuous test)` : guard.mode === GUARD_MODE.thermal ? (eyes === 'live' ? 'thermal sensor only (CCTV off)' : 'not available, using voice') : 'thermal sensor and CCTV (live check)'

  return <>
    <PageTitle eyebrow="AI COMPANION · PATIENT CARE" title={`${companionName} is here with you.`} text="A patient-specific companion with 30-day memory, feedback-based reply repair and consent-controlled safety escalation. Wellbeing signals support care; they never diagnose." actions={<button className={`btn ${profile.autonomous ? 'btn-dark' : 'btn-primary'}`} onClick={toggleAi}><Power/> {profile.autonomous ? 'Stop AI care mode' : 'Start AI care mode'}</button>}/>
    <StatusStrip aiOn={profile.autonomous} online={online} thermalStatus={thermal.status} cctvOn={cameraOn} recording={recordingActive} listening={voice.listening} speaking={voice.speaking} level={level}/>
    <div className="cmp-grid">
      <ConversationPanel messages={messages} onSend={handleHeard} onMic={onMic} onFeedback={handleFeedback} thinking={thinking} listening={voice.listening} interim={voice.interim} canListen={voice.canListen} companionName={companionName}/>
      <PrivacyPanel {...{ guard, thermal, cctv: { ...cctv, on: cameraOn }, profile, setThermalSource, setSensorTestMode, scenario, setScenario, sensorLoss, setSensorLoss }} onOpenSettings={() => setPage?.('settings')}/>
      <PhonePanel link={phoneLink} profile={profile} setThermalSource={setThermalSource} setSensorTestMode={setSensorTestMode} setVision={setVision} llmOn={profile.llm.enabled} visionNote={visionNote} onTestCamera={testCameraPhone} testing={testingCamera}/>
      <UnderstandingPanel snapshot={snapshot} events={state.events} camera={eyesText} voiceCheck={voiceCheck} baseline={profile.voiceBaseline} signals={signals}/>
      <VoicePanel {...{ voice, profile, setProfile, hasSample, recording: recordingSample, onRecord: onRecordSample, onTest: () => say(`Hi, I'm ${companionName}. This is how I will sound.`) }}/>
      <ModelPanel llm={profile.llm} setLlm={setLlm} status={llmStatus} onTest={testLlm} classifier={classifierOk}/>
      <ContactsPanel contacts={profile.contacts} onAdd={addContact} onRemove={removeContact}/>
      <ClipsPanel clips={clips} onDelete={removeClip}/>
      <RelayPanel queue={state.relayQueue} online={online} simulateOffline={simulateOffline} setSimulateOffline={setSimulateOffline} contacts={careContacts} favouriteContactId={profile.favouriteContactId} patient={patient} patientName={user.name} hospitalName={hospital?.name} meds={meds} onSpeak={say}/>
    </div>
  </>
}
