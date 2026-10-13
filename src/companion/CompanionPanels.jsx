import React, { useEffect, useRef, useState } from 'react'
import { Activity, Camera, CameraOff, Flame, Heart, Mic, MicOff, PhoneCall, Radio, Send, ShieldAlert, Smartphone, Sparkles, Video, Volume2, Wifi, WifiOff } from 'lucide-react'
import { Badge, Card } from '../ui'
import { LEVEL_NAMES } from './brain'
import { USSD_CONFIG, smsHref, ussdDialHref } from './ussd'
import { SAMPLE_PROMPT } from './useVoice'
import { isLocalEndpoint } from './llm'

const LEVEL_TONE = ['green', 'gold', 'coral', 'coral']

export function StatusStrip({ aiOn, online, thermalStatus, cctvOn, recording, listening, speaking, level }) {
  const watching = thermalStatus === 'live'
  return <div className="cmp-strip" role="status" aria-live="polite">
    <Badge tone={aiOn ? 'green' : 'neutral'}><Radio/> {aiOn ? 'AI care mode on' : 'AI care mode off'}</Badge>
    <Badge tone={online ? 'green' : 'coral'}>{online ? <Wifi/> : <WifiOff/>} {online ? 'Online' : 'Offline · USSD ready'}</Badge>
    <Badge tone={watching ? 'green' : thermalStatus === 'unavailable' ? 'coral' : 'neutral'}><Flame/> {watching ? 'Thermal sensor watching' : thermalStatus === 'unavailable' ? 'Thermal sensor unavailable' : 'Thermal sensor off'}</Badge>
    <Badge tone={cctvOn ? 'gold' : 'green'}>{cctvOn ? <Camera/> : <CameraOff/>} {cctvOn ? 'CCTV on (live check)' : 'CCTV off · private'}</Badge>
    {aiOn && thermalStatus === 'unavailable' && <Badge tone="gold"><Mic/> Voice check-ins active</Badge>}
    {recording &&<Badge tone="coral"><Video/> Recording on device</Badge>}
    {listening && <Badge tone="blue"><Mic/> Listening</Badge>}
    {speaking && <Badge tone="blue"><Volume2/> Speaking</Badge>}
    <Badge tone={LEVEL_TONE[level]}><ShieldAlert/> Status: {LEVEL_NAMES[level]}</Badge>
  </div>
}

export function ConversationPanel({ messages, onSend, onMic, listening, interim, thinking, canListen, companionName }) {
  const [text, setText] = useState('')
  const logRef = useRef(null)
  // Keep the newest message (and the live transcript) in view, as in any chat.
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [messages.length, listening, thinking])
  const submit = (e) => { e.preventDefault(); if (!text.trim()) return; onSend(text.trim()); setText('') }
  return <Card className="cmp-chat">
    <div className="card-head"><div><p className="eyebrow">YOUR COMPANION</p><h2>Talk with {companionName}</h2></div></div>
    <div className="cmp-log" aria-live="polite" ref={logRef}>
      {messages.length === 0 && <p className="cmp-hint">Press “Start AI care mode” and {companionName} will say hello. You can also tap the microphone or type below.</p>}
      {messages.map(m => <div key={m.id} className={`cmp-msg cmp-${m.role}`}><span>{m.role === 'ai' ? companionName : m.role === 'patient' ? 'You' : 'System'}</span><p>{m.text}</p></div>)}
      {thinking && <div className="cmp-msg cmp-ai cmp-thinking" role="status"><span>{companionName}</span><p>Thinking…</p></div>}
    </div>
    {listening && <p className="cmp-listening" role="status"><Mic/> Listening… {interim ? <b>“{interim}”</b> : 'speak now (English, Hindi or Tamil)'}</p>}
    <form className="cmp-input" onSubmit={submit}>
      <button type="button" className={`icon-btn ${listening ? 'cmp-mic-on' : ''}`} onClick={onMic} aria-label={canListen ? (listening ? 'Stop listening' : 'Speak to your companion') : 'Voice input needs Chrome or Edge'} title={canListen ? 'Speak to your companion' : 'Voice input needs Chrome or Edge'} disabled={!canListen}>{canListen ? <Mic/> : <MicOff/>}</button>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…" aria-label="Message to your companion"/>
      <button className="btn btn-primary" type="submit"><Send/> Send</button>
    </form>
  </Card>
}

export function VoicePanel({ voice, profile, setProfile, hasSample, recording, onRecord, onTest }) {
  const { voices } = voice
  return <Card className="cmp-voice">
    <div className="card-head"><div><p className="eyebrow">CHOOSE HOW IT SOUNDS</p><h2>Companion voice</h2></div></div>
    <div className="form-stack">
      <label>Companion name<input value={profile.companionName} maxLength="20" onChange={e => setProfile({ companionName: e.target.value || 'Asha' })}/></label>
      <label>Voice<select value={profile.voiceURI} onChange={e => setProfile({ voiceURI: e.target.value })}><option value="">Device default</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>
      <div className="form-grid"><label>Speed {profile.rate.toFixed(1)}×<input type="range" min="0.6" max="1.4" step="0.1" value={profile.rate} onChange={e => setProfile({ rate: Number(e.target.value) })}/></label><label>Pitch {profile.pitch.toFixed(1)}<input type="range" min="0.6" max="1.6" step="0.1" value={profile.pitch} onChange={e => setProfile({ pitch: Number(e.target.value) })}/></label></div>
      <label>I speak<select value={profile.lang} onChange={e => setProfile({ lang: e.target.value })}><option value="auto">Auto: English, Hindi or Tamil</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi (हिन्दी)</option><option value="ta-IN">Tamil (தமிழ்)</option><option value="en-US">English (US)</option></select></label>
      <div className="cmp-actions"><button className="btn btn-secondary" type="button" onClick={onTest}><Volume2/> Hear this voice</button><button className="btn btn-secondary" type="button" onClick={onRecord} disabled={recording}><Mic/> {recording ? 'Recording… speak now' : hasSample ? 'Re-record voice sample' : 'Record a voice sample'}</button></div>
      <p className="cmp-note">To teach {profile.companionName} how you normally sound, tap “Record a voice sample” and read aloud: <b>“{SAMPLE_PROMPT}”</b>. Later, a weak, shaky or very different voice makes {profile.companionName} check on you and, if worrying, alert your family and doctor. This compares your voice with your own usual voice; it does not identify who is speaking.</p>
      <p className="cmp-note">{voice.cloudVoice ? 'Voice cloning is connected: replies use the recorded sample.' : 'A recorded sample is stored on this device. To make replies sound like it, set VITE_TTS_ENDPOINT to a voice-cloning service; until then the closest installed voice is used.'}</p>
    </div>
  </Card>
}

const VOICE_TEXT = { normal: 'sounds normal', unusual: 'sounds a little different', concerning: 'sounds weak or unwell', unknown: 'too short to judge' }

export function ModelPanel({ llm, setLlm, status, onTest, classifier }) {
  const local = isLocalEndpoint(llm.endpoint)
  const statusText = status === 'testing' ? 'Testing…'
    : !status ? null
      : !status.ok ? status.error
        : status.hasModel ? `Connected. ${llm.model} is ready.`
          : `Connected, but ${llm.model} is not downloaded. Run: ollama pull ${llm.model}`
  return <Card className="cmp-model">
    <div className="card-head"><div><p className="eyebrow">THE BRAIN BEHIND THE CHAT</p><h2>Gemma 3 language model</h2></div><Badge tone={llm.enabled ? 'green' : 'neutral'}><Sparkles/> {llm.enabled ? 'On' : 'Off'}</Badge></div>
    <p className="cmp-classifier" role="status"><Activity/> Mood and situation model: {classifier && classifier.ok ? <b>fine-tuned model running ({classifier.model})</b> : classifier === null ? 'checking…' : <span>built-in model <small>(for higher accuracy run <code>python ml/serve.py</code>)</small></span>}</p>
    <p className="cmp-note">Gemma 3 (by Google) writes {`Asha's`} replies in the patient's own language and gives a second opinion on mood. Emergencies never wait for it: urgent and critical moments use fixed, tested replies, and Gemma can only raise concern, never lower it.</p>
    <div className="form-stack">
      <label className="checkbox-label"><input type="checkbox" checked={llm.enabled} onChange={e => setLlm({ enabled: e.target.checked })}/> Use Gemma 3 for conversation</label>
      <div className="form-grid">
        <label>Model<select value={['gemma3:1b', 'gemma3:4b', 'gemma3:12b'].includes(llm.model) ? llm.model : 'custom'} onChange={e => e.target.value !== 'custom' && setLlm({ model: e.target.value })}><option value="gemma3:4b">gemma3:4b (recommended)</option><option value="gemma3:1b">gemma3:1b (smallest, mostly English)</option><option value="gemma3:12b">gemma3:12b (best, needs ~12 GB)</option><option value="custom">Custom…</option></select></label>
        <label>Model name<input value={llm.model} onChange={e => setLlm({ model: e.target.value.trim() })}/></label>
      </div>
      <label>Server address<input value={llm.endpoint} onChange={e => setLlm({ endpoint: e.target.value.trim() })}/></label>
      {!local && <p className="form-error" role="alert">This address is not on this computer, so the patient's words would leave the device. Use it only with the patient's consent and a trusted, secured server.</p>}
      <div className="cmp-actions"><button className="btn btn-secondary" type="button" onClick={onTest}>Test connection</button>{statusText && <span className="cmp-test-result" role="status">{statusText}</span>}</div>
    </div>
    <p className="cmp-note">Set-up: install <b>Ollama</b> (ollama.com), run <code>ollama pull gemma3:4b</code>, and keep it running. This app forwards <code>/ollama</code> to it automatically. If the app is hosted elsewhere, start Ollama with <code>OLLAMA_ORIGINS</code> set to the app's address. If Gemma is off or slow, the built-in replies are used.</p>
  </Card>
}

export function UnderstandingPanel({ snapshot, events, camera, voiceCheck, baseline }) {
  const rows = [['Conditions', snapshot.conditions.join(', ') || 'None recorded'], ['Allergies', snapshot.allergies.join(', ') || 'None recorded'], ['Medicine adherence', `${snapshot.adherence}%`], ['Latest record', snapshot.latestRecord], ['Latest mood', snapshot.latestMood ? `${snapshot.latestMood.mood}${snapshot.latestMood.confidence ? ` (${Math.round(snapshot.latestMood.confidence * 100)}%)` : ''}` : 'Not heard yet'], ['Voice', voiceCheck ? `${VOICE_TEXT[voiceCheck.status]}${voiceCheck.reasons.length ? `: ${voiceCheck.reasons.join(', ')}` : ''}` : 'Not heard yet'], ['Voice baseline', baseline ? `learned from ${baseline.n} sample${baseline.n === 1 ? '' : 's'}` : 'Not recorded yet'], ['Mood trend', snapshot.moodTrend], ['Alerts in 24h', String(snapshot.alerts24h)]]
  return <Card className="cmp-profile">
    <div className="card-head"><div><p className="eyebrow">WHAT THE AI KNOWS</p><h2>Patient understanding</h2></div><Badge tone="mint"><Activity/> Auto-updated</Badge></div>
    <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <p className="eyebrow cmp-sub">Recent AI decisions</p>
    {events.length === 0 ? <p className="cmp-hint">Nothing unusual so far.</p> : <ul className="cmp-events">{events.slice(0, 5).map(e => <li key={e.id}><Badge tone={LEVEL_TONE[e.level]}>{LEVEL_NAMES[e.level]}</Badge><span>{e.reasons.join(', ')}</span><small>{new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></li>)}</ul>}
    <p className="cmp-note">Camera: {camera}. Records, medicines and conversation are combined to decide when to alert family or the hospital.</p>
  </Card>
}

export function RelayPanel({ queue, online, simulateOffline, setSimulateOffline, contacts, onSpeak }) {
  return <Card className="cmp-relay">
    <div className="card-head"><div><p className="eyebrow">NO INTERNET? STILL REACHABLE</p><h2>Offline USSD relay</h2></div><Badge tone={online ? 'green' : 'coral'}>{online ? 'Internet available' : 'Offline mode'}</Badge></div>
    <p className="cmp-note">With no internet, the AI dials the USSD code <code>*123*…#</code> (patient ID, urgency, reasons) over the mobile network and reads out a full briefing for the responder. A browser cannot dial silently, so on a phone the dialler opens ready to send; tap Call. Queued alerts also send automatically when the internet returns.</p>
    <button className="btn btn-secondary" type="button" onClick={() => setSimulateOffline(!simulateOffline)}>{online ? <WifiOff/> : <Wifi/>} {simulateOffline ? 'Restore internet (demo)' : 'Simulate no internet (demo)'}</button>
    {queue.length === 0 ? <p className="cmp-hint">No relay messages yet. Confirmed abnormal events and critical situations are sent to the medical department automatically.</p>
      : <ul className="cmp-relay-list">{queue.slice(0, 5).map((i, idx) => <li key={i.id}>
        <div><Badge tone={i.status === 'sent' ? 'green' : 'gold'}>{i.status === 'sent' ? `Sent · ${i.via}` : 'Queued'}</Badge><code>{i.ussd}</code><small>{i.reasons.join(', ')} · {new Date(i.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small>{i.briefing && <p className="cmp-brief">{i.briefing}</p>}</div>
        <div className="cmp-actions">
          {i.status === 'queued' && <a className="btn btn-primary" href={ussdDialHref(i.ussd)}><PhoneCall/> Dial *123 USSD</a>}
          {i.status === 'queued' && <a className="btn btn-secondary" href={smsHref(USSD_CONFIG.smsFallbackNumber, i.sms)}><Smartphone/> SMS hospital</a>}
          {idx === 0 && contacts.map(c => <a key={c.id} className="btn btn-secondary" href={smsHref(c.phone, i.briefing || i.sms)}><Smartphone/> Text {c.name}</a>)}
          {i.briefing && <button className="btn btn-secondary" type="button" onClick={() => onSpeak(i.briefing)}><Volume2/> Read briefing aloud</button>}
        </div>
      </li>)}</ul>}
    <p className="cmp-note"><Heart/> The <code>123</code> gateway code and desk number are in <code>ussd.js</code>; replace them with the hospital's real USSD service.</p>
  </Card>
}
