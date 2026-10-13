import { describe, expect, it } from 'vitest'
import { LEVEL, analyzeUtterance, assessSituation, checkInPrompt, companionReply, detectIntent } from '../src/companion/brain'
import { detectLanguage, localize, packKeys, replyKeys } from '../src/companion/language'
import { analyzeAudio, assessVoice, updateBaseline } from '../src/companion/voiceAnalysis'

const RATE = 16000

/** Synthetic "voice": a sine at `freq` Hz (or a function of time) with optional pauses. */
function tone({ seconds = 2, freq = 150, amp = 0.2, freqAt = null, talk = 1, cycle = 0.6 } = {}) {
  const out = new Float32Array(Math.round(seconds * RATE))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const f = freqAt ? freqAt(t) : freq
    phase += (2 * Math.PI * f) / RATE
    const speaking = talk >= 1 || (t % cycle) / cycle < talk
    out[i] = speaking ? amp * Math.sin(phase) : 0
  }
  return out
}

describe('analyzeAudio', () => {
  it('measures the pitch and loudness of a steady voice', () => {
    const f = analyzeAudio(tone({ freq: 150, amp: 0.2 }), RATE)
    expect(f.f0Mean).toBeGreaterThan(143)
    expect(f.f0Mean).toBeLessThan(157)
    expect(f.rms).toBeGreaterThan(0.1)
    expect(f.pauseRatio).toBeLessThan(0.1)
    expect(f.jitter).toBeLessThan(0.03)
  })

  it('returns null for silence and for audio that is too short', () => {
    expect(analyzeAudio(new Float32Array(RATE * 2), RATE)).toBeNull()
    expect(analyzeAudio(tone({ seconds: 0.4 }), RATE)).toBeNull()
  })

  it('sees long pauses', () => {
    const f = analyzeAudio(tone({ seconds: 4, talk: 0.35 }), RATE)
    expect(f.pauseRatio).toBeGreaterThan(0.5)
  })

  it('sees an unsteady pitch', () => {
    const shaky = analyzeAudio(tone({ seconds: 3, freqAt: (t) => (Math.floor(t / 0.03) % 2 ? 120 : 190) }), RATE)
    const steady = analyzeAudio(tone({ seconds: 3, freq: 150 }), RATE)
    expect(shaky.jitter).toBeGreaterThan(steady.jitter * 3)
  })
})

describe('assessVoice', () => {
  const usual = analyzeAudio(tone({ freq: 150, amp: 0.2 }), RATE)
  const baseline = updateBaseline(null, usual, 2.4)

  it('treats the usual voice as normal', () => {
    expect(assessVoice(usual, baseline, 5).status).toBe('normal')
  })

  it('flags a much weaker voice', () => {
    const weak = analyzeAudio(tone({ freq: 150, amp: 0.04 }), RATE)
    const r = assessVoice(weak, baseline, 5)
    expect(['unusual', 'concerning']).toContain(r.status)
    expect(r.reasons.join(' ')).toMatch(/quiet|weak/)
  })

  it('is concerning when several things are off at once', () => {
    const bad = analyzeAudio(tone({ seconds: 4, freq: 150, amp: 0.04, talk: 0.35 }), RATE)
    const r = assessVoice(bad, baseline, 3)
    expect(r.status).toBe('concerning')
    expect(r.reasons.length).toBeGreaterThanOrEqual(2)
  })

  it('does not judge a missing recording', () => {
    expect(assessVoice(null, baseline, 3).status).toBe('unknown')
  })

  it('learns the baseline gradually and immutably', () => {
    const b1 = updateBaseline(null, usual, 2.4)
    const b2 = updateBaseline(b1, usual, 2.6)
    expect(b1.n).toBe(1)
    expect(b2.n).toBe(2)
    expect(b2.rate).toBeCloseTo(2.44, 1)
  })
})

describe('language detection', () => {
  it.each([
    ['I have a headache', 'en'],
    ['the main entrance is closed', 'en'],
    ['मुझे सीने में दर्द है', 'hi'],
    ['நெஞ்சு வலிக்கிறது', 'ta'],
    ['mujhe bahut dard hai', 'hi'],
    ['enakku romba vali irukku', 'ta'],
  ])('%s → %s', (text, lang) => expect(detectLanguage(text)).toBe(lang))
})

describe('reply packs', () => {
  it('Hindi and Tamil cover every key except jokes, and write in their own script', () => {
    for (const lang of ['hi', 'ta']) {
      const missing = replyKeys.filter(k => !packKeys(lang).includes(k))
      expect(missing).toEqual(['joke'])
    }
    expect(localize('hi', 'greeting', { first: 'Ananya' })).toMatch(/[ऀ-ॿ]/)
    expect(localize('ta', 'greeting', { first: 'Ananya' })).toMatch(/[஀-௿]/)
  })

  it('falls back to English for a key a language lacks', () => {
    expect(localize('hi', 'joke', { seed: 0 })).toMatch(/dose|nap|beat/)
  })

  it('check-in prompts follow the language', () => {
    expect(checkInPrompt('Ananya Kumar', 0, 'en')).toMatch(/checking in/)
    expect(checkInPrompt('Ananya Kumar', 0, 'hi')).toMatch(/[ऀ-ॿ]/)
  })
})

describe('multilingual safety keywords', () => {
  it.each([
    ['मेरे सीने में बहुत दर्द हो रहा है'],
    ['mujhe saans nahi aa rahi'],
    ['நெஞ்சு வலிக்குது'],
    ['ennala moochu vida mudiyala'],
    ['मैं बेहोश होने वाला हूँ'],
    ['main jeena nahi chahta'],
  ])('treats "%s" as critical', (text) => expect(analyzeUtterance(text).level).toBe(LEVEL.critical))

  it.each([
    ['अब सीने में दर्द नहीं है'],
    ['nenju vali illa ippo'],
    ['mujhe dard nahi hai'],
  ])('does not alert on the negation "%s"', (text) => expect(analyzeUtterance(text).level).toBeLessThan(LEVEL.urgent))

  it('reports the language of what was said', () => {
    expect(analyzeUtterance('मुझे बहुत अकेलापन लग रहा है').lang).toBe('hi')
  })
})

describe('conversation', () => {
  const reply = (text, extra = {}) => companionReply({ analysis: analyzeUtterance(text), name: 'Ananya Kumar', companion: 'Asha', seed: 0, now: new Date(2026, 9, 13, 20, 5), ...extra })

  it('introduces itself instead of saying "go on"', () => {
    expect(detectIntent('tell me about yourself')).toBe('about')
    expect(reply('tell me about yourself')).toMatch(/I'm Asha, your companion/)
  })

  it.each([
    ['how are you', /how you are/],
    ['what time is it', /20|8/],
    ['good night', /Rest well/],
    ['tell me a joke', /\*/],
  ])('answers "%s"', (text, pattern) => expect(reply(text)).toMatch(pattern))

  it('does not treat words like "this" as a greeting', () => {
    expect(detectIntent('this is something else entirely')).toBe('chat')
  })

  it('varies its open conversation instead of repeating one line', () => {
    const seen = new Set([0, 1, 2, 3, 4].map(seed => reply('hmm whatever you say', { seed })))
    expect(seen.size).toBeGreaterThan(2)
    for (const line of seen) expect(line).not.toMatch(/Mm-hm/)
  })

  it('replies in Hindi to Hindi and in Tamil to Tamil', () => {
    expect(reply('मुझे बहुत अकेलापन लग रहा है')).toMatch(/[ऀ-ॿ]/)
    expect(reply('எனக்கு மிகவும் தனிமையாக இருக்கிறது')).toMatch(/[஀-௿]/)
  })

  it('answers "who are you" in Tamil script', () => {
    expect(reply('நீ யார்')).toMatch(/[஀-௿]/)
  })
})

describe('voice wellness in the decision', () => {
  const concerning = { status: 'concerning', score: 4, reasons: ['a very weak, quiet voice', 'a shaky, unsteady voice'] }
  const unusual = { status: 'unusual', score: 2, reasons: ['a quieter voice than usual'] }

  it('a concerning voice alerts family and doctor on its own', () => {
    const r = assessSituation({ utterance: 'I am fine', voice: concerning })
    expect(r.codes).toContain('VC')
    expect(r.actions.alertFamily).toBe(true)
  })

  it('an unusual voice alone only prompts a gentle check-in', () => {
    const r = assessSituation({ utterance: 'I am fine', voice: unusual })
    expect(r.level).toBe(LEVEL.watch)
    expect(r.actions.alertFamily).toBe(false)
  })

  it('an unusual voice plus distressed words becomes an alert', () => {
    const r = assessSituation({ utterance: 'I feel dizzy', voice: unusual })
    expect(r.level).toBeGreaterThanOrEqual(LEVEL.urgent)
  })

  it('the patient is told what is happening', () => {
    const analysis = analyzeUtterance('I am fine')
    expect(companionReply({ analysis, name: 'Ananya Kumar', voice: concerning })).toMatch(/your family and your doctor/)
    expect(companionReply({ analysis, name: 'Ananya Kumar', voice: unusual })).toMatch(/sounds a little weak/)
  })
})
