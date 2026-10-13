import { describe, expect, it, vi } from 'vitest'
import { LEVEL, analyzeUtterance, assessSituation } from '../src/companion/brain'
import { CLASSIFIER_DEFAULTS, checkClassifier, classifyRemote, toPrediction } from '../src/companion/remoteModel'

// What `python ml/serve.py` returns (labels: severities none, watch, urgent, critical)
const body = (over = {}) => ({
  mood: 'distressed', moodProb: 0.93, moodProbs: [0.01, 0.02, 0.93, 0.01, 0.01, 0.01, 0.01],
  severity: 'urgent', severityProb: 0.7, severityProbs: [0.05, 0.1, 0.7, 0.15], model: 'final', ...over,
})
const reply = (obj) => ({ ok: true, status: 200, json: async () => obj })

describe('toPrediction', () => {
  it('maps the service answer onto the built-in model shape', () => {
    const p = toPrediction(body())
    expect(p).toMatchObject({ mood: 'distressed', severity: 'urgent', severityLevel: LEVEL.urgent, source: 'fine-tuned' })
    expect(p.seriousProb).toBeCloseTo(0.85, 5) // urgent + critical
  })

  it('rejects malformed answers', () => {
    expect(toPrediction(null)).toBeNull()
    expect(toPrediction({ mood: 'low' })).toBeNull()
    expect(toPrediction(body({ severity: 'extreme' }))).toBeNull()
  })
})

describe('classifyRemote', () => {
  it('posts the sentence to /classify and returns a prediction', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(body()))
    const p = await classifyRemote('my chest hurts', { enabled: true, endpoint: '/classifier/' }, fetchImpl)
    expect(p.mood).toBe('distressed')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/classifier/classify')
    expect(JSON.parse(init.body)).toEqual({ text: 'my chest hurts' })
  })

  it('resolves null (never throws) when the service is down, errors or is disabled', async () => {
    expect(await classifyRemote('hi', CLASSIFIER_DEFAULTS, vi.fn().mockRejectedValue(new Error('refused')))).toBeNull()
    expect(await classifyRemote('hi', CLASSIFIER_DEFAULTS, vi.fn().mockResolvedValue({ ok: false, status: 502 }))).toBeNull()
    expect(await classifyRemote('hi', { ...CLASSIFIER_DEFAULTS, enabled: false }, vi.fn())).toBeNull()
    expect(await classifyRemote('   ', CLASSIFIER_DEFAULTS, vi.fn())).toBeNull()
  })
})

describe('checkClassifier', () => {
  it('reports the running model', async () => {
    expect(await checkClassifier(CLASSIFIER_DEFAULTS, vi.fn().mockResolvedValue(reply({ ok: true, model: 'final' })))).toEqual({ ok: true, model: 'final' })
  })

  it('reports not running for a refused connection or a proxy 502', async () => {
    expect((await checkClassifier(CLASSIFIER_DEFAULTS, vi.fn().mockRejectedValue(new Error('x')))).ok).toBe(false)
    expect((await checkClassifier(CLASSIFIER_DEFAULTS, vi.fn().mockResolvedValue({ ok: false, status: 502 }))).ok).toBe(false)
  })
})

describe('the app uses the fine-tuned prediction when it is given one', () => {
  it('takes its mood reading', () => {
    const prediction = toPrediction(body({ mood: 'anxious', moodProb: 0.9, severity: 'none', severityProb: 0.9, severityProbs: [0.9, 0.05, 0.03, 0.02] }))
    expect(analyzeUtterance('hmm', { prediction }).mood).toBe('anxious')
  })

  it('can raise concern when the sentence has a distress cue', () => {
    const prediction = toPrediction(body())
    expect(analyzeUtterance('my stomach hurts a lot', { prediction }).level).toBeGreaterThanOrEqual(LEVEL.urgent)
    expect(assessSituation({ utterance: 'my stomach hurts a lot', prediction }).actions.alertFamily).toBe(true)
  })

  it('still cannot alert on chit-chat, even if the model were wrong', () => {
    const prediction = toPrediction(body({ mood: 'neutral', moodProb: 0.8 }))
    expect(analyzeUtterance('the weather is nice', { prediction }).level).toBeLessThan(LEVEL.urgent)
  })

  it('never lowers an emergency the keyword rules caught', () => {
    const prediction = toPrediction(body({ mood: 'happy', moodProb: 0.99, severity: 'none', severityProb: 0.99, severityProbs: [0.99, 0.005, 0.003, 0.002] }))
    expect(analyzeUtterance('I have chest pain', { prediction }).level).toBe(LEVEL.critical)
  })
})
