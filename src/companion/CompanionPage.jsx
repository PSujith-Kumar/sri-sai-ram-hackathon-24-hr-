import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Power } from 'lucide-react'
import { Empty, PageTitle } from '../ui'
import { LEVEL, analyzeUtterance, assessSituation, buildSnapshot, checkInPrompt, companionReply, dueMedications } from './brain'
import { ConversationPanel, RelayPanel, StatusStrip, UnderstandingPanel, VoicePanel } from './CompanionPanels'
import { ClipsPanel, ContactsPanel, PrivacyPanel } from './PrivacyPanels'
import { deleteClip, listClips, saveClip } from './incidentStore'
import { GUARD_MODE, initialGuard, stepGuard } from './privacy'
import { enqueue, isMobileDevice, makeRelayItem, markSent, pending, ussdDialHref } from './ussd'
import { SAMPLE_WORDS, explainSpeechError, loadVoiceSample, useVoice } from './useVoice'
import { assessVoice, updateBaseline } from './voiceAnalysis'
import { SPEECH_LANG, detectLanguage, localize } from './language'
import { useCamera } from './useCamera'
import { useThermal } from './useThermal'
import { loadMoodModel } from './mood'

const DEFAULT_PROFILE = {
  voiceURI: '', rate: 1, pitch: 1, lang: 'auto', companionName: 'Asha', autonomous: false, checkInSeconds: 60, voiceBaseline: null,
  thermal: { kind: 'sim', url: '', cctvKind: 'webcam', cctvUrl: '' }, contacts: [],
}
const EMPTY = { profile: DEFAULT_PROFILE, moods: [], events: [], relayQueue: [] }
const ALERT_COOLDOWN_MS = 60000
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
const uid = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}`
const toThermalTokens = (reasons) => reasons.map(r => (r === 'inactive' ? 'no-motion' : r))
const THERMAL_WORDS = { 'possible-fall': 'a possible fall', fever: 'a high body temperature', 'heat-hazard': 'a heat hazard', 'no-motion': 'no movement for a long time' }
const mergeProfile = (p = {}) => ({ ...DEFAULT_PROFILE, ...p, thermal: { ...DEFAULT_PROFILE.thermal, ...p.thermal }, contacts: p.contacts || [] })

export default function CompanionPage({ data, setData, user, patients, notify }) {
  const patient = patients[0]
  if (!patient) return <Empty title="No linked patient" text="The AI companion needs a patient account."/>
  return <CompanionInner {...{ data, setData, user, patient, notify }}/>
}

function CompanionInner({ data, setData, user, patient, notify }) {
  const stored = data.companion?.[patient.id]
  const state = useMemo(() => ({ ...EMPTY, ...stored }), [stored])
  const profile = useMemo(() => mergeProfile(state.profile), [state.profile])
  const meds = useMemo(() => data.medications.filter(m => m.patientId === patient.id), [data.medications, patient.id])
  const records = useMemo(() => data.records.filter(r => r.patientId === patient.id), [data.records, patient.id])
  const hospital = data.hospitals.find(h => h.id === patient.hospitalId)

  const [messages, setMessages] = useState([])
  const [cctvOn, setCctvOn] = useState(false)
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
  const online = browserOnline && !simulateOffline

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

  const update = useCallback((fn) => setData(d => ({ ...d, companion: { ...d.companion, [patient.id]: fn({ ...EMPTY, ...d.companion?.[patient.id] }) } })), [setData, patient.id])
  const setProfile = useCallback((patch) => update(c => ({ ...c, profile: { ...mergeProfile(c.profile), ...patch } })), [update])
  const setThermalSource = useCallback((patch) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, thermal: { ...p.thermal, ...patch } } } }), [update])
  const addContact = useCallback((contact) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, contacts: [...p.contacts, { ...contact, id: uid('k') }] } } }), [update])
  const removeContact = useCallback((id) => update(c => { const p = mergeProfile(c.profile); return { ...c, profile: { ...p, contacts: p.contacts.filter(k => k.id !== id) } } }), [update])

  const voice = useVoice({ profile, patientId: patient.id, onProblem: (code, lang) => live.current.onMicProblem?.(code, lang) })
  const cctv = useCamera({
    source: { kind: profile.thermal.cctvKind, url: profile.thermal.cctvUrl }, enabled: cctvOn, forceUnavailable: false,
    onEvent: (e) => { cctvEventsRef.current.push(e); live.current.onCameraEvent?.(e) },
  })
  const thermal = useThermal({
    source: profile.thermal, enabled: profile.autonomous, scenario, forceUnavailable: sensorLoss,
    onUpdate: ({ active }) => { thermalActiveRef.current = active },
  })

  // "Eyes" = can the AI currently see the patient (thermal, or CCTV while it is on)? If not, it uses voice.
  const eyes = thermal.status === 'live' || (cctvOn && cctv.status === 'live') ? 'live' : profile.autonomous ? 'unavailable' : 'off'
  const ctx = { conditions: patient.conditions, allergies: patient.allergies }
  const companionName = profile.companionName
  live.current = { ...live.current, online, eyes, meds, profile, ctx, patient, name: user.name }

  const addMessage = useCallback((role, text) => setMessages(m => [...m.slice(-60), { id: uid('m'), role, text }]), [])
  // Language the patient last spoke (or the one chosen in settings); replies are written and voiced in it.
  const replyLangRef = useRef(profile.lang === 'auto' ? 'en' : profile.lang.slice(0, 2))
  const seedRef = useRef(0)
  const say = useCallback(async (text, lang = replyLangRef.current) => { addMessage('ai', text); await voice.speak(text, lang) }, [addMessage, voice])
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
      notify('No internet: dialling the offline USSD relay')
      addMessage('system', `No internet. USSD ${item.ussd} is ready${isMobileDevice() ? ' and the dialler is opening. Tap Call' : '. Dial it from a phone, or use SMS'}. The same alert is queued and sends itself when the connection returns.`)
      say(item.briefing)
      if (isMobileDevice()) window.location.href = ussdDialHref(item.ussd)
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
    setData(d => ({ ...d, careRequests: [{ id: uid('c'), patientId: L.patient.id, text: `AI alert: ${L.name} — ${assessment.reasons.join(', ')}`, priority: 'high', status: 'waiting', createdAt: at.toISOString(), source: 'ai-companion' }, ...d.careRequests] }))
    addMessage('system', `Family alerted: ${assessment.reasons.join(', ')}.`)
    if (assessment.actions.notifyHospital || toDoctor) relayToHospital(assessment, at)
  }, [update, setData, addMessage, relayToHospital])

  const assess = useCallback((extra = {}) => {
    const L = live.current
    return assessSituation({ camera: { status: L.eyes, possibleFall: fallRef.current, inactive: inactiveRef.current }, thermal: thermalActiveRef.current, confirmed: guardRef.current.mode === GUARD_MODE.recording, missedCheckins: missedRef.current, meds: L.meds, nowMinutes: nowMinutes(), ...L.ctx, ...extra })
  }, [])

  const [voiceCheck, setVoiceCheck] = useState(null)

  const processUtterance = useCallback(async (text, heard = null) => {
    const L = live.current
    const analysis = analyzeUtterance(text, L.ctx)
    replyLangRef.current = analysis.lang
    // How the voice itself sounded, compared with this patient's usual voice (see voiceAnalysis.js).
    const voiceResult = heard?.features ? assessVoice(heard.features, L.profile.voiceBaseline, text.trim().split(/\s+/).length) : null
    setVoiceCheck(voiceResult)
    if (voiceResult?.status === 'normal') setProfile({ voiceBaseline: updateBaseline(L.profile.voiceBaseline, heard.features, voiceResult.rate) })
    update(c => ({ ...c, moods: [...c.moods, { mood: analysis.mood, confidence: analysis.moodConfidence, level: analysis.level, voice: voiceResult?.status || null, at: new Date().toISOString() }].slice(-60) }))
    if (analysis.intent === 'medicine-taken') {
      const target = L.meds.find(m => m.status !== 'taken')
      if (target) setData(d => ({ ...d, medications: d.medications.map(m => (m.id === target.id ? { ...m, status: 'taken' } : m)) }))
    }
    const assessment = assess({ utterance: text, voice: voiceResult, missedCheckins: 0 })
    // A worrying voice alerts the family AND the doctor (and Asha tells the patient she is doing so).
    raise(assessment, { toDoctor: assessment.codes.includes('VC') && assessment.level >= LEVEL.urgent })
    const token = data.tokens.find(t => t.patientId === L.patient.id && t.status === 'waiting')
    const queue = data.queues.find(q => q.id === token?.queueId)
    const ahead = token && queue ? Math.max(0, token.number - queue.serving - 1) : null
    const queueInfo = ahead === null || analysis.lang !== 'en' ? '' : `Your token is CAR-${String(token.number).padStart(3, '0')}. There ${ahead === 1 ? 'is 1 person' : `are ${ahead} people`} ahead of you, about ${ahead * queue.avgMinutes} minutes.`
    await say(companionReply({ analysis, voice: voiceResult, name: L.name, companion: L.profile.companionName, meds: L.meds, queueInfo, seed: seedRef.current++, now: new Date() }), analysis.lang)
  }, [update, setProfile, setData, raise, assess, say, data.tokens, data.queues])

  const handleHeard = useCallback(async (text, heard = null) => {
    lastContactRef.current = Date.now()
    respondedAtRef.current = Date.now()
    missedRef.current = 0
    fallRef.current = false
    inactiveRef.current = false
    typedRef.current = text
    addMessage('patient', text)
    await processUtterance(text, heard)
  }, [addMessage, processUtterance])

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
      raise(assess(), { toDoctor: guardRef.current.mode === GUARD_MODE.recording })
    } finally {
      busyRef.current = false
    }
  }, [say, hearReply, handleHeard, addMessage, raise, assess, voice])

  const onCameraEvent = useCallback((event) => {
    if (event === 'possible-fall') { fallRef.current = true; addMessage('system', 'CCTV check: possible fall confirmed.') }
    else if (event === 'inactive') { inactiveRef.current = true; addMessage('system', 'CCTV check: unusually still.') }
    raise(assess())
    runCheckIn()
  }, [addMessage, raise, assess, runCheckIn])
  live.current.onCameraEvent = onCameraEvent

  const applyEffect = useCallback(async (effect, reasons) => {
    const words = reasons.map(r => THERMAL_WORDS[r] || r).join(' and ')
    if (effect === 'cctv-on') {
      setCctvOn(true)
      addMessage('system', `Thermal sensor noticed ${words}. CCTV is on for a live check. Nothing is recorded or shared.`)
      runCheckIn()
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
      addMessage('system', 'All clear. CCTV switched off.')
    }
  }, [addMessage, runCheckIn, cctv, raise, assess, profile.thermal.cctvKind, refreshClips])

  // Privacy guard tick: decides when CCTV may turn on and when anything may be recorded.
  useEffect(() => {
    if (!profile.autonomous) return undefined
    const timer = setInterval(async () => {
      const current = guardRef.current
      const cctvEvents = cctvEventsRef.current.splice(0)
      const input = { now: Date.now(), thermalActive: thermalActiveRef.current, cctvEvents: toThermalTokens(cctvEvents), responded: respondedAtRef.current >= current.since && current.since > 0 }
      const { guard: next, effects } = stepGuard(current, input)
      if (next !== current) { guardRef.current = next; setGuard(next) }
      for (const effect of effects) await applyEffect(effect, next.reasons.length ? next.reasons : current.reasons)
    }, 1000)
    return () => clearInterval(timer)
  }, [profile.autonomous, applyEffect])

  // Turning AI care mode off must leave nothing running.
  useEffect(() => {
    if (profile.autonomous) return
    guardRef.current = initialGuard()
    setGuard(guardRef.current)
    setCctvOn(false)
    thermalActiveRef.current = []
  }, [profile.autonomous])

  // Autonomous loop: medicine reminders, and voice check-ins whenever nothing can see the patient.
  useEffect(() => {
    if (!profile.autonomous) return undefined
    const timer = setInterval(() => {
      const L = live.current
      dueMedications(L.meds, nowMinutes()).filter(m => !remindedRef.current.has(m.id)).forEach(m => {
        remindedRef.current.add(m.id)
        say(localize(replyLangRef.current, 'medReminder', { med: `${m.name}, ${m.instruction.toLowerCase()}, ${m.note.toLowerCase()}` }))
      })
      if (L.eyes !== 'live' && !busyRef.current && Date.now() - lastContactRef.current >= L.profile.checkInSeconds * 1000) runCheckIn()
    }, 5000)
    return () => clearInterval(timer)
  }, [profile.autonomous, say, runCheckIn])

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
    if (turningOn) await say(`Hello ${user.name.split(' ')[0]}, I'm ${companionName}. I'll be right here with you. The camera stays off for your privacy, and I only look if my heat sensor notices something unusual. I'll also look after your medicines. Just talk to me any time.`)
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
  const eyesText = guard.mode === GUARD_MODE.thermal ? (eyes === 'live' ? 'thermal sensor only (CCTV off)' : 'not available, using voice') : 'thermal sensor and CCTV (live check)'

  return <>
    <PageTitle eyebrow="AI COMPANION · PATIENT CARE" title={`${companionName} is looking after you.`} text="Your companion talks with you and keeps watch privately: CCTV stays off, a heat sensor watches, and the camera only opens if something looks wrong. Family, doctor and caretaker are alerted when it matters." actions={<button className={`btn ${profile.autonomous ? 'btn-dark' : 'btn-primary'}`} onClick={toggleAi}><Power/> {profile.autonomous ? 'Stop AI care mode' : 'Start AI care mode'}</button>}/>
    <StatusStrip aiOn={profile.autonomous} online={online} thermalStatus={thermal.status} cctvOn={cctvOn} recording={recordingActive} listening={voice.listening} speaking={voice.speaking} level={level}/>
    <div className="cmp-grid">
      <ConversationPanel messages={messages} onSend={handleHeard} onMic={onMic} listening={voice.listening} interim={voice.interim} canListen={voice.canListen} companionName={companionName}/>
      <PrivacyPanel {...{ guard, thermal, cctv: { ...cctv, on: cctvOn }, profile, setThermalSource, scenario, setScenario, sensorLoss, setSensorLoss }}/>
      <UnderstandingPanel snapshot={snapshot} events={state.events} camera={eyesText} voiceCheck={voiceCheck} baseline={profile.voiceBaseline}/>
      <VoicePanel {...{ voice, profile, setProfile, hasSample, recording: recordingSample, onRecord: onRecordSample, onTest: () => say(`Hi, I'm ${companionName}. This is how I will sound.`) }}/>
      <ContactsPanel contacts={profile.contacts} onAdd={addContact} onRemove={removeContact}/>
      <ClipsPanel clips={clips} onDelete={removeClip}/>
      <RelayPanel queue={state.relayQueue} online={online} simulateOffline={simulateOffline} setSimulateOffline={setSimulateOffline} contacts={profile.contacts} onSpeak={say}/>
    </div>
  </>
}
