// Voice wellness analysis. Pure DSP, no browser APIs, so it can be tested with synthetic audio.
//
// It measures how a voice *sounds* (loudness, pitch, shakiness, pauses, speaking rate) and compares it with
// the same person's usual baseline. It flags "this voice sounds different/unwell"; it does NOT diagnose, and it
// is not speaker identification. Slurred speech or breathlessness are only approximated through pauses and
// rate, so keyword and model checks stay in place alongside it.

const ANALYSIS_RATE = 16000
const FRAME_SEC = 0.04
const HOP_SEC = 0.02
const MIN_F0 = 70
const MAX_F0 = 400
const SILENCE_RMS = 0.008
const VOICED_CORRELATION = 0.4
export const MIN_SPEECH_SEC = 1.0

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Average-decimates to ~16 kHz so the pitch search stays cheap. */
function downsample(samples, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE))
  if (factor === 1) return { data: samples, rate: sampleRate }
  const out = new Float32Array(Math.floor(samples.length / factor))
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    for (let j = 0; j < factor; j++) sum += samples[i * factor + j]
    out[i] = sum / factor
  }
  return { data: out, rate: sampleRate / factor }
}

/** Pitch of one frame by normalised autocorrelation, or null if the frame is unvoiced. */
function framePitch(frame, rate) {
  let energy = 0
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i]
  if (energy === 0) return null
  const minLag = Math.floor(rate / MAX_F0)
  const maxLag = Math.min(Math.floor(rate / MIN_F0), frame.length - 1)
  let best = 0
  let bestLag = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < frame.length; i++) sum += frame[i] * frame[i + lag]
    const r = sum / energy
    if (r > best) { best = r; bestLag = lag }
  }
  return best >= VOICED_CORRELATION ? rate / bestLag : null
}

/**
 * Features of one utterance. `samples` is mono Float32 in [-1, 1].
 * Returns null if there is too little audio to judge.
 */
export function analyzeAudio(samples, sampleRate) {
  const { data, rate } = downsample(samples, sampleRate)
  const frameLen = Math.round(rate * FRAME_SEC)
  const hop = Math.round(rate * HOP_SEC)
  const frames = []
  for (let start = 0; start + frameLen <= data.length; start += hop) {
    const frame = data.subarray(start, start + frameLen)
    let sq = 0
    for (let i = 0; i < frame.length; i++) sq += frame[i] * frame[i]
    const rms = Math.sqrt(sq / frame.length)
    frames.push({ rms, f0: rms >= SILENCE_RMS ? framePitch(frame, rate) : null, loud: rms >= SILENCE_RMS })
  }
  const first = frames.findIndex(f => f.loud)
  const last = frames.length - 1 - [...frames].reverse().findIndex(f => f.loud)
  if (first < 0) return null
  const span = frames.slice(first, last + 1) // trims leading and trailing silence
  const durationSec = span.length * HOP_SEC
  const voiced = span.filter(f => f.f0)
  if (durationSec < MIN_SPEECH_SEC || voiced.length < 10) return null

  const f0s = voiced.map(f => f.f0)
  const f0Mean = mean(f0s)
  const f0Std = Math.sqrt(mean(f0s.map(v => (v - f0Mean) ** 2)))
  let jump = 0
  for (let i = 1; i < f0s.length; i++) jump += Math.abs(f0s[i] - f0s[i - 1])
  return {
    durationSec,
    rms: mean(span.filter(f => f.loud).map(f => f.rms)),
    f0Mean,
    f0Cv: f0Std / f0Mean,
    jitter: jump / (f0s.length - 1) / f0Mean,
    voicedRatio: voiced.length / span.length,
    pauseRatio: span.filter(f => !f.loud).length / span.length,
  }
}

const FALLBACK = { rms: 0.02, pauseRatio: 0.3, rate: 2.2, f0Mean: null, jitter: 0.03, f0Cv: 0.15 }

/**
 * Compares an utterance with the person's usual voice.
 * `words` is the transcript word count (for speaking rate). Returns { status, score, reasons }.
 * status: unknown | normal | unusual | concerning
 */
export function assessVoice(features, baseline, words = 0) {
  if (!features) return { status: 'unknown', score: 0, reasons: [] }
  const base = baseline && baseline.n >= 1 ? baseline : FALLBACK
  const reasons = []
  let score = 0
  const add = (points, reason) => { score += points; reasons.push(reason) }

  const speakingSec = features.durationSec * (1 - features.pauseRatio)
  const rate = words > 0 && speakingSec > 0 ? words / speakingSec : null

  if (features.rms < base.rms * 0.4) add(2, 'a very weak, quiet voice')
  else if (features.rms < base.rms * 0.6) add(1, 'a quieter voice than usual')
  if (features.jitter > Math.max(0.07, base.jitter * 2.2)) add(2, 'a shaky, unsteady voice')
  if (features.pauseRatio > Math.max(0.5, base.pauseRatio + 0.25)) add(1, 'long pauses between words')
  if (rate !== null && base.rate && rate < base.rate * 0.55) add(1, 'slow, halting speech')
  if (base.f0Mean && features.f0Mean > base.f0Mean * 1.3) add(1, 'a strained, higher-pitched voice')
  if (base.f0Mean && features.f0Mean < base.f0Mean * 0.75) add(1, 'a flat, lower voice')
  if (rate !== null && base.rate && rate > base.rate * 1.8 && base.f0Mean && features.f0Mean > base.f0Mean * 1.15) add(1, 'fast, tense speech')

  return { status: score >= 3 ? 'concerning' : score >= 2 ? 'unusual' : 'normal', score, reasons, rate }
}

/** Running baseline of how this person normally sounds (exponential moving average). */
export function updateBaseline(baseline, features, rate, alpha = 0.2) {
  if (!features) return baseline
  const sample = { f0Mean: features.f0Mean, f0Cv: features.f0Cv, jitter: features.jitter, rms: features.rms, pauseRatio: features.pauseRatio, rate: rate || FALLBACK.rate }
  if (!baseline || !baseline.n) return { ...sample, n: 1 }
  const blend = (key) => baseline[key] * (1 - alpha) + sample[key] * alpha
  return { f0Mean: blend('f0Mean'), f0Cv: blend('f0Cv'), jitter: blend('jitter'), rms: blend('rms'), pauseRatio: blend('pauseRatio'), rate: blend('rate'), n: baseline.n + 1 }
}
