import { useEffect, useRef, useState } from 'react'
import { frameDifference, initialMotionState, stepMotion } from './motion'
import { normalFrameUrl, setNormalCamera } from './phoneLink'

const W = 64
const H = 48
const SAMPLE_MS = 500
const PHONE_POLL_MS = 600
const PHONE_RENEW_MS = 5000     // the camera phone stays on only while the app keeps asking (every 5 s)
const PHONE_SILENCE_MS = 12000  // no picture this long: "unavailable", so voice check-ins take over
const GRAB_WIDTH = 640

// pictures from the phone are shown through short-lived object URLs; each one is released as the next arrives
function showFrame(img, blob) {
  if (!img) return
  const next = URL.createObjectURL(blob)
  const old = img.dataset.blob
  img.src = next
  img.dataset.blob = next
  if (old) URL.revokeObjectURL(old)
}
function clearFrame(img) {
  if (!img?.dataset.blob) return
  URL.revokeObjectURL(img.dataset.blob)
  img.removeAttribute('src')
  delete img.dataset.blob
}

/**
 * Connects to a camera and runs the motion heuristic on it.
 * source.kind: 'webcam' (this device) | 'ip' (an MJPEG URL) | 'phone' (the camera phone linked through the local phone
 * gateway: it is switched on only while this hook is enabled, and switched off again, deleting its last picture, when not).
 * status: off | connecting | live | unavailable. `unavailable` is what triggers the voice fallback.
 * `grabFrame()` resolves the newest picture as a JPEG Blob (webcam and phone), for the Gemma 3 camera check.
 */
export function useCamera({ source, enabled, forceUnavailable, onEvent, patientId, reason = '' }) {
  const videoRef = useRef(null)
  const imgRef = useRef(null)
  const stateRef = useRef(initialMotionState(Date.now()))
  const prevRef = useRef(null)
  const onEventRef = useRef(onEvent)
  const reasonRef = useRef(reason)
  const latestRef = useRef(null)   // newest picture from the phone, in memory only
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recCanvasRef = useRef(null)
  const [status, setStatus] = useState('off')
  const [motion, setMotion] = useState(0)
  const [analysable, setAnalysable] = useState(true)

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])
  useEffect(() => { reasonRef.current = reason }, [reason])

  // this device's camera
  useEffect(() => {
    if (source.kind === 'phone') return undefined
    if (!enabled) { setStatus('off'); return undefined }
    if (forceUnavailable) { setStatus('unavailable'); return undefined }
    let stream = null
    let cancelled = false
    setStatus('connecting')
    if (source.kind === 'webcam') {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return undefined }
      navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
          stream = s
          const video = videoRef.current
          if (video) { video.srcObject = s; video.play().catch(() => {}) }
          s.getVideoTracks()[0].onended = () => setStatus('unavailable')
          setStatus('live')
        })
        .catch(() => { if (!cancelled) setStatus('unavailable') })
    } else if (!source.url) {
      setStatus('unavailable')
    }
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [enabled, forceUnavailable, source.kind, source.url])

  // the camera phone
  useEffect(() => {
    if (source.kind !== 'phone') return undefined
    if (!enabled) { setStatus('off'); return undefined }
    if (forceUnavailable || !patientId) { setStatus('unavailable'); return undefined }
    let cancelled = false
    let lastFrameAt = 0
    const startedAt = Date.now()
    const img = imgRef.current
    setStatus('connecting')
    setNormalCamera(patientId, true, reasonRef.current)
    const renew = setInterval(() => setNormalCamera(patientId, true, reasonRef.current), PHONE_RENEW_MS)
    const poll = async () => {
      try {
        const res = await fetch(`${normalFrameUrl(patientId)}&ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (cancelled) return
        latestRef.current = blob
        lastFrameAt = Date.now()
        showFrame(imgRef.current, blob)
        if (recorderRef.current && recCanvasRef.current) {
          const bitmap = await createImageBitmap(blob)
          recCanvasRef.current.width = bitmap.width
          recCanvasRef.current.height = bitmap.height
          recCanvasRef.current.getContext('2d').drawImage(bitmap, 0, 0)
          bitmap.close()
        }
        setStatus('live')
      } catch {
        if (!cancelled && Date.now() - Math.max(lastFrameAt, startedAt) > PHONE_SILENCE_MS) setStatus('unavailable')
      }
    }
    poll()
    const timer = setInterval(poll, PHONE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer); clearInterval(renew)
      setNormalCamera(patientId, false) // switches the phone camera off and deletes its last picture
      latestRef.current = null
      clearFrame(img || imgRef.current)
    }
  }, [enabled, forceUnavailable, source.kind, patientId])

  useEffect(() => {
    if (status !== 'live') return undefined
    stateRef.current = initialMotionState(Date.now())
    prevRef.current = null
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const timer = setInterval(() => {
      const el = source.kind === 'webcam' ? videoRef.current : imgRef.current
      if (!el) return
      try {
        ctx.drawImage(el, 0, 0, W, H)
        const px = ctx.getImageData(0, 0, W, H).data
        const gray = new Uint8Array(W * H)
        for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
        const score = frameDifference(prevRef.current, gray)
        prevRef.current = gray
        setMotion(score)
        setAnalysable(true)
        const { state, events } = stepMotion(stateRef.current, score, Date.now())
        stateRef.current = state
        events.forEach(e => onEventRef.current?.(e))
      } catch {
        setAnalysable(false) // cross-origin IP stream: viewable but pixels are not readable
      }
    }, SAMPLE_MS)
    return () => clearInterval(timer)
  }, [status, source.kind])

  const ipHandlers = { onLoad: () => setStatus((s) => (s === 'connecting' ? 'live' : s)), onError: () => setStatus('unavailable') }

  // Recording is only ever started by the privacy guard after something abnormal is confirmed.
  const startRecording = () => {
    if (recorderRef.current || typeof MediaRecorder === 'undefined') return false
    let stream = null
    if (source.kind === 'phone') {
      const canvas = document.createElement('canvas') // the phone's pictures are drawn here and recorded as a clip
      canvas.width = 640
      canvas.height = 480
      recCanvasRef.current = canvas
      stream = canvas.captureStream?.(5) || null
    } else stream = videoRef.current?.srcObject
    if (!stream) return false
    chunksRef.current = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
    recorder.start(2000)
    recorderRef.current = recorder
    return true
  }
  const stopRecording = () => new Promise((resolve) => {
    const recorder = recorderRef.current
    if (!recorder) return resolve(null)
    recorderRef.current = null
    recCanvasRef.current = null
    recorder.onstop = () => resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null)
    if (recorder.state !== 'inactive') recorder.stop(); else resolve(null)
  })

  const grabFrame = async () => {
    if (source.kind === 'phone') return latestRef.current
    const video = videoRef.current
    if (source.kind !== 'webcam' || !video?.videoWidth) return null
    const scale = Math.min(1, GRAB_WIDTH / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7))
  }

  return { videoRef, imgRef, status, motion, analysable, ipHandlers, startRecording, stopRecording, grabFrame }
}
