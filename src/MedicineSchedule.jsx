import React, { useState } from 'react'
import { Check, Clock3, Pencil, Pill, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { Badge, Card, Empty, Modal, PageTitle } from './ui'
import { localDate } from './careFlow'
import {
  LIMITS, addMedication, adherenceToday, canMarkDose, canModify, canSchedule, deleteMedication, formatTime, isClinician, scheduleFor, scheduledByLabel,
  setDoseStatus, updateMedication,
} from './medminder'

const BLANK = { name: '', instruction: '', time: '08:00', note: '', days: '' }
const STATUS_TONE = { taken: 'green', skipped: 'coral', unconfirmed: 'gold' }
const STATUS_TEXT = { taken: 'taken', skipped: 'skipped', unconfirmed: 'not confirmed yet' }

/** Days left in a course (counting today), for editing; '' when the medicine has no end date. */
function daysLeft(med, today) {
  if (!med.endDate) return ''
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = med.endDate.split('-').map(Number)
  return String(Math.max(1, Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 864e5) + 1))
}

/** The add / edit form. `onSubmit(form)` returns { ok, errors? } so field errors can be shown here. */
function MedicationForm({ initial, onSubmit, onCancel, submitLabel, hint }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const err = (name) => errors[name] && <span className="field-error" role="alert">{errors[name]}</span>
  const submit = (e) => { e.preventDefault(); const r = onSubmit(form); if (!r.ok) setErrors(r.errors || {}) }
  return <form className="form-stack" onSubmit={submit} noValidate>
    <label>Medicine name<input value={form.name} onChange={e => set({ name: e.target.value })} maxLength={LIMITS.name} placeholder="e.g. Atorvastatin" aria-invalid={Boolean(errors.name)} autoComplete="off"/>{err('name')}</label>
    <div className="form-grid">
      <label>Dose<input value={form.instruction} onChange={e => set({ instruction: e.target.value })} maxLength={LIMITS.dose} placeholder="e.g. 1 tablet" aria-invalid={Boolean(errors.instruction)}/>{err('instruction')}</label>
      <label>Time of day<input type="time" value={form.time} onChange={e => set({ time: e.target.value })} aria-invalid={Boolean(errors.time)}/>{err('time')}</label>
    </div>
    <label>Note <small>(optional)</small><input value={form.note} onChange={e => set({ note: e.target.value })} maxLength={LIMITS.note} placeholder="e.g. After dinner" aria-invalid={Boolean(errors.note)}/>{err('note')}</label>
    <label>For how many days? <small>(leave empty to continue until stopped)</small><input type="number" min="1" max={LIMITS.days} value={form.days} onChange={e => set({ days: e.target.value })} aria-invalid={Boolean(errors.days)}/>{err('days')}</label>
    {hint && <p className="form-help">{hint}</p>}
    <div className="wizard-actions"><button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button><button className="btn btn-primary" type="submit">{submitLabel}</button></div>
  </form>
}

/** MedMinder: the patient tracks doses; their doctor and approved family schedule the medicines. */
export default function MedicineSchedule({ data, setData, user, patients, notify }) {
  const [selectedId, setSelectedId] = useState(patients[0]?.id)
  const [editor, setEditor] = useState(null)   // { mode: 'add' } | { mode: 'edit', med }
  const [removing, setRemoving] = useState(null)
  const patient = patients.find(p => p.id === selectedId) || patients[0]
  if (!patient) return <Empty title="No patient linked" text="Medicines appear here once a patient is linked to your account."/>

  const today = localDate()
  const patientUser = data.users.find(u => u.id === patient.userId)
  const first = patientUser?.name.split(' ')[0] || 'the patient'
  const { active, ended } = scheduleFor(data, patient.id, today)
  const summary = adherenceToday(active)
  const mayMark = canMarkDose(user, patient)
  const maySchedule = canSchedule(user, patient)
  const isPatient = user.id === patient.userId
  const toast = (message) => notify(message, { persist: false }) // the people affected were already notified by the action itself

  const mark = (med, status) => {
    const next = med.today === status ? 'unconfirmed' : status // pressing the active button again undoes it
    const r = setDoseStatus(data, med.id, next, user)
    if (!r.ok) return toast(r.message)
    setData(r.data)
    toast(next === 'unconfirmed' ? `${med.name} dose cleared` : `${med.name} marked ${next}`)
    return undefined
  }
  const save = (form) => {
    const r = editor.mode === 'edit' ? updateMedication(data, editor.med.id, form, user) : addMedication(data, form, patient.id, user)
    if (!r.ok) return r.errors ? r : (toast(r.message), { ok: false, errors: {} })
    setData(r.data)
    setEditor(null)
    toast(editor.mode === 'edit' ? `${r.medication.name} updated` : `${r.medication.name} scheduled for ${first}`)
    return r
  }
  const remove = () => {
    const r = deleteMedication(data, removing.id, user)
    if (!r.ok) toast(r.message); else { setData(r.data); toast(`${removing.name} removed from the schedule`) }
    setRemoving(null)
  }

  const title = isPatient ? 'Today’s medicine schedule' : isClinician(user) ? `Medicines for ${first}` : `Medicines for ${first}`
  const text = isPatient ? 'Your doctor and your family schedule your medicines. Tell CareBridge when you take each dose.' : maySchedule ? `Schedule medicines for ${first}. ${first} confirms each dose, and you are told if one is skipped.` : `You can see ${first}'s schedule and status.`

  const card = (m) => <Card className="med-card" key={m.id}>
    <div className="med-time"><Clock3/><b>{formatTime(m.time)}</b></div>
    <span className="pill-art"><Pill/></span>
    <h2>{m.name}</h2>
    <p>{m.instruction}{m.note ? ` · ${m.note}` : ''}</p>
    <p className="med-source">{scheduledByLabel(m)}{m.endDate ? ` · until ${new Date(`${m.endDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
    <Badge tone={STATUS_TONE[m.today]}>{STATUS_TEXT[m.today]}</Badge>
    {mayMark && <div className="med-actions"><button className={m.today === 'taken' ? 'active' : ''} onClick={() => mark(m, 'taken')} aria-pressed={m.today === 'taken'}><Check/> Taken</button><button className={m.today === 'skipped' ? 'skip active' : ''} onClick={() => mark(m, 'skipped')} aria-pressed={m.today === 'skipped'}><X/> Skipped</button></div>}
    {canModify(user, patient, m) && <div className="med-manage"><button className="text-btn" onClick={() => setEditor({ mode: 'edit', med: m })}><Pencil/> Edit</button><button className="text-btn med-delete" onClick={() => setRemoving(m)}><Trash2/> Remove</button></div>}
  </Card>

  return <>
    <PageTitle eyebrow="MEDMINDER" title={title} text={text} actions={maySchedule && <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add' })}><Plus/> Schedule a medicine</button>}/>
    {patients.length > 1 && <label className="med-patient-picker">Patient<select value={patient.id} onChange={e => setSelectedId(e.target.value)}>{patients.map(p => <option key={p.id} value={p.id}>{data.users.find(u => u.id === p.userId)?.name} · {p.mrn}</option>)}</select></label>}
    {active.length > 0 && <div className="med-summary" role="status"><Badge tone="green">{summary.taken} taken</Badge><Badge tone="coral">{summary.skipped} skipped</Badge><Badge tone="gold">{summary.pending} still to confirm</Badge></div>}

    {active.length === 0
      ? <Empty title="No medicines scheduled" text={maySchedule ? `Press “Schedule a medicine” to add the first one for ${first}.` : isPatient ? 'Your doctor or your family will schedule your medicines here.' : `No medicines have been scheduled for ${first} yet.`}/>
      : <div className="medication-grid">{active.map(card)}</div>}

    {ended.length > 0 && <details className="med-ended"><summary>Finished courses ({ended.length})</summary><div className="medication-grid">{ended.map(m => <Card className="med-card med-card-ended" key={m.id}><div className="med-time"><Clock3/><b>{formatTime(m.time)}</b></div><h2>{m.name}</h2><p>{m.instruction}{m.note ? ` · ${m.note}` : ''}</p><p className="med-source">{scheduledByLabel(m)} · ended {m.endDate}</p>{canModify(user, patient, m) && <div className="med-manage"><button className="text-btn med-delete" onClick={() => setRemoving(m)}><Trash2/> Remove</button></div>}</Card>)}</div></details>}

    <div className="safety-note"><ShieldCheck/><div><b>Medication safety</b><p>CareBridge does not diagnose, prescribe or calculate doses. {user.role === 'family' ? 'Only enter medicines the doctor has prescribed. You can change only the ones you added.' : 'Schedules come from the doctor’s prescription. An unconfirmed dose is never treated as missed.'}</p></div></div>

    <Modal open={Boolean(editor)} onClose={() => setEditor(null)} eyebrow="MEDMINDER" title={editor?.mode === 'edit' ? `Edit ${editor.med.name}` : `Schedule a medicine for ${first}`}>
      {editor && <MedicationForm key={editor.med?.id || 'new'} initial={editor.mode === 'edit' ? { name: editor.med.name, instruction: editor.med.instruction, time: editor.med.time, note: editor.med.note || '', days: daysLeft(editor.med, today) } : BLANK} onSubmit={save} onCancel={() => setEditor(null)} submitLabel={editor.mode === 'edit' ? 'Save changes' : 'Schedule medicine'} hint={isClinician(user) ? `${first} and their approved family are notified.` : `${first} and their doctor are notified.`}/>}
    </Modal>
    <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} eyebrow="MEDMINDER" title={removing ? `Remove ${removing.name}?` : ''}>
      {removing && <div className="form-stack"><p>This takes {removing.name} off {first}’s schedule. {first} is notified.</p><div className="wizard-actions"><button className="btn btn-secondary" onClick={() => setRemoving(null)}>Keep it</button><button className="btn btn-danger" onClick={remove}><Trash2/> Remove medicine</button></div></div>}
    </Modal>
  </>
}
