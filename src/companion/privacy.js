// Privacy guard: decides when the CCTV may be on and when anything may be recorded.
//  thermal-only → CCTV off, nothing recorded (default, thermal sensor keeps watch)
//  verifying    → CCTV on for live analysis only, still nothing recorded or shared. Triggered by something the thermal
//                 sensor noticed, OR by a "soft" signal: a change in the patient's voice tone or words (softEvents).
//                 A soft signal only lets the camera look; it can never confirm an incident or start recording.
//  recording    → abnormal confirmed: clip recorded locally and alerts sent
// Pure state machine so the rules can be tested.

export const GUARD_MODE = { thermal: 'thermal-only', verifying: 'cctv-verifying', recording: 'recording' }

export const GUARD_CONFIG = {
  confirmAfterMs: 20000,  // thermal anomaly still active this long → treat as confirmed
  calmBeforeCctvOffMs: 30000,
  calmBeforeStopRecordingMs: 60000,
  maxVerifyMs: 60000,     // patient answered but the thermal flag lingers: stop watching after this long…
  suppressMs: 600000,     // …and ignore that same flag for this long
  softHoldMs: 30000,      // a tone/word concern keeps the camera on for a look this long, then it needs the camera or thermal to agree
}

export const initialGuard = (extra = {}) => ({ mode: GUARD_MODE.thermal, since: 0, calmSince: null, reasons: [], softUntil: 0, suppressedUntil: 0, suppressed: [], ...extra })

export const cctvAllowed = (guard) => guard.mode !== GUARD_MODE.thermal
export const recordingAllowed = (guard) => guard.mode === GUARD_MODE.recording

/**
 * input: { now, thermalActive: string[], cctvEvents: string[], softEvents?: string[], responded: boolean }
 * `cctvEvents` are what the CCTV analysis confirmed (e.g. 'possible-fall'); `responded` means the patient answered.
 * `softEvents` are one-off concerns that are not proof of anything (e.g. 'voice-change'): they switch the camera on for a look.
 * Returns { guard, effects } where effects ∈ cctv-on | cctv-off | start-recording | stop-recording | alert.
 */
export function stepGuard(guard, input, cfg = GUARD_CONFIG) {
  const { now, cctvEvents = [], softEvents = [], responded = false } = input
  const muted = (r) => guard.suppressed.includes(r) && now < guard.suppressedUntil
  const thermalActive = (input.thermalActive || []).filter(r => guard.mode !== GUARD_MODE.thermal || !muted(r))
  const abnormalNow = thermalActive.length > 0 || cctvEvents.length > 0
  const reasons = [...new Set([...thermalActive, ...cctvEvents, ...softEvents])]
  const softNow = softEvents.length > 0

  if (guard.mode === GUARD_MODE.thermal) {
    if (!abnormalNow && !softNow) return { guard, effects: [] }
    return { guard: initialGuard({ mode: GUARD_MODE.verifying, since: now, reasons, softUntil: softNow ? now + cfg.softHoldMs : 0 }), effects: ['cctv-on'] }
  }

  if (guard.mode === GUARD_MODE.verifying) {
    if (responded && cctvEvents.length === 0 && thermalActive.length > 0 && now - guard.since >= cfg.maxVerifyMs) {
      return { guard: initialGuard({ suppressed: thermalActive, suppressedUntil: now + cfg.suppressMs }), effects: ['cctv-off'] }
    }
    const confirmed = cctvEvents.length > 0 || (thermalActive.length > 0 && now - guard.since >= cfg.confirmAfterMs && !responded)
    if (confirmed) return { guard: { mode: GUARD_MODE.recording, since: now, calmSince: null, reasons }, effects: ['start-recording', 'alert'] }
    const softUntil = softNow ? now + cfg.softHoldMs : guard.softUntil || 0
    if (abnormalNow || softNow || softUntil > now) return { guard: { ...guard, calmSince: null, softUntil, reasons: [...new Set([...guard.reasons, ...reasons])] }, effects: [] }
    const calmSince = guard.calmSince ?? now
    if (now - calmSince >= cfg.calmBeforeCctvOffMs) return { guard: initialGuard(), effects: ['cctv-off'] }
    return { guard: { ...guard, calmSince }, effects: [] }
  }

  // recording
  if (abnormalNow || softNow) return { guard: { ...guard, calmSince: null, reasons: [...new Set([...guard.reasons, ...reasons])] }, effects: [] }
  const calmSince = guard.calmSince ?? now
  if (responded && now - calmSince >= cfg.calmBeforeStopRecordingMs) return { guard: initialGuard(), effects: ['stop-recording', 'cctv-off'] }
  return { guard: { ...guard, calmSince }, effects: [] }
}
