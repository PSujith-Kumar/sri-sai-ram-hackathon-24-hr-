import React from 'react'
import { ArrowRight, Bell, Check, HeartHandshake, Pill, Printer, Route, Zap } from 'lucide-react'
import { Badge, Card, Empty, PageTitle } from '../ui'
import { Avatar, addressName, fmtDate, fmtTime, greeting } from '../shared'
import { localDate } from '../careFlow'
import { familyMay, sendCareRequest } from '../careCircle'
import { activeTokenFor } from '../queueOps'
import { adherenceToday, scheduleFor } from '../medminder'
import { appointmentsFor, isOpen } from '../appointmentOps'

const pad = (n) => String(n).padStart(3, '0')
const statusTone = { taken: 'green', skipped: 'coral', unconfirmed: 'gold' }
const statusLabel = { taken: 'taken', skipped: 'skipped', unconfirmed: 'not confirmed' }

/** Home page for patients and their family. Everything shown comes from the linked patient's own data. */
export default function PatientDashboard({ data, setData, user, patients, setPage, notify }) {
  const p = patients[0]
  if (!p) return <Empty title="No linked patient" text="An administrator or patient must approve a family link before health information appears."/>
  const isFamily = user.role === 'family'
  const pu = data.users.find(u => u.id === p.userId)
  const patientName = pu?.name.split(' ')[0] || 'the patient'
  const may = (permission) => familyMay(user, p, permission)
  const token = activeTokenFor(data, p.id)
  const queue = token && data.queues.find(q => q.id === token.queueId)
  const department = queue && data.departments.find(d => d.id === queue.departmentId)
  const queueDoctor = queue && data.users.find(u => u.id === queue.doctorId)
  const ahead = token && queue ? Math.max(0, token.number - queue.serving - 1) : 0
  const wait = queue ? ahead * queue.avgMinutes : 0
  const yourTurn = token?.status === 'serving'
  const nextVisit = appointmentsFor(data, user, [p]).find(a => isOpen(a) && a.date >= localDate())
  const nextDoctor = nextVisit && data.users.find(u => u.id === nextVisit.doctorId)
  const doctors = p.doctorIds.map(id => data.users.find(u => u.id === id)).filter(Boolean)
  const family = p.familyLinks.filter(l => l.status === 'approved')
  const { active: meds } = scheduleFor(data, p.id)
  const sum = adherenceToday(meds)
  const checkIn = (text, priority) => {
    const check = sendCareRequest(data, p.id, text, priority)
    setData(current => { const r = sendCareRequest(current, p.id, text, priority); return r.ok ? r.data : current })
    notify(check.recipients.length ? 'Update sent to your family' : 'Update saved. No family member is connected yet.', { persist: false })
  }

  return <>
    <PageTitle eyebrow={isFamily ? 'APPROVED FAMILY VIEW' : 'MY CARE JOURNEY'} title={isFamily ? `${pu?.name} is connected to your care circle.` : `${greeting()}, ${addressName(user)}.`} text={isFamily ? `You can only see the information ${patientName} approved for you.` : 'Everything for today’s visit is connected and ready.'} actions={<button className="btn btn-secondary" onClick={() => window.print()}><Printer/> Visit summary</button>}/>
    {may('queue') && (token && queue
      ? <div className="patient-hero"><div><Badge tone="mint"><Zap/> Live visit</Badge><p>{department?.name} · {queueDoctor?.name}</p><h2>{isFamily ? `${patientName}’s token` : 'Your token'} <strong>CAR-{pad(token.number)}</strong></h2><div className="patient-hero-stats"><span>Now serving <b>CAR-{pad(queue.serving)}</b></span><span>People ahead <b>{yourTurn ? 0 : ahead}</b></span><span>Estimated wait <b>{yourTurn ? 'Now' : wait ? `${Math.max(1, wait - 2)}–${wait + 8} min` : 'You’re next'}</b></span></div><button className="btn btn-light" onClick={() => setPage('queue')}>Open QueueCare <ArrowRight/></button></div>
          {!isFamily && department && <div className="hero-route"><Route/><span><small>Next destination</small><b>{department.name} · Floor {department.floor}</b><p>Room {department.room}. Open the map for step-by-step directions.</p></span><button onClick={() => setPage('careclue')}>Open map</button></div>}</div>
      : <div className="patient-hero"><div><Badge tone="neutral">No active visit</Badge><h2>{isFamily ? `${patientName} is not in a queue right now.` : 'You are not in a queue right now.'}</h2><p>{nextVisit ? `Next appointment: ${fmtDate(nextVisit.date)}, ${fmtTime(nextVisit.time)} with ${nextDoctor?.name || 'your doctor'}.` : 'Your token appears here once the hospital checks you in.'}</p><button className="btn btn-light" onClick={() => setPage(nextVisit ? 'appointments' : 'queue')}>{nextVisit ? 'See appointments' : 'Open QueueCare'} <ArrowRight/></button></div></div>)}
    <div className="care-grid">
      <Card><div className="card-head"><div><p className="eyebrow">CARE TEAM</p><h2>People connected to this patient</h2></div></div>
        {doctors.length ? doctors.map(d => <div className="care-team-row" key={d.id}><Avatar user={d}/><span><b>{d.name}</b><small>{d.specialization}</small></span><Badge tone="blue">Assigned doctor</Badge></div>) : <div className="care-team-row"><span><b>No doctor assigned yet</b><small>The hospital will assign one.</small></span></div>}
        {family.map(l => { const f = data.users.find(u => u.id === l.userId); return <div className="care-team-row" key={l.userId}><Avatar user={f}/><span><b>{f?.name}</b><small>{l.relationship}</small></span><Badge tone="green">Approved family</Badge></div> })}
      </Card>
      {may('medications') && <Card><div className="card-head"><div><p className="eyebrow">MEDMINDER</p><h2>Today’s medication</h2></div><button className="text-btn" onClick={() => setPage('medications')}>View all <ArrowRight/></button></div>
        {meds.length ? <>
          <p className="med-mini-summary">{sum.taken} taken · {sum.skipped} skipped · {sum.pending} still to confirm</p>
          {meds.map(m => <div className="med-mini" key={m.id}><span className={m.today === 'taken' ? 'done' : ''}><Pill/></span><div><b>{m.name}</b><small>{m.instruction} · {fmtTime(m.time)}</small></div><Badge tone={statusTone[m.today]}>{statusLabel[m.today]}</Badge></div>)}
        </> : <Empty title="No medicines scheduled" text="Your doctor or family can schedule medicines for you."/>}
      </Card>}
    </div>
    {may('care') && <Card className="quick-checkin"><span><HeartHandshake/></span><div><p className="eyebrow">CARECIRCLE</p><h2>{isFamily ? 'Recent care updates' : 'How are you doing right now?'}</h2><p>{isFamily ? `Acknowledging a request lets ${patientName} know you have seen it.` : 'A one-tap update goes only to your approved family caregivers.'}</p></div>
      {!isFamily && <div className="checkin-buttons"><button onClick={() => checkIn('I’m okay', 'normal')}><Check/> I’m okay</button><button className="urgent" onClick={() => checkIn('I need help', 'high')}><Bell/> I need help</button></div>}
      {isFamily && <button className="btn btn-primary" onClick={() => setPage('care')}>Open CareCircle</button>}
    </Card>}
  </>
}
