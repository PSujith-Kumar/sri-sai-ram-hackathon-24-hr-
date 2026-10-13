// Language detection and reply packs (English, Hindi, Tamil). Pure functions.
// A reply is chosen by KEY (what to say) and language (how to say it); missing keys fall back to English.

const DEVANAGARI = /[ऀ-ॿ]/
const TAMIL = /[஀-௿]/
// Romanised Hindi / Tamil (as people type or as speech engines sometimes return it)
const HI_LATIN = /\b(mujhe|mujhko|nahi|nahin|kya|kaise|kaisa|kaisi|hoon|dard|saans|bahut|thoda|acha|accha|theek|dawai|dawa|aap|tum|mera|meri|raha|rahi|chakkar|bukhar|ghabrahat|akela|lag|hai|hain|mein)\b/gi
const HI_STRONG = /\b(mujhe|mujhko|nahi|nahin|kya|dard|saans|aap|chakkar|bukhar|ghabrahat)\b/i
const TA_LATIN = /\b(enakku|ennaku|naan|nee|neenga|romba|irukku|irukken|irukkeenga|illa|illai|vali|valikuthu|moochu|thalai|suthudhu|sapitten|mudiyala|vendum|konjam|eppadi|epdi|nalla|bayama|kashtama|thaniya|amma|appa)\b/gi

export const SPEECH_LANG = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }
export const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', ta: 'Tamil' }

/** 'en' | 'hi' | 'ta' for a sentence, whether written in script or in Latin letters. */
export function detectLanguage(text = '') {
  if (DEVANAGARI.test(text)) return 'hi'
  if (TAMIL.test(text)) return 'ta'
  const hi = (text.match(HI_LATIN) || []).length
  const ta = (text.match(TA_LATIN) || []).length
  if (ta >= 2 || (ta === 1 && ta > hi)) return 'ta'
  if (hi >= 2 || (hi === 1 && HI_STRONG.test(text))) return 'hi'
  return 'en'
}

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
const pickOne = (list, seed) => list[Math.abs(seed) % list.length]

const EN = {
  mh: `{first}, I'm really glad you told me. You matter, and you don't have to carry this alone. I'm letting your family know right now so someone can be with you. If you feel unsafe, please call Tele-MANAS on 14416 any time. I'm staying right here with you.`,
  critical: `{first}, this sounds serious, so I'm acting now. I'm alerting your family and your hospital right away. Please sit or lie down somewhere safe and stay with me. Help is on the way.`,
  urgent: `I'm worried about that, {first}. I'm letting your family know so you're not alone. Can you tell me exactly how you feel right now?`,
  watchSymptom: `Thanks for telling me, {first}. Let's keep a close eye on that. Please rest and sip some water. If it gets worse, just say "I need help" and I'll alert everyone.`,
  medTaken: `That's wonderful, {first}. I'll note that down. Taking it on time really helps.`,
  medicine: `Your next one is {med}. Shall I remind you when it's time?`,
  medicineDone: `You've taken everything on your list for today. Well done, {first}!`,
  queue: `I'll keep watching your queue and tell you when your turn is close.`,
  greeting: [`Hello {first}! It's lovely to hear from you. How are you feeling today?`, `Hi {first}! I'm here. How has your day been so far?`],
  thanks: `Always, {first}. That's what friends are for.`,
  lowWatch: `That sounds really heavy, {first}, and not eating or sleeping well makes it harder. I'm here with you. I'll let your care team know you're having a low time so they can support you, and I'll check in on you again soon.`,
  angry: `I hear you, {first}, and your frustration is completely fair. I'm sorry you're being kept waiting. Let me look at your queue, and I'll make sure the staff know how you feel.`,
  distressed: `I'm sorry you're not feeling well, {first}. Can you tell me where it hurts and how long it has been going on? I'm paying close attention, and I'll call for help the moment you ask.`,
  low: `I'm sorry you're feeling that way, {first}. I'm right here, and I'd love to keep you company. Would you like to tell me what's on your mind, or shall we talk about something that makes you smile?`,
  anxious: `It's okay to feel worried, {first}. Let's take a slow breath together: in for four, hold, and out for six. I'm with you, and everything is being looked after.`,
  tired: `You sound tired, {first}. Rest is part of healing. I'll keep watch while you relax.`,
  happy: `I'm so glad to hear that, {first}! Anything nice planned for today?`,
  about: `I'm {companion}, your companion. I chat with you, remind you about your medicines, keep a gentle eye on how you're doing, and let your family and doctor know if something seems wrong. What would you like to talk about?`,
  howAreYou: `I'm doing well, thank you for asking! The real question is how you are, {first}?`,
  goodbye: `Of course, {first}. Rest well. I'm right here whenever you want to talk.`,
  time: `It's {time} right now, {first}.`,
  date: `Today is {date}, {first}.`,
  joke: [`Why did the tablet go to school? To get a little more *dose* of knowledge! Ha ha.`, `What do you call a sleepy doctor? A *nap*-ractor... okay, I'll keep my day job.`, `Why was the heart so good at singing? It always had great *beat*.`],
  checkIn0: `Hi {first}, just checking in. How are you feeling right now?`,
  checkIn1: `{first}, I haven't heard back yet. Are you okay? Please say something or tap the screen.`,
  medReminder: `It's time for your {med}. Please tell me once you've taken it.`,
  voiceConcern: `{first}, your voice sounds a little weak and different today. Is everything all right? Tell me if anything feels off.`,
  voiceAlert: `{first}, your voice is worrying me. I'm letting your family and your doctor know. Please sit comfortably, and I'm staying right here with you.`,
  default: [`That's interesting, {first}. Tell me more about it.`, `How has your day been so far, {first}?`, `Have you had something to eat and drink? I want you to look after yourself.`, `Who in your family do you miss the most today?`, `Would you like me to tell you a joke, or shall we just chat?`],
}

const HI = {
  mh: `{first}, आपने मुझे बताया, यह अच्छा किया। आप अकेले नहीं हैं। मैं अभी आपके परिवार को बता रही हूँ ताकि कोई आपके पास रहे। अगर आप असुरक्षित महसूस करें तो कृपया Tele-MANAS 14416 पर कॉल करें। मैं आपके साथ हूँ।`,
  critical: `{first}, यह गंभीर लग रहा है, इसलिए मैं तुरंत कदम उठा रही हूँ। मैं आपके परिवार और अस्पताल को अभी सूचित कर रही हूँ। कृपया किसी सुरक्षित जगह बैठ जाएँ या लेट जाएँ और मेरे साथ बने रहें। मदद आ रही है।`,
  urgent: `मुझे इसकी चिंता है, {first}। मैं आपके परिवार को बता रही हूँ ताकि आप अकेले न रहें। क्या आप बता सकते हैं कि अभी आपको कैसा लग रहा है?`,
  watchSymptom: `बताने के लिए धन्यवाद, {first}। आइए इस पर नज़र रखें। कृपया आराम करें और थोड़ा पानी पिएँ। अगर हालत बिगड़े तो बस कहिए "मुझे मदद चाहिए" और मैं सबको खबर कर दूँगी।`,
  medTaken: `बहुत बढ़िया, {first}। मैंने नोट कर लिया। समय पर दवा लेना बहुत फायदेमंद है।`,
  medicine: `आपकी अगली दवा है {med}। क्या समय होने पर मैं याद दिला दूँ?`,
  medicineDone: `आज की सारी दवाएँ आप ले चुके हैं। शाबाश, {first}!`,
  queue: `मैं आपकी कतार पर नज़र रखूँगी और बारी पास आने पर बता दूँगी।`,
  greeting: [`नमस्ते {first}! आपसे बात करके अच्छा लगा। आज आप कैसा महसूस कर रहे हैं?`, `नमस्ते {first}! मैं यहीं हूँ। आपका दिन अब तक कैसा रहा?`],
  thanks: `हमेशा, {first}। दोस्त इसीलिए तो होते हैं।`,
  lowWatch: `यह सुनकर दुख हुआ, {first}। खाना और नींद न होने से सब और भारी लगता है। मैं आपके साथ हूँ। मैं आपकी केयर टीम को बता दूँगी ताकि वे आपका साथ दें, और थोड़ी देर में फिर हाल पूछूँगी।`,
  angry: `मैं समझती हूँ, {first}, आपकी नाराज़गी जायज़ है। इंतज़ार कराने के लिए मुझे खेद है। मैं आपकी कतार देखती हूँ और स्टाफ को बता दूँगी।`,
  distressed: `आप ठीक नहीं हैं, यह जानकर दुख हुआ, {first}। क्या आप बता सकते हैं कि कहाँ दर्द है और कब से है? मैं ध्यान से सुन रही हूँ और आप कहेंगे तो तुरंत मदद बुलाऊँगी।`,
  low: `आपको ऐसा लग रहा है, यह सुनकर मुझे दुख है, {first}। मैं यहीं हूँ और आपका साथ देना चाहती हूँ। क्या आप बताना चाहेंगे कि मन में क्या है, या कुछ ऐसी बात करें जिससे मुस्कान आए?`,
  anxious: `चिंता होना स्वाभाविक है, {first}। आइए साथ में धीरे-धीरे साँस लें: चार गिनती तक अंदर, रुकें, और छह गिनती में बाहर। मैं आपके साथ हूँ और सब कुछ संभाला जा रहा है।`,
  tired: `आप थके हुए लग रहे हैं, {first}। आराम भी इलाज का हिस्सा है। आप आराम कीजिए, मैं निगरानी रखूँगी।`,
  happy: `यह सुनकर बहुत खुशी हुई, {first}! आज कुछ अच्छा सोचा है?`,
  about: `मैं {companion} हूँ, आपकी साथी। मैं आपसे बात करती हूँ, आपकी दवाओं की याद दिलाती हूँ, आपका हाल देखती रहती हूँ, और कुछ गलत लगे तो आपके परिवार और डॉक्टर को बताती हूँ। आप किस बारे में बात करना चाहेंगे?`,
  howAreYou: `मैं ठीक हूँ, पूछने के लिए शुक्रिया! असली सवाल यह है कि आप कैसे हैं, {first}?`,
  goodbye: `ठीक है, {first}। आराम कीजिए। मैं यहीं हूँ, जब चाहें बुला लीजिए।`,
  time: `अभी {time} बजे हैं, {first}।`,
  date: `आज {date} है, {first}।`,
  checkIn0: `नमस्ते {first}, बस हाल पूछ रही थी। अभी आप कैसा महसूस कर रहे हैं?`,
  checkIn1: `{first}, मुझे अब तक जवाब नहीं मिला। क्या आप ठीक हैं? कृपया कुछ बोलिए या स्क्रीन छुइए।`,
  medReminder: `आपकी {med} दवा का समय हो गया है। लेने के बाद मुझे बता दीजिए।`,
  voiceConcern: `{first}, आपकी आवाज़ आज थोड़ी कमज़ोर और अलग लग रही है। क्या सब ठीक है? कुछ भी लगे तो मुझे बताइए।`,
  voiceAlert: `{first}, आपकी आवाज़ से मुझे चिंता हो रही है। मैं आपके परिवार और डॉक्टर को बता रही हूँ। कृपया आराम से बैठिए, मैं यहीं हूँ।`,
  default: [`मैं सुन रही हूँ, {first}। थोड़ा और बताइए।`, `आज का दिन कैसा रहा, {first}?`, `क्या आपने कुछ खाया-पिया? मैं चाहती हूँ कि आप अपना ध्यान रखें।`, `आपके परिवार में कौन आपको सबसे ज़्यादा याद आता है?`],
}

const TA = {
  mh: `{first}, என்னிடம் சொன்னதற்கு நன்றி. நீங்கள் தனியாக இல்லை. உங்கள் குடும்பத்துக்கு இப்போதே தகவல் தருகிறேன், யாராவது உங்களுடன் இருப்பார்கள். பாதுகாப்பில்லை என்று தோன்றினால் Tele-MANAS 14416 ஐ அழைக்கவும். நான் உங்களுடன்தான் இருக்கிறேன்.`,
  critical: `{first}, இது தீவிரமாகத் தெரிகிறது, அதனால் உடனே நடவடிக்கை எடுக்கிறேன். உங்கள் குடும்பத்துக்கும் மருத்துவமனைக்கும் இப்போதே தெரிவிக்கிறேன். பாதுகாப்பான இடத்தில் அமரவும் அல்லது படுக்கவும், என்னுடன் இருங்கள். உதவி வருகிறது.`,
  urgent: `இது எனக்குக் கவலையாக இருக்கிறது, {first}. நீங்கள் தனியாக இல்லாதபடி உங்கள் குடும்பத்துக்குத் தெரிவிக்கிறேன். இப்போது எப்படி உணர்கிறீர்கள் என்று சொல்ல முடியுமா?`,
  watchSymptom: `சொன்னதற்கு நன்றி, {first}. இதை நாம் கவனித்துக்கொள்வோம். ஓய்வெடுங்கள், கொஞ்சம் தண்ணீர் குடியுங்கள். மோசமானால் "எனக்கு உதவி வேண்டும்" என்று சொல்லுங்கள், எல்லோருக்கும் தெரிவிப்பேன்.`,
  medTaken: `மிகவும் நல்லது, {first}. குறித்துக்கொண்டேன். நேரத்துக்கு மருந்து சாப்பிடுவது மிகவும் உதவும்.`,
  medicine: `உங்கள் அடுத்த மருந்து {med}. நேரம் வரும்போது நினைவூட்டட்டுமா?`,
  medicineDone: `இன்றைய எல்லா மருந்துகளையும் சாப்பிட்டுவிட்டீர்கள். சபாஷ், {first}!`,
  queue: `உங்கள் வரிசையைக் கவனித்து, உங்கள் முறை நெருங்கும்போது சொல்கிறேன்.`,
  greeting: [`வணக்கம் {first}! உங்களுடன் பேசுவது மகிழ்ச்சி. இன்று எப்படி இருக்கிறீர்கள்?`, `வணக்கம் {first}! நான் இங்கேதான் இருக்கிறேன். இன்றைய நாள் எப்படிப் போகிறது?`],
  thanks: `எப்போதும், {first}. நண்பர்கள் இதற்குத்தானே.`,
  lowWatch: `அதைக் கேட்க வருத்தமாக இருக்கிறது, {first}. சாப்பிடாமலும் தூங்காமலும் இருப்பது எல்லாவற்றையும் கடினமாக்கும். நான் உங்களுடன் இருக்கிறேன். உங்கள் கவனிப்புக் குழுவுக்குத் தெரிவிக்கிறேன், கொஞ்ச நேரத்தில் மீண்டும் விசாரிப்பேன்.`,
  angry: `புரிகிறது, {first}, உங்கள் கோபம் நியாயமானது. காத்திருக்க வைத்ததற்கு வருந்துகிறேன். உங்கள் வரிசையைப் பார்க்கிறேன், ஊழியர்களுக்கும் தெரிவிக்கிறேன்.`,
  distressed: `உங்களுக்கு உடல்நலமில்லை என்பது வருத்தமாக இருக்கிறது, {first}. எங்கே வலிக்கிறது, எவ்வளவு நேரமாக என்று சொல்ல முடியுமா? கவனமாகக் கேட்கிறேன், நீங்கள் சொன்னவுடன் உதவிக்கு அழைப்பேன்.`,
  low: `நீங்கள் அப்படி உணர்வது வருத்தமாக இருக்கிறது, {first}. நான் இங்கேயே இருக்கிறேன். உங்கள் மனதில் என்ன இருக்கிறது என்று சொல்கிறீர்களா, அல்லது சிரிக்க வைக்கும் ஏதாவது பேசலாமா?`,
  anxious: `கவலைப்படுவது இயல்புதான், {first}. இருவரும் மெதுவாக மூச்சு விடுவோம்: நான்கு எண்ணும் வரை உள்ளிழுங்கள், நிறுத்துங்கள், ஆறு எண்ணும் வரை வெளிவிடுங்கள். நான் உங்களுடன் இருக்கிறேன், எல்லாம் கவனிக்கப்படுகிறது.`,
  tired: `நீங்கள் சோர்வாகத் தெரிகிறீர்கள், {first}. ஓய்வும் சிகிச்சையின் ஒரு பகுதி. நீங்கள் ஓய்வெடுங்கள், நான் கவனித்துக்கொள்கிறேன்.`,
  happy: `இதைக் கேட்க மிகவும் மகிழ்ச்சி, {first}! இன்று ஏதாவது நல்லது திட்டமிட்டிருக்கிறீர்களா?`,
  about: `நான் {companion}, உங்கள் தோழி. உங்களுடன் பேசுவேன், மருந்துகளை நினைவூட்டுவேன், உங்கள் நலனைக் கவனிப்பேன், ஏதாவது தவறாகத் தெரிந்தால் உங்கள் குடும்பத்துக்கும் மருத்துவருக்கும் தெரிவிப்பேன். எதைப் பற்றிப் பேச விரும்புகிறீர்கள்?`,
  howAreYou: `நான் நலமாக இருக்கிறேன், கேட்டதற்கு நன்றி! முக்கியமான கேள்வி, நீங்கள் எப்படி இருக்கிறீர்கள், {first}?`,
  goodbye: `சரி, {first}. ஓய்வெடுங்கள். நான் இங்கேயே இருக்கிறேன், எப்போது வேண்டுமானாலும் அழையுங்கள்.`,
  time: `இப்போது நேரம் {time}, {first}.`,
  date: `இன்று {date}, {first}.`,
  checkIn0: `வணக்கம் {first}, சும்மா விசாரிக்கிறேன். இப்போது எப்படி உணர்கிறீர்கள்?`,
  checkIn1: `{first}, இன்னும் பதில் வரவில்லை. நீங்கள் நலமா? ஏதாவது சொல்லுங்கள் அல்லது திரையைத் தொடுங்கள்.`,
  medReminder: `உங்கள் {med} மருந்து நேரம் ஆகிவிட்டது. சாப்பிட்டதும் எனக்குச் சொல்லுங்கள்.`,
  voiceConcern: `{first}, இன்று உங்கள் குரல் கொஞ்சம் பலவீனமாகவும் வித்தியாசமாகவும் இருக்கிறது. எல்லாம் சரியா? ஏதாவது தோன்றினால் சொல்லுங்கள்.`,
  voiceAlert: `{first}, உங்கள் குரல் எனக்குக் கவலை தருகிறது. உங்கள் குடும்பத்துக்கும் மருத்துவருக்கும் தெரிவிக்கிறேன். அமைதியாக அமருங்கள், நான் இங்கேயே இருக்கிறேன்.`,
  default: [`கேட்டுக்கொண்டிருக்கிறேன், {first}. இன்னும் சொல்லுங்கள்.`, `இன்றைய நாள் எப்படி இருந்தது, {first}?`, `ஏதாவது சாப்பிட்டீர்களா? உங்களை நீங்கள் கவனித்துக்கொள்ள வேண்டும்.`, `உங்கள் குடும்பத்தில் யாரை அதிகம் நினைக்கிறீர்கள்?`],
}

const PACKS = { en: EN, hi: HI, ta: TA }

/** Renders reply `key` in `lang` (falls back to English). Lists are rotated by `vars.seed`. */
export function localize(lang, key, vars = {}) {
  const raw = (PACKS[lang] && PACKS[lang][key]) ?? EN[key]
  const template = Array.isArray(raw) ? pickOne(raw, vars.seed ?? 0) : raw
  return fill(template, vars)
}

export const replyKeys = Object.keys(EN)
export const packLanguages = Object.keys(PACKS)
export const packKeys = (lang) => Object.keys(PACKS[lang])
