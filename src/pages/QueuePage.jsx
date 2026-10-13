import React, { useEffect, useState } from 'react'
import { Clock3, UserPlus, Zap } from 'lucide-react'
import { Badge, Card, Empty, PageTitle } from '../ui'
import { Avatar, relativeTime } from '../shared'
import { queueRecipientIds } from '../careFlow'
import { activeTokenFor, callNext, canManageQueue, isActiveToken, issueToken, patientsToCheckIn, setQueuePaused } from '../queueOps'

const pad = (n) => String(n).padStart(3, '0')

/** Staff run queues (check patients in, call the next one, pause); patients and family watch their own position. */
export default function QueuePage({ data, setData, user, patients, hospital, notify }) {
  const [now, setNow] = useState(Date.now())
  const [pick, setPick] = useState({})
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const canManage = ['admin', 'dean', 'head', 'doctor'].includes(user.role)
  const patient = patients[0]
  const token = patient && activeTokenFor(data, patient.id)
  const patientQueue = token && data.queues.find(q => q.id === token.queueId)
  const relevantQueues = canManage
    ? data.queues.filter(q => q.hospitalId === hospital.id && canManageQueue(user, q))
    : patientQueue ? [patientQueue] : []

  // run an operation on the latest data; show its message, or its refusal
  const run = (operation, success, extra) => {
    const check = operation(data)
    if (!check.ok) { notify(check.message, { persist: false }); return false }
    setData(current => { const r = operation(current); return r.ok ? r.data : current })
    notify(success(check), { persist: false })
    extra?.(check)
    return true
  }
  const departmentName = (queue) => data.departments.find(d => d.id === queue.departmentId)?.name || 'Queue'
  const advance = (queue) => run(
    (d) => callNext(d, queue.id, user), (r) => `Now serving CAR-${pad(r.serving)}.`,
    (r) => notify(`${departmentName(queue)} is now serving CAR-${pad(r.serving)}.`, { recipientIds: queueRecipientIds(data, queue.id, user.id), page: 'queue', type: 'queue' }),
  )
  const checkIn = (queue) => {
    if (!pick[queue.id]) { notify('Choose a patient to check in.', { persist: false }); return }
    const name = (r) => data.users.find(u => u.id === data.patients.find(p => p.id === r.token.patientId)?.userId)?.name
    if (run((d) => issueToken(d, queue.id, pick[queue.id], user), (r) => `${name(r)} checked in as CAR-${pad(r.token.number)}.`)) setPick(p => ({ ...p, [queue.id]: '' }))
  }
  const togglePause = (queue) => run((d) => setQueuePaused(d, queue.id, !queue.paused, user), () => `${departmentName(queue)} ${queue.paused ? 'resumed' : 'paused'}.`)

  const ahead = token && patientQueue ? Math.max(0, token.number - patientQueue.serving - 1) : 0
  const wait = patientQueue ? ahead * patientQueue.avgMinutes : 0
  const yourTurn = token?.status === 'serving'
  return <>
    <PageTitle eyebrow="QUEUECARE · SHARED LIVE DATA" title={canManage ? 'Queue operations' : 'Your live queue'} text={canManage ? 'Changes here immediately update patient and approved family views.' : 'Your doctor, hospital desk and approved family see the same queue status.'} actions={<span className="live-sync-chip"><i/> Live sync</span>}/>
    <div className="live-sync-banner" role="status"><Zap/><span><b>Connected across roles</b><small>Queue changes sync automatically between hospital, patient and approved family tabs.</small></span><span>{relevantQueues[0] ? relativeTime(relevantQueues[0].updatedAt, now) : ''}</span></div>
    {!canManage && token && patientQueue && <Card className="token-detail" aria-live="polite"><div><small>Your token</small><strong>CAR-{pad(token.number)}</strong><p>{departmentName(patientQueue)} · {data.users.find(u => u.id === patientQueue.doctorId)?.name}</p><div className="queue-progress" aria-label={`${ahead} people ahead`}><i style={{ width: yourTurn ? '100%' : `${Math.max(12, Math.min(100, 100 - ahead * 14))}%` }}/></div><small>{yourTurn ? 'It is your turn. Please go in.' : ahead === 0 ? 'Please be ready—you are next.' : `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you`}</small></div><div className="token-live"><span><small>Now serving</small><b>CAR-{pad(patientQueue.serving)}</b></span><span><small>People ahead</small><b>{yourTurn ? 0 : ahead}</b></span><span><small>Estimated wait</small><b>{yourTurn ? 'Now' : ahead === 0 ? 'You’re next' : `${Math.max(1, wait - 2)}–${wait + 8} min`}</b></span></div></Card>}
    {!canManage && !token && <Empty title="No active queue token" text="Your live position will appear here after hospital check-in."/>}
    {canManage && relevantQueues.length === 0 && <Empty title="No queues to manage" text="There is no queue for you at this hospital yet."/>}
    <div className="queue-grid">{relevantQueues.map(queue => {
      const doctor = data.users.find(u => u.id === queue.doctorId)
      const waiting = Math.max(0, queue.lastIssued - queue.serving)
      const holders = data.tokens.filter(t => t.queueId === queue.id && isActiveToken(t)).sort((a, b) => a.number - b.number)
      const candidates = patientsToCheckIn(data, queue.id)
      return <Card className="queue-card" key={queue.id}>
        <div className="queue-card-head"><span className="round-icon"><Clock3/></span><div><p className="eyebrow">{departmentName(queue)}</p><h2>{doctor?.name}</h2><small className="queue-updated">Updated {relativeTime(queue.updatedAt, now)}</small></div><Badge tone={queue.paused ? 'coral' : 'green'}>{queue.paused ? 'Paused' : 'Live'}</Badge></div>
        <div className="serving-number"><small>Now serving</small><strong>{pad(queue.serving)}</strong><p>{waiting ? `Next: ${pad(queue.serving + 1)}` : 'Nobody waiting'}</p></div>
        <div className="queue-card-stats"><span><b>{waiting}</b><small>Waiting</small></span><span><b>{queue.avgMinutes}m</b><small>Avg. consult</small></span><span><b>{waiting * queue.avgMinutes}m</b><small>Last token wait</small></span></div>
        {canManage && <>
          {holders.length > 0 && <ul className="queue-holders" aria-label="Patients with a token">{holders.map(t => { const p = data.patients.find(x => x.id === t.patientId); const pu = data.users.find(u => u.id === p?.userId); return <li key={t.id}><Avatar user={pu} size="sm"/><span>{pu?.name}</span><b>CAR-{pad(t.number)}</b>{t.status === 'serving' && <Badge tone="green">In consultation</Badge>}</li> })}</ul>}
          <div className="queue-checkin">
            <label>Check in a patient<select value={pick[queue.id] || ''} onChange={e => setPick(p => ({ ...p, [queue.id]: e.target.value }))} disabled={!candidates.length}><option value="">{candidates.length ? 'Choose a patient…' : 'Everyone is already in a queue'}</option>{candidates.map(p => <option key={p.id} value={p.id}>{data.users.find(u => u.id === p.userId)?.name} · {p.mrn}</option>)}</select></label>
            <button className="btn btn-secondary" onClick={() => checkIn(queue)} disabled={!candidates.length}><UserPlus/> Check in</button>
          </div>
          <div className="queue-actions"><button className="btn btn-primary" onClick={() => advance(queue)} disabled={queue.paused || waiting === 0}>Call next patient</button><button className="btn btn-secondary" onClick={() => togglePause(queue)}>{queue.paused ? 'Resume' : 'Pause'}</button></div>
        </>}
      </Card>
    })}</div>
  </>
}
