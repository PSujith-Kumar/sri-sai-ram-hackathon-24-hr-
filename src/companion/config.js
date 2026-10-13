import { LLM_DEFAULTS } from './llm'
import { CLASSIFIER_DEFAULTS } from './remoteModel'
import { VISION_DEFAULTS } from './vision'

export const MEMORY_RETENTION_DAYS = 30
export const EMERGENCY_NUMBERS = { india: '112', teleManas: '14416' }

export const DEFAULT_PROFILE = {
  voiceURI: '',
  rate: 1,
  pitch: 1,
  lang: 'auto',
  companionName: 'Asha',
  autonomous: false,
  checkInSeconds: 60,
  voiceBaseline: null,
  memoryEnabled: true,
  memoryDays: MEMORY_RETENTION_DAYS,
  adaptiveTone: true,
  avoidRepetition: true,
  useRecordContext: true,
  sensorEscalationConsent: false,
  caregiverEscalationConsent: true,
  favouriteContactId: '',
  responseStyle: 'gentle',
  thermal: { kind: 'sim', url: '', cctvKind: 'webcam', cctvUrl: '', alwaysOn: true }, // kind: sim | http | phone; cctvKind: webcam | ip | phone
  llm: LLM_DEFAULTS,                  // Gemma 3 conversation (see llm.js)
  vision: VISION_DEFAULTS,            // Gemma 3 looks at the camera picture when the camera is on (see vision.js)
  classifier: CLASSIFIER_DEFAULTS,    // fine-tuned mood model service (see remoteModel.js)
  contacts: [],
}

export const EMPTY_COMPANION = {
  profile: DEFAULT_PROFILE,
  moods: [],
  events: [],
  relayQueue: [],
  memory: [],
  learning: { helpful: 0, poor: 0, anger: 0, repetitive: 0, corrected: 0 },
}

export const mergeProfile = (profile = {}) => ({
  ...DEFAULT_PROFILE,
  ...profile,
  thermal: { ...DEFAULT_PROFILE.thermal, ...profile.thermal },
  llm: { ...DEFAULT_PROFILE.llm, ...profile.llm },
  vision: { ...DEFAULT_PROFILE.vision, ...profile.vision },
  classifier: { ...DEFAULT_PROFILE.classifier, ...profile.classifier },
  contacts: profile.contacts || [],
})
