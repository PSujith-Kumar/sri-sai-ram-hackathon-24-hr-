// Gemma 3 client, talking to a local Ollama server (https://ollama.com): `ollama pull gemma3:4b`.
//
// Gemma writes the open-ended conversation (in the patient's language) and gives a second opinion on mood
// and severity. Safety decisions never depend on it: urgent and critical situations use fixed, tested
// templates (brain.js), and Gemma's opinion can only RAISE concern, never lower it. If Gemma is off,
// slow or unreachable, the companion carries on with its built-in replies.
//
// Privacy: with a local endpoint the patient's words never leave this computer. If the endpoint points
// elsewhere, they do, so the UI warns about it (isLocalEndpoint).

export const LLM_DEFAULTS = { enabled: false, endpoint: '/ollama', model: 'gemma3:4b' }
export const LLM_TIMEOUT_MS = 25000
const MAX_REPLY_CHARS = 700
const HISTORY_TURNS = 6

export const MOODS = ['happy', 'neutral', 'low', 'anxious', 'tired', 'angry', 'distressed']
export const SEVERITIES = ['none', 'watch', 'urgent', 'critical']

// Ollama constrains the output to this JSON shape.
const RESULT_SCHEMA = {
  type: 'object',
  properties: { mood: { type: 'string', enum: MOODS }, severity: { type: 'string', enum: SEVERITIES }, reply: { type: 'string' } },
  required: ['mood', 'severity', 'reply'],
}

/** True when the endpoint is on this machine (the dev-server proxy or localhost). */
export const isLocalEndpoint = (endpoint = '') => endpoint.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(endpoint)

const trimSlash = (url) => url.replace(/\/+$/, '')

export function buildSystemPrompt({ companion = 'Asha', name = 'the patient', age = null, conditions = [], allergies = [], medicines = [] } = {}) {
  const facts = [
    age ? `age ${age}` : null,
    conditions.length ? `conditions: ${conditions.join(', ')}` : null,
    allergies.length ? `allergies: ${allergies.join(', ')}` : null,
    medicines.length ? `medicines: ${medicines.join(', ')}` : null,
  ].filter(Boolean).join('; ')
  return [
    `You are ${companion}, a warm, gentle companion for ${name}, a hospital patient${facts ? ` (${facts})` : ''}.`,
    'Talk like a caring friend: 1 to 3 short sentences, simple words, kind and calm. Ask at most one gentle question.',
    'Reply in the SAME language the patient used: English, Hindi (Devanagari) or Tamil (Tamil script). If they wrote in romanised Hindi or Tamil, reply in that language\'s script.',
    'Never diagnose, never suggest medicine doses or changes, and never contradict the care team. You are not a doctor.',
    'If the patient mentions pain, trouble breathing, a fall, bleeding, fainting, confusion, a stroke sign or thoughts of self-harm, stay calm, say you are alerting their family and doctor, and ask one short question about how they feel.',
    'Also judge the patient\'s state. Answer ONLY with JSON: {"mood": one of happy|neutral|low|anxious|tired|angry|distressed, "severity": one of none|watch|urgent|critical, "reply": your reply}.',
    'severity: none = ordinary talk; watch = mild discomfort or low mood worth a gentle check; urgent = real pain, a fall or panic; critical = chest pain, cannot breathe, fainting, stroke signs, heavy bleeding or self-harm.',
  ].join('\n')
}

/** Conversation so far (last few turns) plus the new sentence, in Ollama's chat format. */
export function buildMessages({ system, history = [], text, hint = '' }) {
  const turns = history.filter(m => m.role === 'ai' || m.role === 'patient').slice(-HISTORY_TURNS)
    .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
  return [
    { role: 'system', content: system },
    ...turns,
    { role: 'user', content: hint ? `${text}\n\n[Note from the safety system, not from the patient: ${hint}]` : text },
  ]
}

/** Parses the model output into { mood, severity, reply }, or null if it is unusable. */
export function parseLlmResult(content) {
  if (typeof content !== 'string') return null
  let data = null
  try { data = JSON.parse(content) } catch {
    const match = content.match(/\{[\s\S]*\}/) // models sometimes wrap JSON in prose or code fences
    if (match) { try { data = JSON.parse(match[0]) } catch { data = null } }
  }
  if (!data || typeof data.reply !== 'string') return null
  const reply = data.reply.replace(/\s+/g, ' ').trim().slice(0, MAX_REPLY_CHARS)
  if (!reply) return null
  return {
    reply,
    mood: MOODS.includes(data.mood) ? data.mood : null,
    severity: SEVERITIES.includes(data.severity) ? data.severity : 'none',
  }
}

/**
 * Asks Gemma to reply and assess. Resolves { mood, severity, reply } or null on any failure
 * (not running, model missing, timeout, unusable output): the caller then uses its built-in reply.
 */
export async function askGemma(settings, input, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        format: RESULT_SCHEMA,
        options: { temperature: 0.6, num_predict: 260 },
        messages: buildMessages(input),
      }),
    })
    if (!res.ok) return null
    const body = await res.json()
    return parseLlmResult(body?.message?.content)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Is the server reachable, and is the model pulled? Used by the "Test connection" button. */
export async function checkGemma(settings, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/api/tags`)
    // 502/503/504 come from the dev-server proxy when Ollama itself is not running
    if (res.status >= 502 && res.status <= 504) return { ok: false, error: 'Could not reach Ollama. Is it installed and running?' }
    if (!res.ok) return { ok: false, error: `The server answered ${res.status}.` }
    const body = await res.json()
    const models = (body.models || []).map(m => m.name)
    const family = settings.model.split(':')[0]
    return { ok: true, models, hasModel: models.some(n => n === settings.model || (!settings.model.includes(':') && n.startsWith(`${family}:`))) }
  } catch {
    return { ok: false, error: 'Could not reach Ollama. Is it installed and running?' }
  }
}
