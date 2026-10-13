// Route analysis for ClinicCompass, in two layers:
//   1. routeFacts / compareRoutes: exact numbers computed here from the floor plan (no AI, cannot be wrong).
//   2. askOpenRouter: an LLM (via https://openrouter.ai) turns those facts into plain-language directions in the
//      patient's language, with accessibility tips and cautions. It cannot change the route, its answer is
//      checked against the real room names, and only the floor plan and the route are sent (no personal data).
//
// The OpenRouter key is never in this code or in the browser: the dev server adds it (see vite.config.js).

export const MAP_AI_DEFAULTS = { enabled: false, model: 'google/gemma-3-27b-it:free', endpoint: '/openrouter', language: 'en' }
export const MAP_AI_TIMEOUT_MS = 45000
export const LANGUAGE_PROMPT = { en: 'English', hi: 'Hindi (Devanagari script)', ta: 'Tamil (Tamil script)' }
const MINUTES_PER_STEP = 2 // same estimate the ClinicCompass page shows

const trimSlash = (url) => url.replace(/\/+$/, '')

// ------------------------------------------------------------------ exact route facts

/** Cheapest route by edge weight; with `accessibleOnly` the inaccessible edges (stairs) are skipped. [] if unreachable. */
export function routeBetween(plan, start, end, accessibleOnly) {
  const dist = {}
  const prev = {}
  const unseen = new Set(Object.keys(plan.nodes))
  unseen.forEach(n => { dist[n] = Infinity })
  if (!(start in dist) || !(end in dist)) return []
  dist[start] = 0
  while (unseen.size) {
    const u = [...unseen].sort((a, b) => dist[a] - dist[b])[0]
    unseen.delete(u)
    if (u === end || dist[u] === Infinity) break
    for (const [a, b, w, ok] of plan.edges) {
      if (accessibleOnly && !ok) continue
      const v = a === u ? b : b === u ? a : null
      if (!v || !unseen.has(v)) continue
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u }
    }
  }
  const path = []
  for (let n = end; n; n = prev[n]) { path.unshift(n); if (n === start) break }
  return path[0] === start ? path : []
}

const findEdge = (plan, a, b) => plan.edges.find(([x, y]) => (x === a && y === b) || (x === b && y === a))

/** Leg-by-leg facts for a route that is already known. */
export function routeFacts(plan, path) {
  const legs = path.slice(1).map((to, i) => {
    const from = path[i]
    const edge = findEdge(plan, from, to)
    const f = plan.nodes[from]
    const t = plan.nodes[to]
    return {
      from, to, weight: edge ? edge[2] : 1, accessible: edge ? Boolean(edge[3]) : true,
      fromFloor: f.floor, toFloor: t.floor, floorChange: f.floor !== t.floor,
      via: t.type === 'lift' || f.type === 'lift' ? 'lift' : t.type === 'stairs' || f.type === 'stairs' ? 'stairs' : 'corridor',
    }
  })
  const steps = legs.length
  return {
    path, legs, steps,
    minutes: steps * MINUTES_PER_STEP,
    floorsChanged: legs.filter(l => l.floorChange).length,
    floorsVisited: [...new Set(path.map(n => plan.nodes[n].floor))],
    liftLegs: legs.filter(l => l.via === 'lift').length,
    stairLegs: legs.filter(l => l.via === 'stairs' || !l.accessible).length,
  }
}

/** The wheelchair-friendly route next to the fastest route, so the cost of avoiding stairs is visible. */
export function compareRoutes(plan, start, end) {
  const accessible = routeBetween(plan, start, end, true)
  const fastest = routeBetween(plan, start, end, false)
  const a = accessible.length ? routeFacts(plan, accessible) : null
  const f = fastest.length ? routeFacts(plan, fastest) : null
  return {
    accessible: a, fastest: f,
    sameRoute: Boolean(a && f && a.path.join('>') === f.path.join('>')),
    extraMinutes: a && f ? Math.max(0, a.minutes - f.minutes) : 0,
  }
}

// ------------------------------------------------------------------ OpenRouter request / response

export function buildMapMessages({ plan, facts, accessible, language = 'en', comparison = null }) {
  const system = [
    'You are a calm, clear hospital wayfinding assistant for patients and visitors.',
    `Write in ${LANGUAGE_PROMPT[language] || LANGUAGE_PROMPT.en}, in short, simple sentences.`,
    'Use ONLY the room names, floors and legs given in the data. Never invent rooms, turns, distances, signs or staff.',
    accessible ? 'The patient needs a wheelchair-friendly route: do not suggest stairs.' : 'Mention stairs or lifts when the route uses them.',
    'Answer ONLY with JSON: {"summary": one sentence, "directions": array with one short instruction per leg in order, "accessibility": one or two sentences on how easy the route is, "cautions": array of up to 3 short things to watch for, "tips": array of up to 3 practical tips}.',
    'Do not give medical advice. End the tips with a reminder to confirm directions with hospital staff.',
  ].join('\n')
  const data = {
    hospital: plan.name,
    from: facts.path[0], to: facts.path[facts.path.length - 1],
    wheelchairFriendlyRoute: accessible,
    legs: facts.legs.map(l => ({ from: l.from, to: l.to, via: l.via, floorChange: l.floorChange ? `${l.fromFloor} to ${l.toFloor}` : null, wheelchairFriendly: l.accessible })),
    estimatedMinutes: facts.minutes, floorsChanged: facts.floorsChanged,
    fastestRouteAlternative: comparison && !comparison.sameRoute && comparison.fastest ? { minutes: comparison.fastest.minutes, usesStairs: comparison.fastest.stairLegs > 0 } : null,
  }
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(data) }]
}

// Hindi / Tamil answers translate room names, so they cannot be matched against the English names.
const isIndicScript = (text) => /[ऀ-ॿ஀-௿]/.test(text)

const asStringList = (value, max) => (Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 300)).slice(0, max) : [])

/**
 * Parses and checks the model's JSON. Returns null if unusable. `grounded` is false when the answer barely
 * mentions the real rooms on the route (a sign it may be making things up), so the UI can warn.
 */
export function parseMapAnalysis(content, facts) {
  if (typeof content !== 'string') return null
  let data = null
  try { data = JSON.parse(content) } catch {
    const match = content.match(/\{[\s\S]*\}/) // models sometimes wrap JSON in prose or code fences
    if (match) { try { data = JSON.parse(match[0]) } catch { data = null } }
  }
  if (!data || typeof data.summary !== 'string') return null
  const directions = asStringList(data.directions, 20)
  if (!directions.length) return null
  const text = [data.summary, ...directions].join(' ').toLowerCase()
  const named = facts.path.filter(room => text.includes(room.toLowerCase())).length
  return {
    summary: data.summary.trim().slice(0, 400),
    directions,
    accessibility: typeof data.accessibility === 'string' ? data.accessibility.trim().slice(0, 500) : '',
    cautions: asStringList(data.cautions, 3),
    tips: asStringList(data.tips, 3),
    grounded: named >= Math.ceil(facts.path.length / 2) || isIndicScript(text),
  }
}

const ERROR_TEXT = {
  'no-key': 'No OpenRouter key is set on the server. Add OPENROUTER_API_KEY to .env.local and restart the dev server.',
  auth: 'OpenRouter rejected the key. Check OPENROUTER_API_KEY.',
  credits: 'This OpenRouter account has no credit for that model. Try a :free model or add credit.',
  rate: 'OpenRouter is rate-limiting this model (free models have low limits). Wait a minute or pick another model.',
  unavailable: 'OpenRouter could not be reached or the model is unavailable right now.',
  'bad-output': 'The model answered, but not in a usable format. Try again or choose another model.',
}

/** Asks OpenRouter for the explanation. Resolves { ok: true, analysis } or { ok: false, error, message }. */
export async function askOpenRouter(settings, input, facts, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAP_AI_TIMEOUT_MS)
  const fail = (error) => ({ ok: false, error, message: ERROR_TEXT[error] })
  try {
    const res = await fetchImpl(`${trimSlash(settings.endpoint)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        messages: buildMapMessages(input),
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 700,
      }),
    })
    if (res.status === 503) return fail('no-key')
    if (res.status === 401 || res.status === 403) return fail('auth')
    if (res.status === 402) return fail('credits')
    if (res.status === 429) return fail('rate')
    if (!res.ok) return fail('unavailable')
    const body = await res.json()
    const analysis = parseMapAnalysis(body?.choices?.[0]?.message?.content, facts)
    return analysis ? { ok: true, analysis } : fail('bad-output')
  } catch {
    return fail('unavailable')
  } finally {
    clearTimeout(timer)
  }
}

/** Is a key configured on the server, and is the chosen model listed? Used by the status line. */
export async function checkOpenRouter(settings, fetchImpl = fetch) {
  try {
    const status = await fetchImpl(`${trimSlash(settings.endpoint)}/status`)
    if (!status.ok) return { ok: false, hasKey: false }
    const { hasKey } = await status.json()
    return { ok: true, hasKey: Boolean(hasKey) }
  } catch {
    return { ok: false, hasKey: false }
  }
}
