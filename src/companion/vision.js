// Gemma 3 camera check. While the normal camera is on (because the voice, the words or the thermal sensor raised a
// concern), one frame at a time goes to Gemma 3 (the 4B model sees images) running on THIS computer through Ollama.
// It answers a small fixed form: is a person visible, their posture, any visible distress. The picture is kept in
// memory only for that one request, then dropped; only the one-line text summary is kept.
//
// A single picture from a small model can be wrong (it cannot see movement, and a bed can look like a floor), so:
//  * nothing counts until two looks in a row agree (trackObservation);
//  * a finding is only ever passed on to the privacy guard, which also needs the camera/thermal evidence to confirm;
//  * the model never identifies anyone, and its opinion can only RAISE concern.

export const VISION_DEFAULTS = { enabled: true, intervalSec: 10 }
export const VISION_TIMEOUT_MS = 120000 // first request loads the model, about 20 s on a laptop; later ones take about 7 s
const KEEP_LOADED = '30m'
const MAX_SUMMARY = 160

export const POSTURES = ['standing', 'sitting', 'lying_in_bed', 'on_floor', 'slumped', 'unclear']
export const DISTRESS = ['none', 'possible', 'likely']

const OBSERVATION_SCHEMA = {
  type: 'object',
  properties: {
    personVisible: { type: 'boolean' },
    posture: { type: 'string', enum: POSTURES },
    distress: { type: 'string', enum: DISTRESS },
    needsHelp: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['personVisible', 'posture', 'distress', 'needsHelp', 'summary'],
}

const SYSTEM_PROMPT = [
  'You are the safety eyes of a hospital-room assistant. You are shown ONE picture from a room camera.',
  'Never identify anyone and never guess a name, age, gender or ethnicity. Describe only what is visible.',
  'Answer ONLY with JSON: {"personVisible": boolean, "posture": one of standing|sitting|lying_in_bed|on_floor|slumped|unclear, "distress": one of none|possible|likely, "needsHelp": boolean, "summary": one short sentence}.',
  'posture: on_floor = lying or crumpled on the FLOOR (not on a bed or sofa); slumped = slumped over in a chair or seat; lying_in_bed = lying on a bed.',
  'distress: likely = clutching chest or head, doubled over, grimacing in pain or reaching out for help; possible = unsure signs; none = calm or no sign.',
  'A single picture cannot show movement, so never say someone is not moving. If the picture is dark, blurry or unclear, answer unclear and none. Be cautious, not dramatic.',
].join('\n')

/** Parses the model output into a clean observation, or null if it is unusable. */
export function parseObservation(content) {
  if (typeof content !== 'string') return null
  let data = null
  try { data = JSON.parse(content) } catch {
    const match = content.match(/\{[\s\S]*\}/) // models sometimes wrap JSON in prose or code fences
    if (match) { try { data = JSON.parse(match[0]) } catch { data = null } }
  }
  if (!data || typeof data.personVisible !== 'boolean') return null
  return {
    personVisible: data.personVisible,
    posture: POSTURES.includes(data.posture) ? data.posture : 'unclear',
    distress: DISTRESS.includes(data.distress) ? data.distress : 'none',
    needsHelp: data.needsHelp === true,
    summary: String(data.summary || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY),
  }
}

/** What one observation suggests: none | watch | urgent, and why. Conservative on purpose. */
export function visionLevel(obs) {
  if (!obs || !obs.personVisible) return { level: 'none', kind: null }
  if (obs.posture === 'on_floor') return { level: 'urgent', kind: 'possible-fall' }
  if (obs.distress === 'likely' || obs.needsHelp) return { level: 'urgent', kind: 'visual-distress' }
  if (obs.posture === 'slumped' || obs.distress === 'possible') return { level: 'watch', kind: 'visual-distress' }
  return { level: 'none', kind: null }
}

const WINDOW = 3

/**
 * Keeps the last few looks. Returns the new history and an event ('possible-fall' | 'visual-distress') only when at
 * least two of the last three looks, including this one, agree on an urgent finding of the same kind.
 */
export function trackObservation(history, obs) {
  const verdict = visionLevel(obs)
  const next = [...history, verdict].slice(-WINDOW)
  const agreeing = (kind) => next.filter((v) => v.level === 'urgent' && v.kind === kind).length >= 2
  const event = verdict.level === 'urgent' && agreeing(verdict.kind) ? verdict.kind : null
  return { history: next, event }
}

/** Plain words for the chat log. */
export function describeObservation(obs) {
  if (!obs) return ''
  if (!obs.personVisible) return 'Camera check: nobody is in view.'
  return `Camera check (Gemma 3): ${obs.summary || `a person, ${obs.posture.replace('_', ' ')}`}${obs.distress === 'likely' ? ' They look to be in distress.' : ''}`
}

/** Bytes to base64 without blowing the call stack on large pictures. */
export function toBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const trimSlash = (url) => url.replace(/\/+$/, '')

/**
 * Asks Gemma 3 to look at one picture. `frame` is a Blob (JPEG) or a Uint8Array. `context` is a short sentence of what
 * the other sensors noticed (voice, thermal), which helps it judge. Resolves { ok: true, observation } or { ok: false, error }.
 */
export async function describeScene(settings, frame, context = '', fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)
  try {
    const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(await frame.arrayBuffer())
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        format: OBSERVATION_SCHEMA,
        keep_alive: KEEP_LOADED,
        options: { temperature: 0.1, num_predict: 160 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${context ? `Other sensors noticed: ${context}. ` : ''}Describe this picture for patient safety.`, images: [toBase64(bytes)] },
        ],
      }),
    })
    if (!res.ok) return { ok: false, error: `Gemma answered ${res.status}` }
    const observation = parseObservation((await res.json())?.message?.content)
    return observation ? { ok: true, observation } : { ok: false, error: 'Gemma gave an unusable answer' }
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Gemma took too long' : 'Could not reach Gemma' }
  } finally {
    clearTimeout(timer)
  }
}
