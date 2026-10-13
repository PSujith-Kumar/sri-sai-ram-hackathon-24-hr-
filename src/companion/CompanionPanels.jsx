import React, { useState } from 'react'
import { Activity, Camera, CameraOff, Flame, Heart, Mic, MicOff, PhoneCall, Radio, Send, ShieldAlert, Smartphone, Video, Volume2, Wifi, WifiOff } from 'lucide-react'
import { Badge, Card } from '../ui'
import { LEVEL_NAMES } from './brain'
import { USSD_CONFIG, smsHref, ussdDialHref } from './ussd'

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

export function ConversationPanel({ messages, onSend, onMic, listening, canListen, companionName }) {
  const [text, setText] = useState('')
  const submit = (e) => { e.preventDefault(); if (!text.trim()) return; onSend(text.trim()); setText('') }
  return <Card className="cmp-chat">
    <div className="card-head"><div><p className="eyebrow">YOUR COMPANION</p><h2>Talk with {companionName}</h2></div></div>
    <div className="cmp-log" aria-live="polite">
      {messages.length === 0 && <p className="cmp-hint">Press “Start AI care mode” and {companionName} will say hello. You can also tap the microphone or type below.</p>}
      {messages.map(m => <div key={m.id} className={`cmp-msg cmp-${m.role}`}><span>{m.role === 'ai' ? companionName : m.role === 'patient' ? 'You' : 'System'}</span><p>{m.text}</p></div>)}
    </div>
    <form className="cmp-input" onSubmit={submit}>
      <button type="button" className={`icon-btn ${listening ? 'cmp-mic-on' : ''}`} onClick={onMic} aria-label={canListen ? 'Speak to your companion' : 'Voice input not supported in this browser'} disabled={!canListen}>{canListen ? <Mic/> : <MicOff/>}</button>
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
      <label>Language<select value={profile.lang} onChange={e => setProfile({ lang: e.target.value })}><option value="en-IN">English (India)</option><option value="ta-IN">Tamil</option><option value="hi-IN">Hindi</option><option value="en-US">English (US)</option></select></label>
      <div className="cmp-actions"><button className="btn btn-secondary" type="button" onClick={onTest}><Volume2/> Hear this voice</button><button className="btn btn-secondary" type="button" onClick={onRecord} disabled={recording}><Mic/> {recording ? 'Recording… speak now' : hasSample ? 'Re-record voice sample' : 'Record a voice sample'}</button></div>
      <p className="cmp-note">{voice.cloudVoice ? 'Voice cloning is connected: replies use the recorded sample.' : 'A recorded sample is stored on this device. To make replies sound like it, set VITE_TTS_ENDPOINT to a voice-cloning service; until then the closest installed voice is used.'}</p>
    </div>
  </Card>
}

export function UnderstandingPanel({ snapshot, events, camera }) {
  const rows = [['Conditions', snapshot.conditions.join(', ') || 'None recorded'], ['Allergies', snapshot.allergies.join(', ') || 'None recorded'], ['Medicine adherence', `${snapshot.adherence}%`], ['Latest record', snapshot.latestRecord], ['Mood trend', snapshot.moodTrend], ['Alerts in 24h', String(snapshot.alerts24h)]]
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
