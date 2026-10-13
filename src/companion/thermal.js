// Thermal camera analysis. Pure functions: a frame is { width, height, temps: number[] } in °C
// (row-major), e.g. an MLX90640 (32x24) or a FLIR Lepton behind a small HTTP gateway.
// Thermal frames hold no faces or identifiable imagery, which is why this sensor can stay on.
// Fever flags are screening hints only, not a diagnosis.

export const THERMAL_CONFIG = {
  bodyMin: 28,            // °C range of exposed skin / clothing surface
  bodyMax: 42,
  feverC: 37.8,           // hottest skin region (mean of top pixels)
  heatHazardC: 55,        // anything this hot is not a person
  minBodyPixels: 6,
  lyingRatio: 1.5,        // bounding box width / height at or above this means lying down
  pixelDeltaC: 0.6,       // a pixel only counts as changed above this °C jump (ignores sensor noise)
  motionMin: 0.004,       // fraction of changed pixels counted as movement
  feverFrames: 3,         // consecutive frames before reporting fever
  stillAfterDropMs: 8000, // lying and still after an upright → lying drop
  inactivityMs: 120000,
}

/** Per-frame measurements. `prev` is the previous frame (or null). */
export function analyzeThermalFrame(frame, prev, cfg = THERMAL_CONFIG) {
  const { width, height, temps } = frame
  let count = 0
  let minX = width, maxX = -1, minY = height, maxY = -1
  let hazard = false
  const bodyTemps = []
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i]
    if (t >= cfg.heatHazardC) { hazard = true; continue }
    if (t >= cfg.bodyMin && t <= cfg.bodyMax) {
      const x = i % width
      const y = Math.floor(i / width)
      count++
      bodyTemps.push(t)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const presence = count >= cfg.minBodyPixels
  const boxW = presence ? maxX - minX + 1 : 0
  const boxH = presence ? maxY - minY + 1 : 0
  const posture = !presence ? 'none' : boxW / boxH >= cfg.lyingRatio ? 'lying' : 'upright'
  const top = bodyTemps.sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(count * 0.1)))
  const skinTop = top.length ? top.reduce((s, t) => s + t, 0) / top.length : 0
  let motion = 0
  if (prev && prev.temps.length === temps.length) {
    let changed = 0
    for (let i = 0; i < temps.length; i++) if (Math.abs(temps[i] - prev.temps[i]) > cfg.pixelDeltaC) changed++
    motion = changed / temps.length
  }
  return { presence, bodyPixels: count, posture, skinTop: Number(skinTop.toFixed(1)), motion, hazard }
}

export const initialThermalState = (now) => ({
  lastMotionAt: now, prevPosture: null, dropAt: null, fallActive: false,
  feverCount: 0, feverActive: false, heatActive: false, stillActive: false,
})

/** Folds one analysed frame into the tracker. Returns the new state, new anomalies and all active ones. */
export function stepThermal(state, a, now, cfg = THERMAL_CONFIG) {
  let s = { ...state }
  const events = []
  if (a.motion >= cfg.motionMin) s = { ...s, lastMotionAt: now, stillActive: false }

  if (a.presence && s.prevPosture === 'upright' && a.posture === 'lying') s = { ...s, dropAt: now, fallActive: false }
  if (a.posture === 'upright') s = { ...s, dropAt: null, fallActive: false }
  if (s.dropAt !== null && !s.fallActive && a.posture === 'lying' && now - s.lastMotionAt >= cfg.stillAfterDropMs) {
    s = { ...s, fallActive: true }
    events.push('possible-fall')
  }
  if (a.presence) s = { ...s, prevPosture: a.posture }

  const hot = a.presence && a.skinTop >= cfg.feverC
  s = { ...s, feverCount: hot ? s.feverCount + 1 : 0 }
  if (s.feverCount >= cfg.feverFrames && !s.feverActive) { s = { ...s, feverActive: true }; events.push('fever') }
  if (s.feverCount === 0 && s.feverActive) s = { ...s, feverActive: false }

  if (a.hazard && !s.heatActive) { s = { ...s, heatActive: true }; events.push('heat-hazard') }
  if (!a.hazard && s.heatActive) s = { ...s, heatActive: false }

  if (a.presence && !s.stillActive && now - s.lastMotionAt >= cfg.inactivityMs) { s = { ...s, stillActive: true }; events.push('no-motion') }

  const active = []
  if (s.fallActive) active.push('possible-fall')
  if (s.feverActive) active.push('fever')
  if (s.heatActive) active.push('heat-hazard')
  if (s.stillActive) active.push('no-motion')
  return { state: s, events, active }
}

export const SCENARIOS = ['normal', 'fever', 'fall', 'still', 'absent', 'heat']

/**
 * Synthetic 32x24 frame for demos and tests (no hardware needed).
 * `tick` counts frames since the scenario started; `rng` is injectable for deterministic tests.
 */
export function simulateFrame(scenario, tick, rng = Math.random) {
  const width = 32, height = 24
  const temps = new Array(width * height).fill(0).map(() => 22 + rng() * 0.2)
  const blob = (cx, cy, w, h, base, head) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2) temps[y * width + x] = (y <= cy - h / 2 + 2 ? head : base) + rng() * 0.2
    }
  }
  const jitter = rng() < 0.5 ? -1 : 1
  const wobble = Math.sin(tick) * 1.5 // gentle movement so the person is not "still"
  switch (scenario) {
    case 'absent': break
    case 'fever': blob(16 + jitter, 12, 5, 12, 34, 38.6); break
    case 'still': blob(16, 12, 5, 12, 34, 36); break
    case 'heat': blob(16 + jitter, 12, 5, 12, 34, 36); temps[3 * width + 3] = 80; break
    case 'fall':
      if (tick < 3) blob(16 + jitter, 12, 5, 12, 34, 36)
      else blob(16, 18, 14, 4, 34, 35)
      break
    default: blob(16 + wobble, 12 + jitter * 0.5, 5, 12, 34, 36)
  }
  return { width, height, temps }
}
