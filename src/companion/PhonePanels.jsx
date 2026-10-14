import React, { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Camera, Copy, Flame, Lock, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge, Card } from '../ui'
import { describeNode, pairingLinks } from './phoneLink'

function Qr({ text, label }) {
  const svg = useMemo(() => {
    try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) } catch { return '' }
  }, [text])
  // the SVG is produced by the QR library from our own link text, never from outside input
  return svg ? <div className="cmp-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }}/> : <div className="cmp-qr cmp-qr-empty">QR code unavailable. Type the link instead.</div>
}

function PhoneCard({ role, url, node }) {
  const [copied, setCopied] = useState(false)
  const state = describeNode(node, role)
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {}) }
  const title = role === 'thermal' ? 'Thermal phone' : 'Camera phone'
  return <figure className="cmp-phone">
    <figcaption>{role === 'thermal' ? <Flame/> : <Camera/>} <b>{title}</b><Badge tone={state.tone}>{node?.connected ? 'Connected' : 'Not connected'}</Badge></figcaption>
    <Qr text={url} label={`QR code for the ${title.toLowerCase()}`}/>
    <p className="cmp-phone-status" role="status">{state.text}</p>
    <div className="cmp-phone-link"><input readOnly value={url} aria-label={`${title} link`} onFocus={(e) => e.target.select()}/><button className="icon-btn" type="button" onClick={copy} aria-label={`Copy the ${title.toLowerCase()} link`} title="Copy link"><Copy/></button></div>
    {copied && <small>Copied</small>}
  </figure>
}

/** Setup and status for the two phones: a thermal phone and a camera phone linked over USB tethering or Wi-Fi. */
export function PhonePanel({ link, profile, setThermalSource, setSensorTestMode, setVision, llmOn, visionNote, onTestCamera, testing }) {
  const links = pairingLinks(link.info, link.token)
  const [chosen, setChosen] = useState('')
  const preferred = links.find((l) => /tethering|hotspot|iPhone/.test(l.hint)) || links[0]
  const current = links.find((l) => l.address === chosen) || preferred
  const usingPhones = profile.thermal.kind === 'phone' && profile.thermal.cctvKind === 'phone'
  const connected = ['thermal', 'normal'].filter((role) => link.status?.[role]?.connected).length

  return <Card className="cmp-phones">
    <div className="card-head"><div><p className="eyebrow">TWO PHONES, ONE PRIVATE WATCH</p><h2>Phone cameras</h2></div><Badge tone={connected === 2 ? 'green' : connected ? 'gold' : 'neutral'}><Smartphone/> {connected} of 2 connected</Badge></div>
    <p className="cmp-note cmp-lead"><Lock/> The thermal phone watches heat shapes only. The camera phone stays off and its screen black until the AI hears a change in your voice or sees something unusual. It switches off again by itself, and you can pause or disconnect either phone at any time.</p>

    {link.available === false && <p className="form-error" role="alert">The phone link is not running. Start the app with <code>npm run dev</code> on this computer. A hosted copy of the site cannot reach your phones.</p>}
    {link.available === null && <p className="cmp-hint">Checking the phone link…</p>}

    {link.available && <>
      <ol className="cmp-steps">
        <li>Plug each phone into this computer with a USB cable and turn on <b>USB tethering</b> (Android: Settings → Network → Hotspot &amp; tethering). Wi-Fi works too.</li>
        <li>Choose below the address on the same network as that phone, then scan its QR code with the phone (or copy the link into the phone browser).</li>
        <li>The browser warns the page is “not private”: tap <b>Advanced → Proceed</b> once. It is this computer.</li>
        <li>Tap <b>Start</b> on the phone page and allow the camera. Keep the screen on and the phone plugged in.</li>
      </ol>

      {links.length === 0
        ? <p className="cmp-note">No phone network found yet. Connect a phone with USB tethering, or join this computer’s Wi-Fi; this card updates by itself.</p>
        : <>
          <label>This computer’s address on the phone’s network
            <select value={current?.address || ''} onChange={(e) => setChosen(e.target.value)}>{links.map((l) => <option key={l.address} value={l.address}>{l.address} · {l.name} · {l.hint}</option>)}</select>
          </label>
          <div className="cmp-phone-grid">
            <PhoneCard role="thermal" url={current.thermal} node={link.status?.thermal}/>
            <PhoneCard role="normal" url={current.normal} node={link.status?.normal}/>
          </div>
          {link.info?.tls && link.info.fingerprint && <p className="cmp-note"><ShieldCheck/> To be sure the phone reached this computer, its certificate fingerprint starts with <code>{link.info.fingerprint.slice(0, 23)}</code>.</p>}
          {link.info && !link.info.tls && <p className="form-error" role="alert">{link.info.note || 'No certificate could be made, so phones cannot open their camera.'}</p>}
        </>}

      <div className="form-stack cmp-form">
        <label className="checkbox-label"><input type="checkbox" checked={usingPhones} onChange={(e) => { const enabled = e.target.checked; setThermalSource(enabled ? { kind: 'phone', cctvKind: 'phone', alwaysOn: true } : { kind: 'sim', cctvKind: 'webcam' }); if (enabled) setSensorTestMode(true) }}/> Use these two phones as my sensors (instead of the simulator and this computer’s camera)</label>
        <label className="checkbox-label"><input type="checkbox" checked={profile.thermal.alwaysOn} onChange={(e) => setThermalSource({ alwaysOn: e.target.checked })} disabled={!usingPhones}/> Keep the thermal phone watching while AI care mode is on (it sees heat shapes only)</label>
        <label className="checkbox-label"><input type="checkbox" checked={profile.vision.enabled} onChange={(e) => setVision({ enabled: e.target.checked })}/> Let Gemma 3 look at the camera picture when it is on {!llmOn && <small>(turn on “Use Gemma 3” first)</small>}</label>
        {!profile.sensorEscalationConsent && <p className="cmp-consent-note"><ShieldCheck/> Enable “Allow safety sensors after no reply” in AI &amp; privacy settings first. Until then the phones stay idle.</p>}
        <div className="cmp-actions">
          <button className="btn btn-secondary" type="button" onClick={onTestCamera} disabled={!usingPhones || !link.status?.normal?.connected || testing}><Camera/> {testing ? 'Camera on for the test…' : 'Test camera phone (20 s)'}</button>
          <button className="btn btn-secondary" type="button" onClick={link.reset}><RefreshCw/> New pairing (old links stop working)</button>
        </div>
      </div>

      {visionNote && <p className="cmp-note" role="status"><b>Last Gemma 3 camera check</b> · {new Date(visionNote.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}: {visionNote.text}</p>}

      <details className="cmp-help">
        <summary>The phone cannot open the page, or two phones clash</summary>
        <ul>
          <li><b>Windows Firewall:</b> allow the port once. In PowerShell run as administrator: <code>netsh advfirewall firewall add rule name="CareBridge phone link" dir=in action=allow protocol=TCP localport=8443</code>. Tethering networks are often marked “Public”, which blocks by default.</li>
          <li><b>Two USB-tethered phones</b> may both pick the same address range (usually 192.168.42.x) and confuse each other. Tether one by USB and put the other on the same Wi-Fi, or switch one to a Wi-Fi hotspot.</li>
          <li><b>No thermal attachment?</b> On the thermal phone choose “Silhouette”: any camera, no faces, a coarse moving shape only. Real temperatures need a thermal camera the browser can open; temperature flags are screening hints, not a diagnosis.</li>
          <li><b>Pictures only when needed:</b> the camera phone sends nothing and keeps its camera closed until this app asks, and if this app closes, it switches off within seconds.</li>
        </ul>
      </details>
    </>}
  </Card>
}
