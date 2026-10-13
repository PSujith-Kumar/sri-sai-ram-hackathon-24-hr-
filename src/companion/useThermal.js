import { useEffect, useRef, useState } from 'react'
import { analyzeThermalFrame, initialThermalState, simulateFrame, stepThermal } from './thermal'

const POLL_MS = 1000

/**
 * Polls a thermal camera and tracks anomalies. Frames stay in memory and are never stored or sent anywhere.
 * source.kind: 'sim' (built-in simulator) | 'http' (a gateway URL returning { width, height, temps: [°C…] }).
 * status: off | connecting | live | unavailable
 */
export function useThermal({ source, enabled, scenario, forceUnavailable, onUpdate }) {
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
    if (forceUnavailable || (source.kind === 'http' && !source.url)) { setStatus('unavailable'); return undefined }
    stateRef.current = initialThermalState(Date.now())
    prevRef.current = null
    setStatus('connecting')
    let cancelled = false
    const tick = async () => {
      try {
        const frame = source.kind === 'http'
          ? await fetch(source.url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
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
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [enabled, forceUnavailable, source.kind, source.url])

  return { status, ...view }
}
