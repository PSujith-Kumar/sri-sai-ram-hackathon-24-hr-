import React, { useState } from 'react'
import { Modal } from '../ui'
import { BLOOD_GROUPS } from '../adminOps'
import { DEMO_PASSWORD } from '../data'
import { registerPatient, takeOnPatient, unassignedPatients } from '../doctorOps'

const blank = { name: '', email: '', dob: '', bloodGroup: '', allergies: '', conditions: '' }

/** Two ways in: register a new patient, or take on an existing hospital patient with no doctor. */
export function AddPatientModal({ open, onClose, data, actor, onAdded }) {
  const waiting = unassignedPatients(data, actor)
  const [mode, setMode] = useState('new')
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [pick, setPick] = useState('')
  const [message, setMessage] = useState('')
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const err = (name) => errors[name] && <span className="field-error" role="alert">{errors[name]}</span>
  const close = () => { setErrors({}); setMessage(''); onClose() }

  const submitNew = (e) => {
    e.preventDefault()
    const result = registerPatient(data, form, actor)
    if (!result.ok) { setErrors(result.errors); return }
    setErrors({}); setForm(blank)
    onAdded(result, `${result.user.name} added to your patients`)
  }
  const submitExisting = (e) => {
    e.preventDefault()
    const result = takeOnPatient(data, pick, actor)
    if (!result.ok) { setMessage(result.message); return }
    setMessage(''); setPick('')
    onAdded(result, `${data.users.find(u => u.id === result.patient.userId)?.name} added to your patients`)
  }

  return <Modal open={open} onClose={close} eyebrow="MY PATIENTS" title="Add a patient">
    <div className="form-stack">
      <div className="wizard-actions" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'new'} className={`btn ${mode === 'new' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('new')}>New patient</button>
        <button type="button" role="tab" aria-selected={mode === 'existing'} className={`btn ${mode === 'existing' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('existing')}>Existing patient ({waiting.length})</button>
      </div>

      {mode === 'new' ? <form className="form-stack" onSubmit={submitNew} noValidate>
        <label>Full name<input value={form.name} onChange={e => set({ name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="off"/>{err('name')}</label>
        <label>Email address<input type="email" value={form.email} onChange={e => set({ email: e.target.value })} aria-invalid={Boolean(errors.email)} autoComplete="off"/>{err('email')}</label>
        <div className="form-grid">
          <label>Date of birth<input type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)} onChange={e => set({ dob: e.target.value })} aria-invalid={Boolean(errors.dob)}/>{err('dob')}</label>
          <label>Blood group<select value={form.bloodGroup} onChange={e => set({ bloodGroup: e.target.value })}><option value="">Unknown</option>{BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>Allergies <small>(comma separated)</small><input value={form.allergies} onChange={e => set({ allergies: e.target.value })} placeholder="e.g. Penicillin"/></label>
          <label>Conditions <small>(comma separated)</small><input value={form.conditions} onChange={e => set({ conditions: e.target.value })} placeholder="e.g. Asthma"/></label>
        </div>
        <p className="form-help">The patient signs in with their email and the demo password <code>{DEMO_PASSWORD}</code>, and is assigned to you.</p>
        <button className="btn btn-primary" type="submit">Add patient</button>
      </form> : <form className="form-stack" onSubmit={submitExisting}>
        {waiting.length ? <>
          <label>Patient without a doctor<select value={pick} onChange={e => { setPick(e.target.value); setMessage('') }}><option value="">Choose a patient…</option>{waiting.map(p => <option key={p.id} value={p.id}>{data.users.find(u => u.id === p.userId)?.name} · {p.mrn}</option>)}</select></label>
          {message && <span className="field-error" role="alert">{message}</span>}
          <button className="btn btn-primary" type="submit" disabled={!pick}>Take on this patient</button>
        </> : <p className="form-help">Every patient at your hospital already has a doctor. Use "New patient" to register someone.</p>}
      </form>}
    </div>
  </Modal>
}
