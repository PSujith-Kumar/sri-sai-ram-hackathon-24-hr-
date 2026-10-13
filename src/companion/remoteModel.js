// Client for the fine-tuned mood + severity model served by `python ml/serve.py`.
// It returns the same shape as predictMood() in mood.js, so the rest of the app does not care which model answered.
// If the service is not running, every call resolves null and the app uses its built-in model instead.

export const CLASSIFIER_DEFAULTS = { enabled: true, endpoint: '/classifier' }
export const CLASSIFIER_TIMEOUT_MS = 4000

const SEVERITY_LEVEL = { none: 0, watch: 1, urgent: 2, critical: 3 }
const trimSlash = (url) => url.replace(/\/+$/, '')

/** Maps the service's JSON onto predictMood()'s shape; null if it is malformed. */
export function toPrediction(body, labels = null) {
  if (!body || typeof body.mood !== 'string' || typeof body.severity !== 'string') return null
  const severities = labels?.severities || ['none', 'watch', 'urgent', 'critical']
  const probs = Array.isArray(body.severityProbs) ? body.severityProbs : []
  const prob = (name) => { const i = severities.indexOf(name); return i >= 0 && probs[i] !== undefined ? probs[i] : 0 }
  if (!(body.severity in SEVERITY_LEVEL)) return null
  return {
    mood: body.mood, moodProb: Number(body.moodProb) || 0, moodProbs: body.moodProbs || [],
    severity: body.severity, severityProb: Number(body.severityProb) || 0, severityProbs: probs,
    severityLevel: SEVERITY_LEVEL[body.severity],
    seriousProb: prob('urgent') + prob('critical'),
    source: 'fine-tuned',
  }
}

/** Classifies one sentence with the fine-tuned model, or resolves null if it is unavailable. */
export async function classifyRemote(text, settings = CLASSIFIER_DEFAULTS, fetchImpl = fetch) {
  if (!settings.enabled || !text?.trim()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/classify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ text }),
    })
    if (!res.ok) return null
    return toPrediction(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Is the service reachable? Used by the status line in the settings card. */
export async function checkClassifier(settings = CLASSIFIER_DEFAULTS, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/health`)
    if (res.status >= 502 && res.status <= 504) return { ok: false }
    if (!res.ok) return { ok: false }
    const body = await res.json()
    return { ok: Boolean(body.ok), model: body.model }
  } catch {
    return { ok: false }
  }
}
