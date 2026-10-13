import { useEffect, useRef, useState } from 'react'
import { frameDifference, initialMotionState, stepMotion } from './motion'

const W = 64
const H = 48
const SAMPLE_MS = 500

/**
 * Connects to a webcam or an IP camera (MJPEG URL) and runs the motion heuristic on it.
 * status: off | connecting | live | unavailable. `unavailable` is what triggers the voice fallback.
 */
export function useCamera({ source, enabled, forceUnavailable, onEvent }) {
  const videoRef = useRef(null)
  const imgRef = useRef(null)
  const stateRef = useRef(initialMotionState(Date.now()))
  const prevRef = useRef(null)
  const onEventRef = useRef(onEvent)
  const [status, setStatus] = useState('off')
  const [motion, setMotion] = useState(0)
  const [analysable, setAnalysable] = useState(true)

  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
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
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startRecording = () => {
    const stream = videoRef.current?.srcObject
    if (!stream || recorderRef.current || typeof MediaRecorder === 'undefined') return false
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
    recorder.onstop = () => resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null)
    if (recorder.state !== 'inactive') recorder.stop(); else resolve(null)
  })

  return { videoRef, imgRef, status, motion, analysable, ipHandlers, startRecording, stopRecording }
}
