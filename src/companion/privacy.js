// Privacy guard: decides when the CCTV may be on and when anything may be recorded.
//  thermal-only → CCTV off, nothing recorded (default, thermal sensor keeps watch)
//  verifying    → CCTV on for live analysis only, still nothing recorded or shared
//  recording    → abnormal confirmed: clip recorded locally and alerts sent
// Pure state machine so the rules can be tested.

export const GUARD_MODE = { thermal: 'thermal-only', verifying: 'cctv-verifying', recording: 'recording' }

export const GUARD_CONFIG = {
  confirmAfterMs: 20000,  // thermal anomaly still active this long → treat as confirmed
  calmBeforeCctvOffMs: 30000,
  calmBeforeStopRecordingMs: 60000,
  maxVerifyMs: 60000,     // patient answered but the thermal flag lingers: stop watching after this long…
  suppressMs: 600000,     // …and ignore that same flag for this long
}

export const initialGuard = (extra = {}) => ({ mode: GUARD_MODE.thermal, since: 0, calmSince: null, reasons: [], suppressedUntil: 0, suppressed: [], ...extra })

export const cctvAllowed = (guard) => guard.mode !== GUARD_MODE.thermal
export const recordingAllowed = (guard) => guard.mode === GUARD_MODE.recording

/**
 * input: { now, thermalActive: string[], cctvEvents: string[], responded: boolean }
 * `cctvEvents` are what the CCTV analysis confirmed (e.g. 'possible-fall'); `responded` means the patient answered.
 * Returns { guard, effects } where effects ∈ cctv-on | cctv-off | start-recording | stop-recording | alert.
 */
export function stepGuard(guard, input, cfg = GUARD_CONFIG) {
  const { now, cctvEvents = [], responded = false } = input
  const muted = (r) => guard.suppressed.includes(r) && now < guard.suppressedUntil
  const thermalActive = (input.thermalActive || []).filter(r => guard.mode !== GUARD_MODE.thermal || !muted(r))
  const abnormalNow = thermalActive.length > 0 || cctvEvents.length > 0
  const reasons = [...new Set([...thermalActive, ...cctvEvents])]

  if (guard.mode === GUARD_MODE.thermal) {
    if (!abnormalNow) return { guard, effects: [] }
    return { guard: initialGuard({ mode: GUARD_MODE.verifying, since: now, reasons }), effects: ['cctv-on'] }
  }

  if (guard.mode === GUARD_MODE.verifying) {
    if (responded && cctvEvents.length === 0 && thermalActive.length > 0 && now - guard.since >= cfg.maxVerifyMs) {
      return { guard: initialGuard({ suppressed: thermalActive, suppressedUntil: now + cfg.suppressMs }), effects: ['cctv-off'] }
    }
    const confirmed = cctvEvents.length > 0 || (thermalActive.length > 0 && now - guard.since >= cfg.confirmAfterMs && !responded)
    if (confirmed) return { guard: { mode: GUARD_MODE.recording, since: now, calmSince: null, reasons }, effects: ['start-recording', 'alert'] }
    if (abnormalNow) return { guard: { ...guard, calmSince: null, reasons }, effects: [] }
    const calmSince = guard.calmSince ?? now
    if (now - calmSince >= cfg.calmBeforeCctvOffMs) return { guard: initialGuard(), effects: ['cctv-off'] }
    return { guard: { ...guard, calmSince }, effects: [] }
  }

  // recording
  if (abnormalNow) return { guard: { ...guard, calmSince: null, reasons: [...new Set([...guard.reasons, ...reasons])] }, effects: [] }
  const calmSince = guard.calmSince ?? now
  if (responded && now - calmSince >= cfg.calmBeforeStopRecordingMs) return { guard: initialGuard(), effects: ['stop-recording', 'cctv-off'] }
  return { guard: { ...guard, calmSince }, effects: [] }
}
