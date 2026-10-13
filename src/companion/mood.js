// Runs the trained mood + situation model in the browser, fully offline.
// Feature extraction mirrors ml/train.py exactly (tests/mood.test.js checks the two agree).
// Retrain with:  python ml/generate_dataset.py && python ml/train.py

let model = null

/** Loads the model once, as its own chunk so the app starts fast. Safe to call repeatedly. */
export async function loadMoodModel() {
  if (!model) model = (await import('./mood-model.json')).default
  return model
}
export const setMoodModel = (m) => { model = m }
export const moodModelLoaded = () => model !== null

export function tokenize(text) {
  return text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9ऀ-ॿ஀-௿]+/g, ' ').split(' ').filter(Boolean)
}

// Filler words are dropped (negations are kept). Mirrors STOP in ml/train.py.
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'am', 'i', 'im', 'ive', 'my', 'me', 'to', 'and', 'of', 'it', 'its', 'in', 'on', 'at', 'for',
  'with', 'that', 'this', 'so', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'just', 'very', 'really', 'keep', 'keeps'])

export function features(text) {
  const words = tokenize(text).filter(w => !STOP.has(w))
  const out = words.map(w => `w:${w}`)
  for (let i = 0; i < words.length - 1; i++) out.push(`b:${words[i]}_${words[i + 1]}`)
  for (const w of words) {
    if (w.length < 4) continue
    const padded = `<${w}>`
    for (let i = 0; i < padded.length - 2; i++) out.push(`c:${padded.slice(i, i + 3)}`)
  }
  return out
}

/** TF-IDF vector as sparse [index, value] pairs, L2-normalised (same as training). */
function vectorize(text, m) {
  const counts = new Map()
  for (const f of features(text)) {
    const idx = m.vocab[f]
    if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1)
  }
  const entries = [...counts].map(([idx, c]) => [idx, (1 + Math.log(c)) * m.idf[idx]])
  const norm = Math.sqrt(entries.reduce((s, [, v]) => s + v * v, 0)) || 1
  return entries.map(([idx, v]) => [idx, v / norm])
}

function softmax(scores) {
  const max = Math.max(...scores)
  const exps = scores.map(s => Math.exp(s - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sum)
}

const headProbs = (head, vec) => softmax(head.coef.map((row, c) => head.intercept[c] + vec.reduce((s, [i, v]) => s + row[i] * v, 0)))
const best = (probs, labels) => { const i = probs.indexOf(Math.max(...probs)); return { label: labels[i], prob: probs[i] } }

/**
 * Predicts mood and situation severity for a sentence.
 * Returns null if the model is not loaded or the sentence has no known words.
 */
export function predictMood(text, m = model) {
  if (!m) return null
  const vec = vectorize(text, m)
  if (!vec.length) return null
  const moodProbs = headProbs(m.mood, vec)
  const severityProbs = headProbs(m.severity, vec)
  const mood = best(moodProbs, m.moods)
  const severity = best(severityProbs, m.severities)
  return {
    mood: mood.label, moodProb: mood.prob, moodProbs,
    severity: severity.label, severityProb: severity.prob, severityProbs,
    severityLevel: ['none', 'watch', 'urgent', 'critical'].indexOf(severity.label),
    seriousProb: ['urgent', 'critical'].reduce((s, l) => s + severityProbs[m.severities.indexOf(l)], 0),
  }
}
