import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeAudio } from './voiceAnalysis'

// Optional cloud voice-cloning endpoint. POST {text, sample} → audio blob.
// Without it the companion speaks with the voices installed on the device.
const TTS_ENDPOINT = import.meta.env.VITE_TTS_ENDPOINT || ''
const SpeechRecognitionCtor = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const sampleKey = (patientId) => `carebridge-voice-sample-${patientId}`
const AUTO_LANGS = ['en-IN', 'hi-IN', 'ta-IN']
const FATAL_ERRORS = ['not-allowed', 'service-not-allowed', 'audio-capture', 'unsupported']
export const SAMPLE_PROMPT = 'Hello, today I am feeling fine, and I would like a cup of tea.'
export const SAMPLE_WORDS = SAMPLE_PROMPT.split(/\s+/).length

export const loadVoiceSample = (patientId) => { try { return localStorage.getItem(sampleKey(patientId)) } catch { return null } }
const saveVoiceSample = (patientId, dataUrl) => { try { localStorage.setItem(sampleKey(patientId), dataUrl); return true } catch { return false } }

/** Plain-language help for each way the microphone / speech recognition can fail. */
export function explainSpeechError(code, lang = 'en-IN') {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed': return 'The microphone is blocked. Click the lock icon in the address bar, allow the microphone, then press the mic again.'
    case 'audio-capture': return 'No microphone was found. Plug one in or choose another input in your system sound settings.'
    case 'no-speech': return 'I did not hear anything. Press the mic, wait for it to turn red, then speak.'
    case 'network': return 'Speech recognition in this browser uses an online service and needs internet. You can still type to me.'
    case 'language-not-supported': return `This browser cannot recognise ${lang}. Try Auto or English.`
    case 'unsupported': return 'Voice input works in Chrome or Edge. In this browser you can type to me instead.'
    default: return ''
  }
}

/** Captures raw microphone audio so the voice itself (not just the words) can be analysed. */
async function startCapture(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  const source = ctx.createMediaStreamSource(stream)
  const node = ctx.createScriptProcessor(4096, 1, 1)
  const chunks = []
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  source.connect(node)
  node.connect(ctx.destination)
  return {
    stop() {
      node.disconnect(); source.disconnect(); ctx.close().catch(() => {})
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const samples = new Float32Array(total)
      let offset = 0
      for (const c of chunks) { samples.set(c, offset); offset += c.length }
      return { samples, sampleRate: ctx.sampleRate }
    },
  }
}

const micConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }

function pickVoice(voices, lang, preferredURI) {
  const preferred = voices.find(v => v.voiceURI === preferredURI)
  if (preferred && preferred.lang.toLowerCase().startsWith(lang)) return preferred
  return voices.find(v => v.lang.toLowerCase().startsWith(lang)) || (lang === 'en' ? preferred : null) || null
}

export function useVoice({ profile, patientId, onProblem }) {
  const [voices, setVoices] = useState([])
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const heardRef = useRef(null)
  const onProblemRef = useRef(onProblem)
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

  useEffect(() => { onProblemRef.current = onProblem }, [onProblem])
  useEffect(() => {
    if (!synth) return undefined
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [synth])

  const speakWithBrowser = useCallback((text, lang) => new Promise((resolve) => {
    if (!synth) return resolve()
    synth.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(synth.getVoices(), lang, profile.voiceURI)
    utter.lang = voice ? voice.lang : `${lang}-IN`
    if (voice) utter.voice = voice
    utter.rate = profile.rate
    utter.pitch = profile.pitch
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    synth.speak(utter)
  }), [synth, profile.voiceURI, profile.rate, profile.pitch])

  /** Speaks `text`. `lang` is 'en' | 'hi' | 'ta' so the reply is voiced in the language it is written in. */
  const speak = useCallback(async (text, lang = 'en') => {
    setSpeaking(true)
    try {
      const sample = TTS_ENDPOINT ? loadVoiceSample(patientId) : null
      if (TTS_ENDPOINT && sample) {
        try {
          const res = await fetch(TTS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sample, lang }) })
          if (!res.ok) throw new Error(`TTS ${res.status}`)
          const url = URL.createObjectURL(await res.blob())
          audioRef.current = new Audio(url)
          await new Promise((resolve) => { audioRef.current.onended = resolve; audioRef.current.onerror = resolve; audioRef.current.play().catch(resolve) })
          URL.revokeObjectURL(url)
          return
        } catch {
          // offline or provider down: fall back to the on-device voice
        }
      }
      await speakWithBrowser(text, lang)
    } finally {
      setSpeaking(false)
    }
  }, [patientId, speakWithBrowser])

  const stopSpeaking = useCallback(() => { synth?.cancel(); audioRef.current?.pause(); setSpeaking(false) }, [synth])

  /** One recognition attempt in one language. Resolves { text, confidence, error }. */
  const recognizeOnce = useCallback((lang, timeoutMs) => new Promise((resolve) => {
    const rec = new SpeechRecognitionCtor()
    recognitionRef.current = rec
    rec.lang = lang
    rec.interimResults = true
    rec.maxAlternatives = 1
    let done = false
    let error = null
    const finish = (text, confidence = 0) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { rec.stop() } catch { /* already stopped */ }
      resolve({ text, confidence, error })
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    rec.onresult = (e) => {
      const result = e.results[e.results.length - 1]
      const alt = result[0]
      setInterim(alt.transcript)
      if (result.isFinal) finish(alt.transcript.trim() || null, alt.confidence || 0.7)
    }
    rec.onerror = (e) => { error = e.error; finish(null) }
    rec.onend = () => finish(null)
    try { rec.start() } catch (e) { error = 'audio-capture'; finish(null) }
  }), [])

  /**
   * Listens for the patient. Resolves with the transcript or null, and leaves the details
   * (language, confidence, how the voice sounded) in `heard()`. Explains any failure via onProblem.
   */
  const listen = useCallback(async (timeoutMs = 9000) => {
    heardRef.current = null
    if (!navigator.mediaDevices?.getUserMedia) { onProblemRef.current?.('unsupported'); return null }
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia(micConstraints) } catch (e) {
      onProblemRef.current?.(e.name === 'NotFoundError' ? 'audio-capture' : 'not-allowed')
      return null
    }
    const capture = await startCapture(stream).catch(() => null)
    setListening(true)
    setInterim('')
    const langs = profile.lang === 'auto' ? AUTO_LANGS : [profile.lang]
    let best = { text: null, confidence: 0, lang: langs[0] }
    let problem = null
    if (!SpeechRecognitionCtor) problem = 'unsupported'
    else {
      for (const lang of langs) {
        const res = await recognizeOnce(lang, langs.length > 1 ? Math.min(timeoutMs, 7000) : timeoutMs)
        if (res.error && res.error !== 'no-speech' && res.error !== 'aborted') problem = res.error
        else if (res.error === 'no-speech') problem = problem || 'no-speech'
        if (res.text && res.confidence >= best.confidence) best = { text: res.text, confidence: res.confidence, lang }
        if (best.text && best.confidence >= 0.6) break
        if (FATAL_ERRORS.includes(res.error)) break
      }
    }
    const audio = capture?.stop()
    stream.getTracks().forEach(t => t.stop())
    setListening(false)
    setInterim('')
    if (!best.text) { if (problem) onProblemRef.current?.(problem, best.lang); return null }
    heardRef.current = { text: best.text, lang: best.lang, confidence: best.confidence, features: audio ? analyzeAudio(audio.samples, audio.sampleRate) : null }
    return best.text
  }, [profile.lang, recognizeOnce])

  const stopListening = useCallback(() => { try { recognitionRef.current?.abort() } catch { /* ignore */ } setListening(false) }, [])

  /** Records a short voice sample (stored on this device) and measures how this person normally sounds. */
  const recordSample = useCallback(async (seconds = 8) => {
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints)
    const capture = await startCapture(stream).catch(() => null)
    const recorder = new MediaRecorder(stream)
    const chunks = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    const stopped = new Promise((resolve) => { recorder.onstop = resolve })
    recorder.start()
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000)
    await stopped
    const audio = capture?.stop()
    stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(chunks, { type: recorder.mimeType })
    const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob) })
    return { saved: saveVoiceSample(patientId, dataUrl), features: audio ? analyzeAudio(audio.samples, audio.sampleRate) : null }
  }, [patientId])

  return {
    voices, speaking, listening, interim, speak, stopSpeaking, listen, stopListening, recordSample, heard: () => heardRef.current,
    canSpeak: Boolean(synth), canListen: Boolean(SpeechRecognitionCtor), cloudVoice: Boolean(TTS_ENDPOINT),
  }
}
