import { useCallback, useEffect, useRef, useState } from 'react'

// Optional cloud voice-cloning endpoint. POST {text, sample} → audio blob.
// Without it the companion speaks with the voices installed on the device.
const TTS_ENDPOINT = import.meta.env.VITE_TTS_ENDPOINT || ''
const SpeechRecognitionCtor = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const sampleKey = (patientId) => `carebridge-voice-sample-${patientId}`

export const loadVoiceSample = (patientId) => { try { return localStorage.getItem(sampleKey(patientId)) } catch { return null } }
const saveVoiceSample = (patientId, dataUrl) => { try { localStorage.setItem(sampleKey(patientId), dataUrl); return true } catch { return false } }

export function useVoice({ profile, patientId }) {
  const [voices, setVoices] = useState([])
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

  useEffect(() => {
    if (!synth) return undefined
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [synth])

  const speakWithBrowser = useCallback((text) => new Promise((resolve) => {
    if (!synth) return resolve()
    synth.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    const voice = synth.getVoices().find(v => v.voiceURI === profile.voiceURI)
    if (voice) { utter.voice = voice; utter.lang = voice.lang }
    utter.rate = profile.rate
    utter.pitch = profile.pitch
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    synth.speak(utter)
  }), [synth, profile.voiceURI, profile.rate, profile.pitch])

  const speak = useCallback(async (text) => {
    setSpeaking(true)
    try {
      const sample = TTS_ENDPOINT ? loadVoiceSample(patientId) : null
      if (TTS_ENDPOINT && sample) {
        try {
          const res = await fetch(TTS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, sample }) })
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
      await speakWithBrowser(text)
    } finally {
      setSpeaking(false)
    }
  }, [patientId, speakWithBrowser])

  const stopSpeaking = useCallback(() => { synth?.cancel(); audioRef.current?.pause(); setSpeaking(false) }, [synth])

  /** Listens once. Resolves with the transcript, or null on silence / error / no support. */
  const listen = useCallback((timeoutMs = 9000) => new Promise((resolve) => {
    if (!SpeechRecognitionCtor) return resolve(null)
    const rec = new SpeechRecognitionCtor()
    recognitionRef.current = rec
    rec.lang = profile.lang
    rec.interimResults = false
    rec.maxAlternatives = 1
    let done = false
    const finish = (value) => { if (done) return; done = true; clearTimeout(timer); setListening(false); try { rec.stop() } catch { /* already stopped */ } resolve(value) }
    const timer = setTimeout(() => finish(null), timeoutMs)
    rec.onresult = (e) => finish(e.results[0]?.[0]?.transcript?.trim() || null)
    rec.onerror = () => finish(null)
    rec.onend = () => finish(null)
    setListening(true)
    try { rec.start() } catch { finish(null) }
  }), [profile.lang])

  const stopListening = useCallback(() => { try { recognitionRef.current?.abort() } catch { /* ignore */ } setListening(false) }, [])

  /** Records a short voice sample and stores it on this device. */
  const recordSample = useCallback(async (seconds = 8) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    const chunks = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    const stopped = new Promise((resolve) => { recorder.onstop = resolve })
    recorder.start()
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000)
    await stopped
    stream.getTracks().forEach(t => t.stop())
    const blob = new Blob(chunks, { type: recorder.mimeType })
    const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob) })
    return saveVoiceSample(patientId, dataUrl) ? dataUrl : null
  }, [patientId])

  return {
    voices, speaking, listening, speak, stopSpeaking, listen, stopListening, recordSample,
    canSpeak: Boolean(synth), canListen: Boolean(SpeechRecognitionCtor), cloudVoice: Boolean(TTS_ENDPOINT),
  }
}
