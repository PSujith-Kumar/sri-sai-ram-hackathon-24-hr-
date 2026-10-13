import { describe, expect, it, vi } from 'vitest'
import { floorPlans } from '../src/data'
import { FALLBACK_MODELS, MAP_AI_DEFAULTS, askOpenRouter, buildMapMessages, checkOpenRouter, compareRoutes, parseMapAnalysis, routeBetween, routeFacts } from '../src/mapAnalysis'

const plan = floorPlans.h1
const accessiblePath = ['Entrance', 'Reception', 'Lift', 'Diagnostics', 'Cardiology']
const settings = { ...MAP_AI_DEFAULTS, enabled: true }
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const completion = (content) => reply(200, { choices: [{ message: { content } }] })
const good = JSON.stringify({
  summary: 'Go from the Entrance to Cardiology using the lift.',
  directions: ['Walk from the Entrance to Reception.', 'Take the Lift from Reception.', 'Leave the Lift at Diagnostics.', 'Walk on to Cardiology.'],
  accessibility: 'The whole route is step-free.', cautions: ['The lift can be busy.'], tips: ['Confirm directions with hospital staff.'],
})

describe('routeBetween', () => {
  it('finds the wheelchair-friendly route, avoiding stairs', () => {
    expect(routeBetween(plan, 'Entrance', 'Cardiology', true)).toEqual(accessiblePath)
  })

  it('finds the faster route through the stairs when stairs are allowed', () => {
    expect(routeBetween(plan, 'Entrance', 'Cardiology', false)).toEqual(['Entrance', 'Reception', 'Stairs', 'Cardiology'])
  })

  it('returns an empty route for unknown or unreachable places', () => {
    expect(routeBetween(plan, 'Entrance', 'Moon base', true)).toEqual([])
    expect(routeBetween({ nodes: { A: { floor: 'G' }, B: { floor: 'G' } }, edges: [] }, 'A', 'B', false)).toEqual([])
  })
})

describe('routeFacts', () => {
  const facts = routeFacts(plan, accessiblePath)

  it('counts steps, minutes and floors exactly', () => {
    expect(facts).toMatchObject({ steps: 4, minutes: 8, floorsChanged: 2, liftLegs: 2, stairLegs: 0 })
    expect(facts.floorsVisited).toEqual(['G', '1', '2'])
  })

  it('describes every leg', () => {
    expect(facts.legs[2]).toMatchObject({ from: 'Lift', to: 'Diagnostics', via: 'lift', floorChange: true, fromFloor: 'G', toFloor: '1', accessible: true })
  })

  it('counts stairs on the stair route', () => {
    expect(routeFacts(plan, ['Entrance', 'Reception', 'Stairs', 'Cardiology'])).toMatchObject({ steps: 3, minutes: 6, stairLegs: 2 })
  })
})

describe('compareRoutes', () => {
  it('shows what avoiding stairs costs', () => {
    const c = compareRoutes(plan, 'Entrance', 'Cardiology')
    expect(c.sameRoute).toBe(false)
    expect(c.extraMinutes).toBe(2)
    expect(c.accessible.minutes).toBe(8)
    expect(c.fastest.minutes).toBe(6)
  })

  it('knows when both routes are the same', () => {
    expect(compareRoutes(plan, 'Entrance', 'Reception').sameRoute).toBe(true)
  })
})

describe('buildMapMessages', () => {
  const facts = routeFacts(plan, accessiblePath)
  const msgs = buildMapMessages({ plan, facts, accessible: true, language: 'hi', comparison: compareRoutes(plan, 'Entrance', 'Cardiology') })

  it('asks for the right language, a JSON answer and no invented places', () => {
    expect(msgs[0].content).toMatch(/Hindi \(Devanagari script\)/)
    expect(msgs[0].content).toMatch(/Use ONLY the room names/)
    expect(msgs[0].content).toMatch(/do not suggest stairs/)
    expect(msgs[0].content).toMatch(/JSON/)
  })

  it('sends only the plan and the route, nothing personal', () => {
    const data = JSON.parse(msgs[1].content)
    expect(Object.keys(data).sort()).toEqual(['estimatedMinutes', 'fastestRouteAlternative', 'floorsChanged', 'from', 'hospital', 'legs', 'to', 'wheelchairFriendlyRoute'])
    expect(data.legs).toHaveLength(4)
    expect(msgs[1].content).not.toMatch(/Ananya|SMH-|@|password|key/i)
  })
})

describe('parseMapAnalysis', () => {
  const facts = routeFacts(plan, accessiblePath)

  it('reads a good answer and marks it as grounded', () => {
    const a = parseMapAnalysis(good, facts)
    expect(a.directions).toHaveLength(4)
    expect(a.grounded).toBe(true)
    expect(a.tips[0]).toMatch(/staff/)
  })

  it('recovers JSON wrapped in prose or code fences', () => {
    expect(parseMapAnalysis('Here you go:\n```json\n' + good + '\n```', facts).summary).toMatch(/Entrance/)
  })

  it('flags an answer that does not mention the real rooms', () => {
    const vague = JSON.stringify({ summary: 'Head over there.', directions: ['Turn left at the fountain.', 'Take the east wing.'] })
    expect(parseMapAnalysis(vague, facts).grounded).toBe(false)
  })

  it('accepts a Hindi answer, where room names are translated', () => {
    const hindi = JSON.stringify({ summary: 'प्रवेश द्वार से कार्डियोलॉजी तक लिफ्ट लें।', directions: ['रिसेप्शन तक चलें।', 'लिफ्ट लें।'] })
    expect(parseMapAnalysis(hindi, facts).grounded).toBe(true)
  })

  it('finds the answer after a model thinks out loud, even with braces in its reasoning', () => {
    const noisy = 'Let me think {about} the legs: Entrance, Reception... \n' + good + '\nHope that helps!'
    expect(parseMapAnalysis(noisy, facts).directions).toHaveLength(4)
  })

  it('rejects unusable output and trims over-long lists', () => {
    expect(parseMapAnalysis('no json', facts)).toBeNull()
    expect(parseMapAnalysis(JSON.stringify({ summary: 'x' }), facts)).toBeNull()
    expect(parseMapAnalysis(JSON.stringify({ summary: 'x', directions: [] }), facts)).toBeNull()
    const many = JSON.stringify({ summary: 'Entrance', directions: ['Entrance'], cautions: ['a', 'b', 'c', 'd', 'e'] })
    expect(parseMapAnalysis(many, facts).cautions).toHaveLength(3)
  })
})

describe('askOpenRouter', () => {
  const facts = routeFacts(plan, accessiblePath)
  const input = { plan, facts, accessible: true, language: 'en', comparison: null }

  it('posts an OpenAI-style chat request without any key (the server adds it)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion(good))
    const r = await askOpenRouter({ ...settings, endpoint: '/openrouter/' }, input, facts, fetchImpl)
    expect(r.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/openrouter/v1/chat/completions')
    expect(init.headers.Authorization).toBeUndefined()
    const body = JSON.parse(init.body)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.reasoning).toEqual({ effort: 'low' })
    expect(body.model).toBe(MAP_AI_DEFAULTS.model)               // the chosen model is tried first
    expect([MAP_AI_DEFAULTS.model, ...FALLBACK_MODELS].every(m => m.endsWith(':free'))).toBe(true) // the defaults never spend money
    expect(body.messages).toHaveLength(2)
  })

  it.each([
    [503, 'no-key', /OPENROUTER_API_KEY/],
    [401, 'auth', /rejected the key/],
    [402, 'credits', /credit/],
    [429, 'rate', /rate-limiting/],
    [500, 'unavailable', /unavailable/],
  ])('explains HTTP %s in plain words', async (status, code, pattern) => {
    const r = await askOpenRouter(settings, input, facts, vi.fn().mockResolvedValue(reply(status, {})))
    expect(r).toMatchObject({ ok: false, error: code })
    expect(r.message).toMatch(pattern)
  })

  it('moves on to the next model when one is rate-limited or answers badly, and says which one answered', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(429, {}))
      .mockResolvedValueOnce(completion(''))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ model: 'nvidia/nemotron-3-super-120b-a12b:free', choices: [{ message: { content: good } }] }) })
    const r = await askOpenRouter(settings, input, facts, fetchImpl)
    expect(r.ok).toBe(true)
    expect(r.analysis.model).toBe('nvidia/nemotron-3-super-120b-a12b:free')
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).model)).toEqual([MAP_AI_DEFAULTS.model, ...FALLBACK_MODELS])
  })

  it('does not hammer other models when the key itself is the problem', async () => {
    for (const status of [401, 402, 503]) {
      const fetchImpl = vi.fn().mockResolvedValue(reply(status, {}))
      await askOpenRouter(settings, input, facts, fetchImpl)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('reports the last problem when every model fails', async () => {
    const r = await askOpenRouter(settings, input, facts, vi.fn().mockResolvedValue(reply(429, {})))
    expect(r).toMatchObject({ ok: false, error: 'rate' })
  })

  it('reports a network failure and unusable model output without throwing', async () => {
    expect((await askOpenRouter(settings, input, facts, vi.fn().mockRejectedValue(new Error('offline')))).error).toBe('unavailable')
    expect((await askOpenRouter(settings, input, facts, vi.fn().mockResolvedValue(completion('sorry, cannot help')))).error).toBe('bad-output')
  })
})

describe('checkOpenRouter', () => {
  it('reports whether the server holds a key', async () => {
    expect(await checkOpenRouter(settings, vi.fn().mockResolvedValue(reply(200, { hasKey: true })))).toEqual({ ok: true, hasKey: true })
    expect(await checkOpenRouter(settings, vi.fn().mockResolvedValue(reply(200, { hasKey: false })))).toEqual({ ok: true, hasKey: false })
  })

  it('reports an unreachable server', async () => {
    expect(await checkOpenRouter(settings, vi.fn().mockRejectedValue(new Error('x')))).toEqual({ ok: false, hasKey: false })
  })
})
