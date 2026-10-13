import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import model from '../src/companion/mood-model.json'
import { LEVEL, analyzeUtterance, companionReply } from '../src/companion/brain'
import { features, predictMood, setMoodModel, tokenize } from '../src/companion/mood'

const readJsonl = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const gold = readJsonl('../ml/data/gold.jsonl')
const parity = JSON.parse(readFileSync(new URL('../ml/data/parity.json', import.meta.url), 'utf8'))
const LEVELS = ['none', 'watch', 'urgent', 'critical']

setMoodModel(model) // must happen before the describe blocks below build their predictions

describe('feature extraction', () => {
  it('tokenizes like the training code', () => {
    expect(tokenize("I can't breathe!!")).toEqual(['i', 'cant', 'breathe'])
  })

  it('builds word, bigram and character-trigram features', () => {
    const f = features('chest pain')
    expect(f).toEqual(expect.arrayContaining(['w:chest', 'b:chest_pain', 'c:<ch', 'c:hes', 'c:ain']))
  })
})

describe('JavaScript model matches the Python model', () => {
  it.each(parity.map(p => [p.text, p]))('%s', (_text, p) => {
    const r = predictMood(p.text)
    r.moodProbs.forEach((v, i) => expect(Math.abs(v - p.mood[i])).toBeLessThan(0.002))
    r.severityProbs.forEach((v, i) => expect(Math.abs(v - p.severity[i])).toBeLessThan(0.002))
  })
})

describe('model quality on the hand-written gold set', () => {
  const preds = gold.map(g => ({ g, p: predictMood(g.text) }))
  const acc = (key, pk) => preds.filter(({ g, p }) => p[pk] === g[key]).length / preds.length

  it('detects mood well above chance', () => expect(acc('mood', 'mood')).toBeGreaterThanOrEqual(0.75))
  it('detects situation severity well above chance', () => expect(acc('severity', 'severity')).toBeGreaterThanOrEqual(0.8))
})

describe('combined system (safety rules + model) on the gold set', () => {
  const rows = gold.map(g => ({ g, a: analyzeUtterance(g.text, { conditions: [], allergies: [] }) }))

  it('catches almost every serious situation', () => {
    const serious = rows.filter(({ g }) => ['urgent', 'critical'].includes(g.severity))
    const caught = serious.filter(({ a }) => a.level >= LEVEL.urgent).length
    expect(caught / serious.length).toBeGreaterThanOrEqual(0.9)
  })

  it('rarely raises a false alarm on calm sentences', () => {
    const calm = rows.filter(({ g }) => g.severity === 'none')
    const alarms = calm.filter(({ a }) => a.level >= LEVEL.urgent).length
    expect(alarms / calm.length).toBeLessThanOrEqual(0.1)
  })

  it('never drops a keyword-detected emergency because the model disagrees', () => {
    expect(analyzeUtterance('I have chest pain').level).toBe(LEVEL.critical)
    expect(analyzeUtterance("I can't breathe").level).toBe(LEVEL.critical)
    expect(analyzeUtterance("I don't want to live anymore").level).toBe(LEVEL.critical)
  })
})

describe('negation guard', () => {
  it.each([
    ['I have no chest pain today'],
    ["I'm not dizzy anymore"],
    ['no bleeding, it was a small scratch'],
  ])('does not alert on "%s"', (text) => {
    expect(analyzeUtterance(text).level).toBeLessThan(LEVEL.urgent)
  })

  it('still alerts when a symptom is stated plainly', () => {
    expect(analyzeUtterance('I am bleeding heavily').level).toBe(LEVEL.critical)
  })
})

describe('mood-aware replies', () => {
  const reply = (text) => companionReply({ analysis: analyzeUtterance(text), name: 'Ananya Kumar' })

  it('acknowledges anger and offers to inform staff', () => {
    expect(reply('I am furious that no one answered my call')).toMatch(/frustration/)
  })

  it('responds gently to sadness', () => {
    expect(reply('I feel so lonely and sad')).toMatch(/I'm sorry you're feeling that way, Ananya/)
  })

  it('stays calm and offers breathing support for anxiety', () => {
    expect(reply('I am so nervous about the operation')).toMatch(/breath/)
  })

  it('responds to critical language with action', () => {
    expect(reply('It feels like an elephant is sitting on my chest')).toMatch(/acting now|alerting/)
  })

  it('reports the model confidence with the mood', () => {
    const a = analyzeUtterance('I feel so lonely and sad')
    expect(a.mood).toBe('low')
    expect(a.moodConfidence).toBeGreaterThan(0.45)
    expect(LEVELS[a.level]).toBe('none')
  })
})
