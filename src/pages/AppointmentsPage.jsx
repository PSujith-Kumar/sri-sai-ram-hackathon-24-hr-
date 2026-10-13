import React, { useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { Badge, Card, Empty, Modal, PageTitle } from '../ui'
import { Avatar, fmtDate, fmtTime } from '../shared'
import { localDate } from '../careFlow'
import { REASON_LIMIT, appointmentsFor, bookAppointment, canBook, isOpen, setAppointmentStatus } from '../appointmentOps'

const blank = (patientId) => ({ patientId, date: localDate(), time: '', reason: '' })
const tone = { scheduled: 'neutral', 'checked-in': 'green', completed: 'blue', cancelled: 'coral' }

/** Doctors book and manage consultations; patients and family see them, and a patient can cancel their own. */
export default function AppointmentsPage({ data, setData, user, patients, notify }) {
  const clinician = ['doctor', 'head'].includes(user.role)
  const bookable = patients.filter(p => canBook(user, p))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => blank(bookable[0]?.id || ''))
  const [errors, setErrors] = useState({})
  const [showPast, setShowPast] = useState(false)
  const patientId = bookable.some(p => p.id === form.patientId) ? form.patientId : bookable[0]?.id || ''
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const err = (name) => errors[name] && <span className="field-error" role="alert">{errors[name]}</span>
  const today = localDate()
  const all = appointmentsFor(data, user, patients)
  const upcoming = all.filter(a => isOpen(a) && a.date >= today)
  const earlier = all.filter(a => !(isOpen(a) && a.date >= today)).reverse()

  const book = (e) => {
    e.preventDefault()
    const entry = { ...form, patientId }
    const result = bookAppointment(data, entry, user)
    if (!result.ok) { setErrors(result.errors); return }
    setData(current => { const r = bookAppointment(current, entry, user, { id: result.appointment.id }); return r.ok ? r.data : current })
    setErrors({}); setOpen(false); setForm(blank(patientId))
    notify('Appointment booked', { persist: false })
  }
  const change = (appointment, status, message) => {
    const check = setAppointmentStatus(data, appointment.id, status, user)
    if (!check.ok) { notify(check.message, { persist: false }); return }
    setData(current => { const r = setAppointmentStatus(current, appointment.id, status, user); return r.ok ? r.data : current })
    notify(message, { persist: false })
  }

  const row = (a) => {
    const p = data.patients.find(x => x.id === a.patientId)
    const other = data.users.find(u => u.id === (clinician ? p?.userId : a.doctorId))
    const dept = data.departments.find(d => d.id === a.departmentId)
    const mine = p?.userId === user.id
    return <div className="appointment-row" key={a.id}>
      <span><b>{fmtDate(a.date)}</b><small>{fmtTime(a.time)}</small></span>
      <span className="person-cell"><Avatar user={other}/><span><b>{other?.name || 'Unknown'}</b><small>{clinician ? p?.mrn : other?.specialization}{a.reason ? ` · ${a.reason}` : ''}</small></span></span>
      <span>{dept?.name || '—'}</span>
      <span className="appointment-status"><Badge tone={tone[a.status]}>{a.status}</Badge>
        {clinician && a.status === 'scheduled' && <button className="text-btn" onClick={() => change(a, 'checked-in', 'Patient checked in')}>Check in</button>}
        {clinician && a.status === 'checked-in' && <button className="text-btn" onClick={() => change(a, 'completed', 'Consultation completed')}>Complete</button>}
        {((clinician && isOpen(a)) || (mine && a.status === 'scheduled')) && <button className="text-btn danger" onClick={() => change(a, 'cancelled', 'Appointment cancelled')}>Cancel</button>}
      </span>
    </div>
  }
  const table = (list) => <div className="appointments-table"><div className="table-head"><span>When</span><span>{clinician ? 'Patient' : 'Doctor'}</span><span>Department</span><span>Status</span></div>{list.map(row)}</div>

  return <>
    <PageTitle eyebrow={clinician ? 'CLINICAL SCHEDULE' : 'MY VISITS'} title="Appointments" text={clinician ? 'Book and manage consultations for your assigned patients.' : 'Upcoming consultations with your care team.'} actions={clinician && <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!bookable.length}><Plus/> Book appointment</button>}/>
    <Card>
      <div className="card-head"><div><p className="eyebrow">UPCOMING</p><h2>{upcoming.length ? `${upcoming.length} upcoming` : 'Nothing scheduled'}</h2></div></div>
      {upcoming.length ? table(upcoming) : <Empty title="No upcoming appointments" text={clinician ? (bookable.length ? 'Use Book appointment to schedule a consultation.' : 'Add or take on a patient first, then book their appointment.') : 'Your doctor will schedule your next visit here.'}/>}
    </Card>
    {earlier.length > 0 && <Card>
      <div className="card-head"><div><p className="eyebrow">EARLIER</p><h2>{earlier.length} past or closed</h2></div><button className="text-btn" onClick={() => setShowPast(v => !v)} aria-expanded={showPast}>{showPast ? 'Hide' : 'Show'}</button></div>
      {showPast && table(earlier)}
    </Card>}
    <Modal open={open} onClose={() => { setErrors({}); setOpen(false) }} eyebrow="CLINICAL SCHEDULE" title="Book an appointment">
      <form className="form-stack" onSubmit={book} noValidate>
        <label>Patient<select value={patientId} onChange={e => set({ patientId: e.target.value })} aria-invalid={Boolean(errors.patientId)}>{bookable.map(p => <option key={p.id} value={p.id}>{data.users.find(u => u.id === p.userId)?.name} · {p.mrn}</option>)}</select>{err('patientId')}</label>
        <div className="form-grid">
          <label>Date<input type="date" value={form.date} min={today} onChange={e => set({ date: e.target.value })} aria-invalid={Boolean(errors.date)}/>{err('date')}</label>
          <label>Time<input type="time" value={form.time} onChange={e => set({ time: e.target.value })} aria-invalid={Boolean(errors.time)}/>{err('time')}</label>
        </div>
        <label>Reason <small>(optional)</small><input value={form.reason} maxLength={REASON_LIMIT + 20} onChange={e => set({ reason: e.target.value })} placeholder="e.g. Blood pressure review" aria-invalid={Boolean(errors.reason)}/>{err('reason')}</label>
        <button className="btn btn-primary" type="submit"><CalendarDays/> Book appointment</button>
      </form>
    </Modal>
  </>
}
