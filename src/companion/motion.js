// Camera motion analysis. Pure functions so the fall / inactivity heuristic can be tested.
// This is a motion heuristic, not medical-grade computer vision.

export const MOTION_CONFIG = {
  burstScore: 0.18,         // sudden large movement (possible fall)
  stillScore: 0.02,         // below this the scene counts as still
  stillAfterBurstMs: 8000,
  inactivityMs: 120000,
}

export const initialMotionState = (now) => ({ lastMotionAt: now, burstAt: null, fallFlagged: false, inactiveFlagged: false })

/** Mean absolute difference of two equal-length grayscale arrays, 0..1. */
export function frameDifference(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / (a.length * 255)
}

export function stepMotion(state, score, now, cfg = MOTION_CONFIG) {
  let next = { ...state }
  const events = []
  if (score >= cfg.stillScore) next = { ...next, lastMotionAt: now, inactiveFlagged: false }
  if (score >= cfg.burstScore) next = { ...next, burstAt: now, fallFlagged: false }
  const stillFor = now - next.lastMotionAt
  if (next.burstAt !== null && !next.fallFlagged && stillFor >= cfg.stillAfterBurstMs) {
    next = { ...next, fallFlagged: true, burstAt: null }
    events.push('possible-fall')
  }
  if (!next.inactiveFlagged && stillFor >= cfg.inactivityMs) {
    next = { ...next, inactiveFlagged: true }
    events.push('inactive')
  }
  return { state: next, events }
}
