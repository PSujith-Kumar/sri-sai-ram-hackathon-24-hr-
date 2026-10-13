import { useEffect, useRef, useState } from 'react'
import { analyzeThermalFrame, initialThermalState, simulateFrame, stepThermal } from './thermal'
import { setWatch, thermalFrameUrl } from './phoneLink'

const POLL_MS = 1000
const WATCH_RENEW_MS = 10000 // the thermal phone stops sending by itself if the app stops renewing this

/**
 * Polls a thermal camera and tracks anomalies. Frames stay in memory and are never stored or sent anywhere.
 * source.kind: 'sim' (built-in simulator) | 'http' (a gateway URL returning { width, height, temps: [°C…] })
 *              | 'phone' (the thermal phone linked through the local phone gateway; needs `patientId`).
 * status: off | connecting | live | unavailable
 */
export function useThermal({ source, enabled, scenario, forceUnavailable, onUpdate, patientId }) {
  const [status, setStatus] = useState('off')
  const [view, setView] = useState({ frame: null, analysis: null, active: [] })
  const stateRef = useRef(initialThermalState(Date.now()))
  const prevRef = useRef(null)
  const tickRef = useRef(0)
  const onUpdateRef = useRef(onUpdate)
  const scenarioRef = useRef(scenario)

  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { scenarioRef.current = scenario; tickRef.current = 0 }, [scenario])

  useEffect(() => {
    if (!enabled) { setStatus('off'); return undefined }
    const isPhone = source.kind === 'phone'
    if (forceUnavailable || (source.kind === 'http' && !source.url) || (isPhone && !patientId)) { setStatus('unavailable'); return undefined }
    const frameUrl = isPhone ? thermalFrameUrl(patientId) : source.url
    stateRef.current = initialThermalState(Date.now())
    prevRef.current = null
    setStatus('connecting')
    let cancelled = false
    const tick = async () => {
      try {
        const frame = source.kind === 'http' || isPhone
          ? await fetch(frameUrl, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
          : simulateFrame(scenarioRef.current, tickRef.current++)
        if (cancelled) return
        if (!frame?.temps?.length || !frame.width) throw new Error('bad frame')
        const analysis = analyzeThermalFrame(frame, prevRef.current)
        prevRef.current = frame
        const { state, events, active } = stepThermal(stateRef.current, analysis, Date.now())
        stateRef.current = state
        setStatus('live')
        setView({ frame, analysis, active })
        onUpdateRef.current?.({ events, active, analysis })
      } catch {
        if (!cancelled) setStatus('unavailable')
      }
    }
    let renew = null
    if (isPhone) { setWatch(patientId, true); renew = setInterval(() => setWatch(patientId, true), WATCH_RENEW_MS) }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true; clearInterval(timer); clearInterval(renew)
      if (isPhone) setWatch(patientId, false) // privacy: the thermal phone stops sending as soon as watching stops
    }
  }, [enabled, forceUnavailable, source.kind, source.url, patientId])

  return { status, ...view }
}
