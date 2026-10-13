import React from 'react'
import { Bell, Check, HeartHandshake, LockKeyhole, ShieldCheck, Stethoscope } from 'lucide-react'
import { Badge, Card, Empty, PageTitle } from '../ui'
import { Avatar, classNames } from '../shared'
import { FAMILY_PERMISSIONS, acknowledgeRequest, familyLink, sendCareRequest, setFamilyAccess, setFamilyPermission } from '../careCircle'

const firstName = (user) => String(user?.name || 'the patient').split(' ')[0]

/** Apply a pure care operation to the latest data, and say what happened. */
const useCareAction = (data, setData, notify) => (operation, success) => {
  const check = operation(data)
  if (!check.ok) { notify(check.message, { persist: false }); return false }
  setData(current => { const r = operation(current); return r.ok ? r.data : current })
  if (success) notify(success, { persist: false })
  return true
}

/** The patient's team, and the patient's control over what each family member can see. */
export function CareTeamPage({ data, setData, user, patients, notify }) {
  const act = useCareAction(data, setData, notify)
  const p = patients[0]
  if (!p) return <Empty title="No patient record" text="Your account is not linked to a patient record yet."/>
  const pu = data.users.find(u => u.id === p.userId)
  const isPatient = p.userId === user.id
  return <>
    <PageTitle eyebrow="MY CARE TEAM" title="The people connected to your care." text="Assignments and family access are visible so you always know who can see what."/>
    <div className="team-layout">
      <Card className="team-primary"><p className="eyebrow">PATIENT</p><Avatar user={pu} size="lg"/><h2>{pu.name}</h2><p>{p.mrn} · {p.bloodGroup}</p><Badge tone="green"><ShieldCheck/> Account owner</Badge></Card>
      {p.doctorIds.length === 0 && <Card className="team-person"><span className="round-icon"><Stethoscope/></span><p className="eyebrow">ASSIGNED DOCTOR</p><h2>Not assigned yet</h2><p>The hospital will assign a doctor to you.</p></Card>}
      {p.doctorIds.map(id => { const d = data.users.find(u => u.id === id); return d && <Card className="team-person" key={id}><span className="round-icon"><Stethoscope/></span><Avatar user={d} size="lg"/><p className="eyebrow">ASSIGNED DOCTOR</p><h2>{d.name}</h2><p>{d.specialization}</p><Badge tone="blue">Clinical access</Badge></Card> })}
      {p.familyLinks.map(l => {
        const f = data.users.find(u => u.id === l.userId)
        if (!f) return null
        const approved = l.status === 'approved'
        return <Card className={classNames('team-person', 'family-access', !approved && 'family-access-off')} key={l.userId}>
          <span className="round-icon"><HeartHandshake/></span><Avatar user={f} size="lg"/><p className="eyebrow">FAMILY · {l.relationship.toUpperCase()}</p><h2>{f.name}</h2>
          <Badge tone={approved ? 'green' : 'coral'}>{approved ? `${l.permissions.length} permissions` : 'Access stopped'}</Badge>
          {isPatient && <>
            <fieldset className="permission-list" disabled={!approved}><legend>They can see</legend>
              {FAMILY_PERMISSIONS.map(([id, label]) => <label className="checkbox-label" key={id}><input type="checkbox" checked={l.permissions.includes(id)} onChange={e => act((d) => setFamilyPermission(d, p.id, l.userId, id, e.target.checked, user))}/> {label}</label>)}
            </fieldset>
            <button className={approved ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => act((d) => setFamilyAccess(d, p.id, l.userId, !approved, user), approved ? `${f.name} can no longer see your care` : `${f.name} can see your care again`)}>{approved ? 'Stop sharing' : 'Share again'}</button>
          </>}
        </Card>
      })}
    </div>
    <Card className="permission-summary"><LockKeyhole/><div><h2>Your journal always stays private.</h2><p>Family access covers only the items you approve. MindMate journal entries are never included in caregiver access.</p></div></Card>
  </>
}

/** Check-ins from the patient, and the family's acknowledgements. */
export function CareCirclePage({ data, setData, user, patients, notify }) {
  const act = useCareAction(data, setData, notify)
  const p = patients[0]
  if (!p) return <Empty title="Nothing to show" text="No patient is linked to your account."/>
  const isFamily = user.role === 'family'
  const pu = data.users.find(u => u.id === p.userId)
  const requests = data.careRequests.filter(r => r.patientId === p.id)
  const circle = p.familyLinks.filter(l => l.status === 'approved' && l.permissions.includes('care')).map(l => data.users.find(u => u.id === l.userId)).filter(Boolean)
  const send = (text, priority) => act((d) => sendCareRequest(d, p.id, text, priority), circle.length ? 'Update sent to your family' : 'Update saved. No family member is connected to receive it yet.')
  const mayAcknowledge = isFamily && familyLink(p, user.id)?.permissions.includes('care')
  const names = circle.map(f => f.name.split(' ')[0]).join(' and ')
  return <>
    <PageTitle eyebrow="CARECIRCLE" title={isFamily ? `Care updates from ${firstName(pu)}` : 'Your trusted family connection'} text={isFamily ? `Acknowledge updates so ${firstName(pu)} knows you have seen them.` : 'Send a check-in only to the family members you approved.'}/>
    {!isFamily && <Card className="care-actions"><div><p className="eyebrow">QUICK CHECK-IN</p><h2>How are you right now?</h2><p>{circle.length ? `These updates go to ${names}. Urgent ones also reach your doctor.` : 'No family member is connected yet. Urgent requests still reach your doctor.'}</p></div><div>
      <button onClick={() => send('I’m okay', 'normal')}><Check/><span><b>I’m okay</b><small>Send a reassuring update</small></span></button>
      <button onClick={() => send('Please call me', 'medium')}><HeartHandshake/><span><b>Please call me</b><small>{circle.length ? `Ask ${names} to get in touch` : 'Ask your family to get in touch'}</small></span></button>
      <button className="urgent" onClick={() => send('I need help', 'high')}><Bell/><span><b>I need help</b><small>Send a high-priority request</small></span></button>
    </div></Card>}
    <Card><div className="card-head"><div><p className="eyebrow">SHARED ACTIVITY</p><h2>Care timeline</h2></div><Badge tone="green"><LockKeyhole/> Relationship protected</Badge></div><div className="care-timeline">{requests.length ? requests.map(r => <article key={r.id}><span className={classNames('timeline-dot', r.priority === 'high' && 'urgent')}></span><div><h3>{r.text}</h3><p>{new Date(r.createdAt).toLocaleString('en-IN')} · {r.priority} priority{r.status === 'acknowledged' && r.acknowledgedBy ? ` · seen by ${data.users.find(u => u.id === r.acknowledgedBy)?.name || 'family'}` : ''}</p></div><Badge tone={r.status === 'acknowledged' ? 'green' : 'gold'}>{r.status}</Badge>{mayAcknowledge && r.status !== 'acknowledged' && <button className="btn btn-secondary" onClick={() => act((d) => acknowledgeRequest(d, r.id, user), 'Request acknowledged')}>Acknowledge</button>}</article>) : <Empty title="No updates yet" text="Patient check-ins will appear here."/>}</div></Card>
  </>
}
