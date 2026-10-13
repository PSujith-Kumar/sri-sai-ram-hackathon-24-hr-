import React, { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Eye, EyeOff, Flame, Lock, Plus, ShieldCheck, Trash2, UserPlus, Video } from 'lucide-react'
import { Badge, Card } from '../ui'
import { GUARD_MODE } from './privacy'
import { SCENARIOS } from './thermal'

const SENSOR_LABEL = { off: 'Sensor off', connecting: 'Connecting…', live: 'Watching', unavailable: 'Sensor unavailable' }
const SCENARIO_LABEL = { normal: 'Normal', fever: 'High temperature', fall: 'Fall', still: 'Very still', absent: 'Nobody in room', heat: 'Heat hazard' }
const MODE_COPY = {
  [GUARD_MODE.thermal]: { tone: 'green', icon: <EyeOff/>, title: 'Privacy mode', text: 'CCTV is off. Only the thermal sensor is watching. It sees heat shapes, never faces, and nothing is recorded.' },
  [GUARD_MODE.verifying]: { tone: 'gold', icon: <Eye/>, title: 'Live safety check', text: 'Something unusual (the thermal sensor, or a change in your voice or words) switched the camera on for a live look. Nothing is being recorded or shared.' },
  [GUARD_MODE.recording]: { tone: 'coral', icon: <Video/>, title: 'Abnormal event confirmed', text: 'Recording on this device only, and your family, doctor and caretaker have been alerted.' },
}

function Heatmap({ frame }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !frame) return
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(frame.width, frame.height)
    frame.temps.forEach((t, i) => {
      const k = Math.max(0, Math.min(1, (t - 20) / 20)) // 20–40 °C
      img.data.set([Math.round(255 * Math.min(1, k * 2)), Math.round(255 * Math.max(0, k * 2 - 1)), Math.round(120 * (1 - k)), 255], i * 4)
    })
    ctx.putImageData(img, 0, 0)
  }, [frame])
  return <canvas ref={ref} width={frame?.width || 32} height={frame?.height || 24} className="cmp-heat" aria-label="Thermal heat map"/>
}

export function PrivacyPanel({ guard, thermal, cctv, profile, setThermalSource, scenario, setScenario, sensorLoss, setSensorLoss }) {
  const copy = MODE_COPY[guard.mode]
  const src = profile.thermal
  const kind = src.cctvKind
  return <Card className="cmp-camera">
    <div className="card-head"><div><p className="eyebrow">PRIVACY-FIRST WATCH</p><h2>Thermal sensor and CCTV</h2></div><Badge tone={copy.tone}>{copy.icon} {copy.title}</Badge></div>
    <p className="cmp-note cmp-lead"><Lock/> {!profile.sensorEscalationConsent ? 'Safety-sensor consent is off. Thermal and CCTV remain off; Asha uses voice check-ins and approved care-circle alerts instead.' : thermal.status === 'off' && src.kind === 'phone' && src.alwaysOn ? 'The thermal phone starts watching heat shapes when AI care mode is on. The camera phone stays off until a change in your voice, your words or the thermal watch calls for a live look.' : thermal.status === 'off' ? 'Safety sensors are approved but remain off. Thermal starts only after an unanswered check-in; CCTV still requires an abnormal thermal event.' : copy.text}</p>
    <div className="cmp-cams">
      <figure><div className="cmp-video cmp-thermalbox">{thermal.frame ? <Heatmap frame={thermal.frame}/> : <div className="cmp-video-off"><Flame/><b>{SENSOR_LABEL[thermal.status]}</b></div>}</div><figcaption><Flame/> Thermal · {SENSOR_LABEL[thermal.status]}{thermal.analysis?.presence && ` · skin ${thermal.analysis.skinTop}°C · ${thermal.analysis.posture}`}</figcaption></figure>
      <figure><div className="cmp-video">
        <video ref={cctv.videoRef} muted playsInline className={kind === 'webcam' && cctv.status === 'live' ? '' : 'cmp-hidden'}/>
        {kind === 'ip' && src.cctvUrl && cctv.on && <img ref={cctv.imgRef} src={src.cctvUrl} crossOrigin="anonymous" alt="IP camera feed" {...cctv.ipHandlers}/>}
        {kind === 'phone' && cctv.on && <img ref={cctv.imgRef} className={cctv.status === 'live' ? '' : 'cmp-hidden'} alt="Camera phone picture"/>}
        {!(cctv.on && cctv.status === 'live') && <div className="cmp-video-off"><CameraOff/><b>{cctv.on ? SENSOR_LABEL[cctv.status] : 'CCTV off'}</b><small>{cctv.on ? 'Opening the camera… if it cannot open, voice check-ins are used.' : 'Stays off until needed.'}</small></div>}
      </div><figcaption>{cctv.on ? <Camera/> : <CameraOff/>} CCTV · {cctv.on ? 'on for a live check' : 'off'}</figcaption></figure>
    </div>
    {thermal.active.length > 0 && <p className="cmp-note"><b>Thermal sensor reports:</b> {thermal.active.join(', ')}</p>}
    <div className="form-stack cmp-form">
      <div className="form-grid">
        <label>Thermal camera<select value={src.kind} onChange={e => setThermalSource({ kind: e.target.value })}><option value="sim">Built-in simulator (no hardware)</option><option value="http">Thermal camera gateway (HTTP JSON)</option><option value="phone">Thermal phone (see Phone cameras)</option></select></label>
        <label>Gateway URL<input value={src.url} disabled={src.kind !== 'http'} placeholder="http://192.168.1.30/frame.json" onChange={e => setThermalSource({ url: e.target.value })}/></label>
      </div>
      <div className="form-grid">
        <label>CCTV type<select value={kind} onChange={e => setThermalSource({ cctvKind: e.target.value })}><option value="webcam">This device’s camera</option><option value="ip">IP / CCTV camera (MJPEG URL)</option><option value="phone">Camera phone (switches on only when needed)</option></select></label>
        <label>CCTV stream URL<input value={src.cctvUrl} disabled={kind !== 'ip'} placeholder="http://192.168.1.20/video.mjpg" onChange={e => setThermalSource({ cctvUrl: e.target.value })}/></label>
      </div>
    </div>
    <div className="cmp-demo"><b>Demo: thermal sensor</b>{SCENARIOS.map(s => <button key={s} type="button" disabled={!profile.sensorEscalationConsent} className={`btn btn-secondary ${scenario === s ? 'cmp-on' : ''}`} onClick={() => setScenario(s)}>{SCENARIO_LABEL[s]}</button>)}<button className="btn btn-secondary" disabled={!profile.sensorEscalationConsent} type="button" onClick={() => setSensorLoss(!sensorLoss)}>{sensorLoss ? 'Restore sensor' : 'Simulate sensor loss'}</button></div>
    {!profile.sensorEscalationConsent && <p className="cmp-consent-note"><ShieldCheck/> Enable “Allow safety sensors after no reply” in AI &amp; privacy settings before running sensor demos.</p>}
    <p className="cmp-note"><ShieldCheck/> Nothing is saved or shared unless something abnormal is confirmed. A thermal gateway should return JSON like <code>{'{"width":32,"height":24,"temps":[…°C]}'}</code>. Temperature flags are screening hints, not a diagnosis.</p>
  </Card>
}

export function ContactsPanel({ contacts, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('caretaker')
  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    onAdd({ name: name.trim(), phone: phone.trim(), role })
    setName(''); setPhone('')
  }
  return <Card className="cmp-contacts">
    <div className="card-head"><div><p className="eyebrow">WHO GETS ALERTED</p><h2>Care contacts</h2></div><Badge tone="mint"><UserPlus/> Optional</Badge></div>
    <p className="cmp-note">Your approved family and doctor are alerted automatically. Add a caretaker or extra family number if you have one, so they get a text with the full details too.</p>
    {contacts.length > 0 && <ul className="cmp-contact-list">{contacts.map(c => <li key={c.id}><span><b>{c.name}</b><small>{c.role} · {c.phone}</small></span><button className="icon-btn" type="button" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c.id)}><Trash2/></button></li>)}</ul>}
    <form className="form-stack cmp-form" onSubmit={submit}>
      <div className="form-grid"><label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lakshmi"/></label><label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+91…"/></label></div>
      <label>Role<select value={role} onChange={e => setRole(e.target.value)}><option value="caretaker">Caretaker</option><option value="family">Family</option></select></label>
      <button className="btn btn-secondary" type="submit"><Plus/> Add contact</button>
    </form>
  </Card>
}

export function ClipsPanel({ clips, onDelete }) {
  const [openId, setOpenId] = useState(null)
  const [url, setUrl] = useState('')
  useEffect(() => {
    const clip = clips.find(c => c.id === openId)
    if (!clip) { setUrl(''); return undefined }
    const u = URL.createObjectURL(clip.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [openId, clips])
  return <Card className="cmp-clips">
    <div className="card-head"><div><p className="eyebrow">STORED ON THIS DEVICE ONLY</p><h2>Incident clips</h2></div><Badge tone="neutral"><Lock/> Never uploaded</Badge></div>
    {clips.length === 0 ? <p className="cmp-hint">No clips. Nothing is recorded unless an abnormal event is confirmed. Clips are deleted after 7 days.</p>
      : <ul className="cmp-contact-list">{clips.map(c => <li key={c.id}><span><b>{(c.reasons || []).join(', ') || 'Safety event'}</b><small>{new Date(c.at).toLocaleString('en-IN')}</small></span><span className="cmp-actions"><button className="btn btn-secondary" type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? 'Hide' : 'Play'}</button><button className="icon-btn" type="button" aria-label="Delete clip" onClick={() => onDelete(c.id)}><Trash2/></button></span></li>)}</ul>}
    {url && <video src={url} controls className="cmp-clip-video"/>}
  </Card>
}
