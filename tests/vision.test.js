import { describe, expect, it } from 'vitest'
import { describeObservation, describeScene, parseObservation, toBase64, trackObservation, visionLevel } from '../src/companion/vision'

const obs = (over = {}) => ({ personVisible: true, posture: 'sitting', distress: 'none', needsHelp: false, summary: 'A person sits calmly.', ...over })
const answer = (o) => ({ ok: true, json: async () => ({ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }) })
const settings = { endpoint: '/ollama/', model: 'gemma3:4b' }
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250, 251, 252])

describe('reading the model answer', () => {
  it('accepts a clean answer', () => {
    expect(parseObservation(JSON.stringify(obs()))).toEqual(obs())
  })
  it('finds JSON inside prose or code fences', () => {
    expect(parseObservation('Here you go:\n```json\n' + JSON.stringify(obs({ posture: 'on_floor' })) + '\n```')).toMatchObject({ posture: 'on_floor' })
  })
  it('falls back safely on unknown words and trims the summary', () => {
    const r = parseObservation(JSON.stringify({ personVisible: true, posture: 'flying', distress: 'extreme', needsHelp: 'yes', summary: `  ${'x'.repeat(400)}\n\n` }))
    expect(r).toMatchObject({ posture: 'unclear', distress: 'none', needsHelp: false })
    expect(r.summary.length).toBe(160)
  })
  it('refuses unusable answers', () => {
    expect(parseObservation('no json here')).toBeNull()
    expect(parseObservation('{"posture":"sitting"}')).toBeNull()
    expect(parseObservation(null)).toBeNull()
  })
})

describe('what one look suggests', () => {
  it('calm or nobody: nothing', () => {
    expect(visionLevel(obs()).level).toBe('none')
    expect(visionLevel(obs({ personVisible: false, posture: 'on_floor' })).level).toBe('none')
    expect(visionLevel(null).level).toBe('none')
    expect(visionLevel(obs({ posture: 'lying_in_bed' })).level).toBe('none')
  })
  it('on the floor is urgent (a possible fall); visible distress is urgent; unsure signs only watch', () => {
    expect(visionLevel(obs({ posture: 'on_floor' }))).toEqual({ level: 'urgent', kind: 'possible-fall' })
    expect(visionLevel(obs({ distress: 'likely' }))).toEqual({ level: 'urgent', kind: 'visual-distress' })
    expect(visionLevel(obs({ needsHelp: true }))).toEqual({ level: 'urgent', kind: 'visual-distress' })
    expect(visionLevel(obs({ posture: 'slumped' }))).toEqual({ level: 'watch', kind: 'visual-distress' })
    expect(visionLevel(obs({ distress: 'possible' })).level).toBe('watch')
  })
})

describe('needing two looks to agree', () => {
  it('one urgent look is not enough', () => {
    expect(trackObservation([], obs({ posture: 'on_floor' })).event).toBeNull()
  })
  it('two urgent looks in a row raise the event', () => {
    const first = trackObservation([], obs({ posture: 'on_floor' }))
    expect(trackObservation(first.history, obs({ posture: 'on_floor' })).event).toBe('possible-fall')
  })
  it('a calm look in between still allows two of the last three', () => {
    let h = trackObservation([], obs({ distress: 'likely' })).history
    h = trackObservation(h, obs()).history
    expect(trackObservation(h, obs({ distress: 'likely' })).event).toBe('visual-distress')
  })
  it('different kinds do not add up, and a long calm spell forgets old worries', () => {
    let h = trackObservation([], obs({ posture: 'on_floor' })).history
    expect(trackObservation(h, obs({ distress: 'likely' })).event).toBeNull()
    h = [...Array(3)].reduce((acc) => trackObservation(acc, obs()).history, h)
    expect(trackObservation(h, obs({ posture: 'on_floor' })).event).toBeNull()
  })
})

describe('asking Gemma 3 to look', () => {
  it('sends the picture as base64 with a fixed JSON form, to the local endpoint', async () => {
    let sent = null
    const r = await describeScene(settings, jpeg, 'a change in the voice', async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return answer(obs()) })
    expect(r).toEqual({ ok: true, observation: obs() })
    expect(sent.url).toBe('/ollama/api/chat')
    expect(sent.body).toMatchObject({ model: 'gemma3:4b', stream: false, options: { temperature: 0.1 } })
    expect(sent.body.format.required).toContain('posture')
    const user = sent.body.messages.find((m) => m.role === 'user')
    expect(user.images).toEqual([Buffer.from(jpeg).toString('base64')])
    expect(user.content).toContain('a change in the voice')
    expect(sent.body.messages[0].content).toMatch(/Never identify anyone/)
  })
  it('accepts a Blob frame too', async () => {
    const r = await describeScene(settings, new Blob([jpeg], { type: 'image/jpeg' }), '', async () => answer(obs({ posture: 'standing' })))
    expect(r.observation.posture).toBe('standing')
  })
  it('reports failure instead of throwing', async () => {
    expect((await describeScene(settings, jpeg, '', async () => ({ ok: false, status: 503 }))).error).toMatch(/503/)
    expect((await describeScene(settings, jpeg, '', async () => { throw new Error('down') })).error).toMatch(/Could not reach/)
    expect((await describeScene(settings, jpeg, '', async () => answer('nonsense'))).error).toMatch(/unusable/)
    const abort = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e }
    expect((await describeScene(settings, jpeg, '', abort)).error).toMatch(/too long/)
  })
  it('base64 matches the standard encoding even for large pictures', () => {
    const big = new Uint8Array(200000).map((_, i) => i % 251)
    expect(toBase64(big)).toBe(Buffer.from(big).toString('base64'))
  })
  it('describes what it saw in plain words', () => {
    expect(describeObservation(obs({ distress: 'likely' }))).toMatch(/in distress/)
    expect(describeObservation(obs({ personVisible: false }))).toMatch(/nobody/)
  })
})
