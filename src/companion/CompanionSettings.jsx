import React, { useState } from 'react'
import { BellRing, Brain, Camera, CheckCircle2, Database, HeartHandshake, Lock, PhoneCall, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge, Card, Empty, PageTitle } from '../ui'
import { EMERGENCY_NUMBERS, EMPTY_COMPANION, mergeProfile } from './config'
import { datasetSummary, RESPONSE_REPLAY_DATASET } from './trainingData'

const Toggle = ({ checked, onChange, title, text, disabled = false }) => <label className={`cmp-setting-toggle ${disabled ? 'disabled' : ''}`}>
  <span><b>{title}</b><small>{text}</small></span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled}/>
</label>

export default function CompanionSettingsPage({ data, setData, patients, notify }) {
  const patient = patients[0]
  const [confirmClear, setConfirmClear] = useState(false)
  const summary = datasetSummary()
  if (!patient) return <Empty title="No linked patient" text="Companion settings need a linked patient account."/>
  const stored = { ...EMPTY_COMPANION, ...data.companion?.[patient.id] }
  const profile = mergeProfile(stored.profile)
  const approvedFamily = patient.familyLinks.filter(link => link.status === 'approved').map(link => data.users.find(person => person.id === link.userId)).filter(person => person?.phone).map(person => ({ id: person.id, name: person.name, role: 'family', phone: person.phone }))
  const careContacts = [...approvedFamily, ...profile.contacts]
  const update = fn => setData(current => ({ ...current, companion: { ...current.companion, [patient.id]: fn({ ...EMPTY_COMPANION, ...current.companion?.[patient.id] }) } }))
  const setProfile = patch => update(companion => ({ ...companion, profile: { ...mergeProfile(companion.profile), ...patch } }))
  const clearMemory = () => {
    update(companion => ({ ...companion, memory: [], learning: EMPTY_COMPANION.learning }))
    setConfirmClear(false)
    notify('30-day companion memory cleared')
  }
  const favourite = careContacts.find(contact => contact.id === profile.favouriteContactId) || careContacts[0]
  return <>
    <PageTitle eyebrow="AI COMPANION · SETTINGS" title="Your care, your boundaries." text="Choose what Asha may remember, which records shape replies, who receives urgent alerts, and whether safety sensors may ever turn on."/>
    <div className="cmp-settings-grid">
      <Card className="cmp-settings-card"><div className="card-head"><div><p className="eyebrow">MEMORY & PERSONALISATION</p><h2>30-day secondary memory</h2></div><Badge tone="mint"><Brain/> Patient-specific</Badge></div>
        <p className="cmp-note cmp-lead"><Database/> Conversation history stays in this browser demo for up to 30 days, then expires automatically. It is not a clinical record or cloud backup.</p>
        <div className="cmp-setting-list">
          <Toggle checked={profile.memoryEnabled} onChange={memoryEnabled => setProfile({ memoryEnabled })} title="Remember conversations for 30 days" text="Use recent context so the companion does not repeatedly ask or say the same thing."/>
          <Toggle checked={profile.adaptiveTone} onChange={adaptiveTone => setProfile({ adaptiveTone })} title="Adapt communication style" text="Learn whether this patient responds better to gentle, brief, or grounding replies."/>
          <Toggle checked={profile.avoidRepetition} onChange={avoidRepetition => setProfile({ avoidRepetition })} title="Avoid repeated replies" text="Compare each answer with the last six AI messages before speaking."/>
          <Toggle checked={profile.useRecordContext} onChange={useRecordContext => setProfile({ useRecordContext })} title="Use health-record context" text="Use recorded conditions, allergies, medicines and report summaries—never to diagnose or change a dose."/>
        </div>
        <div className="cmp-memory-foot"><span><b>{stored.memory?.length || 0}</b><small>saved chat messages</small></span><span><b>30 days</b><small>automatic retention</small></span><button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(true)}><Trash2/> Clear memory</button></div>
        {confirmClear && <div className="cmp-confirm" role="alert"><p><b>Clear companion memory?</b><small>This removes the saved chat and learned reply feedback for this patient on this device.</small></p><button className="btn btn-danger" type="button" onClick={clearMemory}>Yes, clear it</button><button className="btn btn-secondary" type="button" onClick={() => setConfirmClear(false)}>Cancel</button></div>}
      </Card>
      <Card className="cmp-settings-card"><div className="card-head"><div><p className="eyebrow">CONSENT & ESCALATION</p><h2>Safety permissions</h2></div><Badge tone="green"><Lock/> Explicit consent</Badge></div>
        <div className="cmp-setting-list">
          <Toggle checked={profile.caregiverEscalationConsent} onChange={caregiverEscalationConsent => setProfile({ caregiverEscalationConsent })} title="Alert my approved care circle" text="For urgent wellbeing signals, create an in-app alert for approved family and assigned clinicians."/>
          <Toggle checked={profile.sensorEscalationConsent} onChange={sensorEscalationConsent => setProfile({ sensorEscalationConsent })} title="Allow safety sensors after no reply" text="Thermal monitoring may run in AI care mode; CCTV may open only to verify an abnormal thermal event. Nothing activates silently without this setting."/>
        </div>
        <label className="cmp-select-label">Favourite emergency contact<select value={profile.favouriteContactId} onChange={event => setProfile({ favouriteContactId: event.target.value })}><option value="">Choose a care contact</option>{careContacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}</select></label>
        <p className="cmp-note"><HeartHandshake/> {favourite ? `${favourite.name} is the first person shown for panic support.` : 'Add a care contact in AI Companion, then choose the favourite person here.'}</p>
      </Card>
      <Card className="cmp-settings-card"><div className="card-head"><div><p className="eyebrow">EMERGENCY HELP</p><h2>Verified, user-confirmed calls</h2></div><Badge tone="coral"><BellRing/> India</Badge></div>
        <p className="cmp-note">CareBridge prepares the patient briefing and alerts the demo care team. A real phone call always needs the patient or helper to tap the call button—this web app never silently dials or pretends a call was completed.</p>
        <div className="cmp-emergency-actions"><a className="btn btn-danger" href={`tel:${EMERGENCY_NUMBERS.india}`}><PhoneCall/> Call emergency {EMERGENCY_NUMBERS.india}</a><a className="btn btn-secondary" href={`tel:${EMERGENCY_NUMBERS.teleManas}`}><PhoneCall/> Call Tele-MANAS {EMERGENCY_NUMBERS.teleManas}</a></div>
        <p className="cmp-note"><ShieldCheck/> <code>*123#</code> is not treated as a verified national medical emergency number. It remains only a configurable fictional hospital relay in this demo.</p>
      </Card>
      <Card className="cmp-settings-card"><div className="card-head"><div><p className="eyebrow">RESPONSE QUALITY LAB</p><h2>Replay dataset</h2></div><Badge tone="blue"><CheckCircle2/> {RESPONSE_REPLAY_DATASET.length} reviewed cases</Badge></div>
        <p className="cmp-note">Bad replies are paired with safer, calmer replacements covering anger, repetition, panic, loneliness, privacy refusal, emergencies, medication boundaries and confusion.</p>
        <div className="cmp-dataset-tags">{Object.keys(summary).map(category => <Badge key={category} tone="neutral">{category}</Badge>)}</div>
        <details className="cmp-dataset-preview"><summary><RotateCcw/> View replay examples</summary>{RESPONSE_REPLAY_DATASET.slice(0, 4).map(item => <article key={item.id}><b>{item.trigger}</b><small>Replace: “{item.poorReply}”</small><p>{item.betterReply}</p></article>)}</details>
      </Card>
    </div>
  </>
}
