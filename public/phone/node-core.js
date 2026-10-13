// Logic for the phone page (public/phone/index.html), with no DOM so the tests can run it.
// A "thermal" phone sends a small grid of temperatures (default 32x24) to the CareBridge app. Two ways to make it:
//
//  * thermal-camera feed: a camera the browser can open that shows a thermal picture (false colours or white/black-hot).
//    Each pixel colour is turned back into a temperature between the range the camera app displays. This is an
//    APPROXIMATION from picture colours, not a radiometric reading.
//  * silhouette: ANY ordinary phone camera. Only "something moved into the picture" is kept, drawn as a warm blob in a
//    cold room. There are no temperatures (so no fever flag) and no faces: only a coarse shape leaves the phone.

export const GRID = { cols: 32, rows: 24 }

const IRONBOW_STOPS = [[0, 0, 0, 0], [0.15, 32, 0, 100], [0.3, 130, 0, 130], [0.45, 210, 30, 80], [0.6, 245, 90, 20], [0.75, 252, 170, 30], [0.9, 255, 235, 90], [1, 255, 255, 255]]
const TABLE_SIZE = 64

/** Ironbow false-colour palette as 64 [r, g, b] steps from cold to hot. */
export const IRONBOW = Array.from({ length: TABLE_SIZE }, (_, i) => {
  const f = i / (TABLE_SIZE - 1)
  const hi = IRONBOW_STOPS.findIndex(([stop]) => stop >= f)
  const [f0, r0, g0, b0] = IRONBOW_STOPS[Math.max(0, hi - 1)]
  const [f1, r1, g1, b1] = IRONBOW_STOPS[Math.max(1, hi)]
  const k = f1 === f0 ? 0 : (f - f0) / (f1 - f0)
  return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k]
})

export const PALETTES = ['whitehot', 'blackhot', 'ironbow']

/** 0 (coldest) .. 1 (hottest) for one pixel under the chosen palette. */
export function heatFraction(r, g, b, palette) {
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (palette === 'blackhot') return 1 - luma
  if (palette !== 'ironbow') return luma
  let best = 0, bestDistance = Infinity
  for (let i = 0; i < TABLE_SIZE; i++) {
    const [tr, tg, tb] = IRONBOW[i]
    const d = (tr - r) ** 2 + (tg - g) ** 2 + (tb - b) ** 2
    if (d < bestDistance) { bestDistance = d; best = i }
  }
  return best / (TABLE_SIZE - 1)
}

/** Average of each source block, so any picture size becomes cols x rows cells. `value(i)` reads pixel i. */
function blockAverage(width, height, cols, rows, value) {
  const out = new Array(cols * rows)
  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor((cy * height) / rows), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / rows))
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * width) / cols), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cols))
      let sum = 0, count = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += value(y * width + x); count++ }
      out[cy * cols + cx] = sum / count
    }
  }
  return out
}

const round1 = (n) => Math.round(n * 10) / 10

/** image = { data: RGBA bytes, width, height }. Returns { width, height, temps } in degrees C. */
export function toThermalGrid(image, { palette = 'whitehot', minC = 20, maxC = 40, cols = GRID.cols, rows = GRID.rows } = {}) {
  const { data, width, height } = image
  const fractions = blockAverage(width, height, cols, rows, (i) => heatFraction(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], palette))
  return { width: cols, height: rows, temps: fractions.map((f) => round1(minC + Math.min(1, Math.max(0, f)) * (maxC - minC))) }
}

/**
 * Turns an ordinary camera picture into a coarse warm-body-on-cold-room grid by learning what the empty room looks
 * like and keeping only what changed. Start it with the room empty, or have the person move once.
 */
export class SilhouetteSensor {
  constructor({ cols = GRID.cols, rows = GRID.rows, roomC = 22, bodyC = 34, headC = 36, threshold = 26, learn = 0.04, warmup = 6, resetShare = 0.6 } = {}) {
    Object.assign(this, { cols, rows, roomC, bodyC, headC, threshold, learn, warmup, resetShare })
    this.reset()
  }

  reset() { this.background = null; this.frames = 0 }

  update(image) {
    const { data, width, height } = image
    const gray = blockAverage(width, height, this.cols, this.rows, (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
    if (!this.background) this.background = gray.slice()
    this.frames += 1
    const rate = this.frames <= this.warmup ? 1 / this.frames : this.learn
    const moved = gray.map((g, i) => Math.abs(g - this.background[i]) > this.threshold)
    const share = moved.filter(Boolean).length / moved.length
    if (this.frames > this.warmup && share > this.resetShare) { // light switched or the phone was moved: start again
      this.background = gray.slice(); this.frames = 1
      return this.frame(new Array(gray.length).fill(false))
    }
    gray.forEach((g, i) => { if (this.frames <= this.warmup || !moved[i]) this.background[i] += (g - this.background[i]) * rate })
    return this.frame(this.frames <= this.warmup ? new Array(gray.length).fill(false) : moved)
  }

  frame(moved) {
    const temps = moved.map((m) => (m ? this.bodyC : this.roomC))
    const rowsWithBody = []
    for (let y = 0; y < this.rows; y++) if (moved.slice(y * this.cols, (y + 1) * this.cols).some(Boolean)) rowsWithBody.push(y)
    if (rowsWithBody.length) { // the top of the shape is warmer, like a head, so posture looks natural to the analyser
      const top = rowsWithBody[0], span = rowsWithBody[rowsWithBody.length - 1] - top + 1
      const headRows = Math.max(1, Math.round(span * 0.15))
      for (let y = top; y < top + headRows; y++) for (let x = 0; x < this.cols; x++) if (moved[y * this.cols + x]) temps[y * this.cols + x] = this.headC
    }
    return { width: this.cols, height: this.rows, temps }
  }
}

/** Wait before reconnecting: 0.5 s, 1 s, 2 s ... at most 15 s. `jitter` is 0..1 (injectable for tests). */
export const backoffMs = (attempt, jitter = Math.random()) => Math.round(Math.min(15000, 500 * 2 ** attempt) * (0.8 + 0.4 * jitter))

/** Reads #role=thermal&t=TOKEN (or ?role=..) from the page address. Returns null when it is not a valid pairing link. */
export function parseLink(hashOrSearch) {
  const params = new URLSearchParams(String(hashOrSearch || '').replace(/^[#?]/, ''))
  const role = params.get('role'), token = params.get('t')
  return ['thermal', 'normal'].includes(role) && /^[0-9a-f]{32}$/.test(token || '') ? { role, token } : null
}

/**
 * A synthetic grid for checking the link without hardware: someone standing, then lying down. (A small copy of
 * the app's simulator, because this page is served on its own, outside the app bundle.)
 */
export function testFrame(scenario, tick) {
  const cols = GRID.cols, rows = GRID.rows
  const temps = new Array(cols * rows).fill(22)
  const blob = (cx, cy, w, h) => { for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2) temps[y * cols + x] = 34 }
  if (scenario === 'fall') (tick % 40 < 10 ? blob(16, 12, 5, 12) : blob(16, 18, 14, 4))
  else if (scenario === 'normal') blob(16 + Math.sin(tick / 2) * 1.5, 12, 5, 12)
  return { width: cols, height: rows, temps }
}
