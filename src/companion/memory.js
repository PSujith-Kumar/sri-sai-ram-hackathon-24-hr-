import { MEMORY_RETENTION_DAYS } from './config'

export const memoryCutoff = (now = Date.now(), days = MEMORY_RETENTION_DAYS) => now - days * 86400000

export function pruneConversationMemory(messages = [], now = Date.now(), days = MEMORY_RETENTION_DAYS) {
  const cutoff = memoryCutoff(now, days)
  return messages
    .filter(message => Number.isFinite(new Date(message.createdAt).getTime()) && new Date(message.createdAt).getTime() >= cutoff)
    .slice(-500)
}

export function appendConversationMemory(messages = [], message, now = Date.now(), days = MEMORY_RETENTION_DAYS) {
  return pruneConversationMemory([...messages, message], now, days)
}

const words = value => new Set(String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 2))

export function responseSimilarity(a, b) {
  const left = words(a)
  const right = words(b)
  if (!left.size || !right.size) return 0
  const common = [...left].filter(word => right.has(word)).length
  return common / new Set([...left, ...right]).size
}

export function avoidRepeatedResponse(candidate, recentMessages = [], alternatives = []) {
  const recent = recentMessages.filter(message => message.role === 'ai').slice(-6).map(message => message.text)
  const repeated = text => recent.some(previous => previous === text || responseSimilarity(previous, text) >= 0.72)
  if (!repeated(candidate)) return candidate
  return alternatives.find(text => text && !repeated(text)) || `${candidate} We can take this one small step at a time.`
}

export function conversationSignals(messages = []) {
  const recent = messages.filter(message => message.role === 'patient').slice(-20)
  const joined = recent.map(message => message.text.toLowerCase()).join(' ')
  const count = pattern => (joined.match(pattern) || []).length
  const frustration = count(/\b(angry|annoyed|stop|useless|wrong|repeat|repeating)\b/g)
  const distress = count(/\b(panic|scared|afraid|hopeless|alone|cannot cope|can't cope)\b/g)
  return {
    frustration,
    distress,
    suggestedTone: frustration > 1 ? 'brief' : distress > 0 ? 'grounding' : 'gentle',
    label: distress > 1 ? 'needs a calm check-in' : frustration > 1 ? 'prefers shorter, less repetitive replies' : 'stable conversation pattern',
  }
}
