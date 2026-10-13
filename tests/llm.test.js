import { describe, expect, it, vi } from 'vitest'
import { LEVEL, analyzeUtterance, assessSituation, mergeLlmAnalysis } from '../src/companion/brain'
import { LLM_DEFAULTS, askGemma, buildMessages, buildSystemPrompt, checkGemma, isLocalEndpoint, parseLlmResult } from '../src/companion/llm'

const settings = { ...LLM_DEFAULTS, enabled: true }
const okResponse = (content) => ({ ok: true, status: 200, json: async () => ({ message: { content } }) })
const json = (obj) => JSON.stringify(obj)

describe('isLocalEndpoint', () => {
  it.each([
    ['/ollama', true],
    ['http://localhost:11434', true],
    ['http://127.0.0.1:11434', true],
    ['https://my-gpu-box.example.com', false],
    ['http://192.168.1.50:11434', false],
  ])('%s → %s', (url, expected) => expect(isLocalEndpoint(url)).toBe(expected))
})

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ companion: 'Asha', name: 'Ananya Kumar', age: 22, conditions: ['Hypertension monitoring'], allergies: ['Penicillin'], medicines: ['Atorvastatin'] })

  it('gives the companion its persona and the patient context', () => {
    expect(prompt).toMatch(/You are Asha/)
    expect(prompt).toMatch(/Ananya Kumar/)
    expect(prompt).toMatch(/Hypertension monitoring/)
    expect(prompt).toMatch(/Penicillin/)
    expect(prompt).toMatch(/Atorvastatin/)
  })

  it('demands the patient\'s language, no diagnosis and a JSON answer', () => {
    expect(prompt).toMatch(/SAME language/)
    expect(prompt).toMatch(/Hindi \(Devanagari\) or Tamil/)
    expect(prompt).toMatch(/Never diagnose/)
    expect(prompt).toMatch(/"mood"/)
  })
})

describe('buildMessages', () => {
  const history = [
    { role: 'system', text: 'Camera ready' },
    ...Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'ai' : 'patient', text: `turn ${i}` })),
  ]

  it('keeps only recent conversation turns and drops system notes', () => {
    const msgs = buildMessages({ system: 'S', history, text: 'new sentence' })
    expect(msgs[0]).toEqual({ role: 'system', content: 'S' })
    expect(msgs).toHaveLength(1 + 6 + 1)
    expect(msgs.map(m => m.content)).not.toContain('Camera ready')
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'new sentence' })
  })

  it('maps roles to the chat format and labels the safety-system hint as not from the patient', () => {
    const msgs = buildMessages({ system: 'S', history: [{ role: 'ai', text: 'Hi' }], text: 'I feel dizzy', hint: 'local checks rate this "watch"' })
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'Hi' })
    expect(msgs.at(-1).content).toMatch(/not from the patient/)
  })
})

describe('parseLlmResult', () => {
  it('reads clean JSON', () => {
    expect(parseLlmResult(json({ mood: 'low', severity: 'watch', reply: 'I am here with you.' }))).toEqual({ mood: 'low', severity: 'watch', reply: 'I am here with you.' })
  })

  it('recovers JSON wrapped in prose or code fences', () => {
    const r = parseLlmResult('Sure! Here it is:\n```json\n{"mood":"happy","severity":"none","reply":"Lovely!"}\n```')
    expect(r).toMatchObject({ mood: 'happy', reply: 'Lovely!' })
  })

  it('keeps the reply but drops an invalid mood and defaults severity', () => {
    expect(parseLlmResult(json({ mood: 'ecstatic', severity: 'extreme', reply: 'Hello' }))).toEqual({ mood: null, severity: 'none', reply: 'Hello' })
  })

  it('rejects unusable output', () => {
    expect(parseLlmResult('not json at all')).toBeNull()
    expect(parseLlmResult(json({ mood: 'low' }))).toBeNull()
    expect(parseLlmResult(json({ reply: '   ' }))).toBeNull()
    expect(parseLlmResult(undefined)).toBeNull()
  })

  it('caps very long replies and keeps non-English text intact', () => {
    const long = parseLlmResult(json({ mood: 'neutral', severity: 'none', reply: 'a'.repeat(2000) }))
    expect(long.reply.length).toBeLessThanOrEqual(700)
    expect(parseLlmResult(json({ mood: 'low', severity: 'none', reply: 'मैं यहीं हूँ, आप अकेले नहीं हैं।' })).reply).toBe('मैं यहीं हूँ, आप अकेले नहीं हैं।')
  })
})

describe('askGemma', () => {
  const input = { system: 'S', history: [], text: 'I feel lonely' }

  it('posts to Ollama /api/chat with the model, no streaming and a JSON schema', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(json({ mood: 'low', severity: 'none', reply: 'I am here.' })))
    const result = await askGemma({ ...settings, endpoint: '/ollama/' }, input, fetchImpl)
    expect(result).toMatchObject({ mood: 'low', reply: 'I am here.' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/ollama/api/chat')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ model: 'gemma3:4b', stream: false })
    expect(body.format.required).toEqual(['mood', 'severity', 'reply'])
    expect(body.messages.at(-1).content).toBe('I feel lonely')
  })

  it('returns null when the server is down, errors, or answers badly', async () => {
    expect(await askGemma(settings, input, vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).toBeNull()
    expect(await askGemma(settings, input, vi.fn().mockResolvedValue({ ok: false, status: 502 }))).toBeNull()
    expect(await askGemma(settings, input, vi.fn().mockResolvedValue(okResponse('gibberish')))).toBeNull()
  })
})

describe('checkGemma', () => {
  it('reports a ready model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'gemma3:4b' }, { name: 'llama3:8b' }] }) })
    expect(await checkGemma(settings, fetchImpl)).toEqual({ ok: true, models: ['gemma3:4b', 'llama3:8b'], hasModel: true })
  })

  it('says when the server is up but the model is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'llama3:8b' }] }) })
    expect((await checkGemma(settings, fetchImpl)).hasModel).toBe(false)
  })

  it('explains a proxy 502 as Ollama not running', async () => {
    const r = await checkGemma(settings, vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    expect(r.error).toMatch(/Ollama/)
  })

  it('says when Ollama cannot be reached', async () => {
    const r = await checkGemma(settings, vi.fn().mockRejectedValue(new Error('refused')))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Ollama/)
  })
})

describe('mergeLlmAnalysis: Gemma can only raise concern, within limits', () => {
  const calm = analyzeUtterance('I am just chatting')
  const text = 'I feel strange'

  it('returns the local analysis untouched when Gemma gave nothing', () => {
    expect(mergeLlmAnalysis(calm, null, text)).toBe(calm)
  })

  it('takes Gemma\'s mood reading', () => {
    expect(mergeLlmAnalysis(calm, { mood: 'anxious', severity: 'none', reply: 'x' }, text).mood).toBe('anxious')
  })

  it('may raise to watch freely', () => {
    const r = mergeLlmAnalysis(calm, { mood: 'low', severity: 'watch', reply: 'x' }, 'I just feel flat')
    expect(r.level).toBe(LEVEL.watch)
    expect(r.codes).toContain('GM')
  })

  it('may raise to urgent only when the sentence has a distress cue', () => {
    expect(mergeLlmAnalysis(calm, { mood: 'neutral', severity: 'urgent', reply: 'x' }, 'the weather is nice').level).toBe(LEVEL.none)
    expect(mergeLlmAnalysis(calm, { mood: 'distressed', severity: 'urgent', reply: 'x' }, 'my stomach is hurting badly').level).toBe(LEVEL.urgent)
  })

  it('never goes critical on its own', () => {
    expect(mergeLlmAnalysis(calm, { mood: 'distressed', severity: 'critical', reply: 'x' }, 'terrible pain in my chest area').level).toBe(LEVEL.urgent)
  })

  it('never lowers an alert the local checks already raised', () => {
    const serious = analyzeUtterance('I have chest pain')
    const merged = mergeLlmAnalysis(serious, { mood: 'happy', severity: 'none', reply: 'x' }, 'I have chest pain')
    expect(merged.level).toBe(LEVEL.critical)
  })
})

describe('assessSituation with a Gemma-merged analysis', () => {
  it('adds the Gemma level without removing local findings', () => {
    const r = assessSituation({ utterance: 'my stomach hurts', llm: { level: LEVEL.urgent } })
    expect(r.level).toBe(LEVEL.urgent)
    expect(r.codes).toContain('GM')
    expect(r.actions.alertFamily).toBe(true)
  })

  it('does nothing when Gemma is not involved', () => {
    expect(assessSituation({ utterance: 'hello', llm: null }).level).toBe(LEVEL.none)
  })
})

describe('mood-aware hints for Gemma', () => {
  it('gives guidance for each mood and none for neutral', async () => {
    const { MOOD_GUIDANCE, buildSensingHint } = await import('../src/companion/llm')
    expect(Object.keys(MOOD_GUIDANCE).sort()).toEqual(['angry', 'anxious', 'distressed', 'happy', 'low', 'neutral', 'tired'])
    expect(buildSensingHint({ mood: 'neutral' })).toBe('')
    expect(buildSensingHint({ mood: 'low' })).toMatch(/unhurried/)
    expect(buildSensingHint({ mood: 'anxious' })).toMatch(/reassuring/)
  })
  it('adds what the other checks noticed', async () => {
    const { buildSensingHint } = await import('../src/companion/llm')
    const hint = buildSensingHint({ rating: 'watch', mood: 'tired', voiceReasons: ['a quieter voice than usual'], camera: 'a person sits in a chair', thermal: ['no-motion'] })
    expect(hint).toContain('local checks rate this "watch"')
    expect(hint).toContain('a quieter voice than usual')
    expect(hint).toContain('the room camera shows: a person sits in a chair')
    expect(hint).toContain('the thermal sensor reports: no-motion')
  })
  it('the system prompt tells Gemma to follow the note without revealing it', async () => {
    const { buildSystemPrompt } = await import('../src/companion/llm')
    expect(buildSystemPrompt({})).toMatch(/never mention the note, the sensors or the camera/)
  })
})

describe('what Gemma may promise', () => {
  it('is told it can only talk, remind and alert, not do physical things', async () => {
    const { buildSystemPrompt } = await import('../src/companion/llm')
    expect(buildSystemPrompt({})).toMatch(/Never offer to fetch things or do anything physical/)
  })
})
