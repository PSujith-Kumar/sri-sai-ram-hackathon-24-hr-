import React, { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '../ui'
import { BLOOD_GROUPS, createUser, describeRemoval, rolesActorMayCreate } from '../adminOps'
import { DEMO_PASSWORD, roleLabels } from '../data'

const blankForm = (hospitalId, roles) => ({
  name: '', email: '', role: roles.includes('patient') ? 'patient' : roles[0], hospitalId,
  departmentId: '', specialization: '', dob: '', bloodGroup: '', doctorId: '', allergies: '', conditions: '', linkPatientId: '', relationship: '', consent: false,
})

/** Create a person. Which fields appear depends on the role, so each role gets the records it needs. */
export function AddUserModal({ open, onClose, data, actor, hospital, onCreated }) {
  const roles = rolesActorMayCreate(actor)
  const [form, setForm] = useState(() => blankForm(hospital?.id || data.hospitals[0]?.id, roles))
  const [errors, setErrors] = useState({})
  const hospitals = actor.role === 'admin' ? data.hospitals : data.hospitals.filter(h => actor.hospitalIds.includes(h.id))
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const departments = data.departments.filter(d => d.hospitalId === form.hospitalId)
  const doctors = data.users.filter(u => ['doctor', 'head'].includes(u.role) && u.hospitalIds.includes(form.hospitalId))
  const patients = data.patients.filter(p => p.hospitalId === form.hospitalId)
  const err = (name) => errors[name] && <span className="field-error" role="alert">{errors[name]}</span>

  const submit = (e) => {
    e.preventDefault()
    const result = createUser(data, form, actor)
    if (!result.ok) { setErrors(result.errors); return }
    setErrors({})
    setForm(blankForm(hospital?.id || data.hospitals[0]?.id, roles))
    onCreated(result)
  }
  const close = () => { setErrors({}); onClose() }

  return <Modal open={open} onClose={close} eyebrow="IDENTITY" title="Add a user">
    <form className="form-stack" onSubmit={submit} noValidate>
      <label>Full name<input value={form.name} onChange={e => set({ name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="off"/>{err('name')}</label>
      <label>Email address<input type="email" value={form.email} onChange={e => set({ email: e.target.value })} aria-invalid={Boolean(errors.email)} autoComplete="off"/>{err('email')}</label>
      <label>Role<select value={form.role} onChange={e => set({ role: e.target.value })}>{roles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}</select>{err('role')}</label>
      {form.role !== 'admin'
        ? <label>Hospital<select value={form.hospitalId} onChange={e => set({ hospitalId: e.target.value, departmentId: '', doctorId: '', linkPatientId: '' })}>{hospitals.map(h => <option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</select>{err('hospitalId')}</label>
        : <p className="form-help">Network administrators work across every hospital, including ones added later.</p>}

      {['doctor', 'head'].includes(form.role) && <>
        <label>Department<select value={form.departmentId} onChange={e => set({ departmentId: e.target.value })}><option value="">Choose a department…</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{err('departmentId')}</label>
        <label>Specialisation <small>(optional)</small><input value={form.specialization} onChange={e => set({ specialization: e.target.value })} placeholder="e.g. Interventional Cardiology"/></label>
      </>}

      {form.role === 'patient' && <>
        <div className="form-grid">
          <label>Date of birth<input type="date" value={form.dob} onChange={e => set({ dob: e.target.value })} max={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(errors.dob)}/>{err('dob')}</label>
          <label>Blood group<select value={form.bloodGroup} onChange={e => set({ bloodGroup: e.target.value })}><option value="">Unknown</option>{BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}</select></label>
        </div>
        <label>Assigned doctor <small>(optional)</small><select value={form.doctorId} onChange={e => set({ doctorId: e.target.value })}><option value="">Not assigned yet</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{err('doctorId')}</label>
        <div className="form-grid">
          <label>Allergies <small>(comma separated)</small><input value={form.allergies} onChange={e => set({ allergies: e.target.value })} placeholder="e.g. Penicillin"/></label>
          <label>Conditions <small>(comma separated)</small><input value={form.conditions} onChange={e => set({ conditions: e.target.value })} placeholder="e.g. Asthma"/></label>
        </div>
      </>}

      {form.role === 'family' && <>
        <label>Link to a patient <small>(optional)</small><select value={form.linkPatientId} onChange={e => set({ linkPatientId: e.target.value })}><option value="">Not linked yet</option>{patients.map(p => <option key={p.id} value={p.id}>{data.users.find(u => u.id === p.userId)?.name} · {p.mrn}</option>)}</select>{err('linkPatientId')}</label>
        {form.linkPatientId && <>
          <label>Relationship<input value={form.relationship} onChange={e => set({ relationship: e.target.value })} placeholder="e.g. Mother" aria-invalid={Boolean(errors.relationship)}/>{err('relationship')}</label>
          <label className="checkbox-label"><input type="checkbox" checked={form.consent} onChange={e => set({ consent: e.target.checked })}/> The patient has agreed to share their information with this person</label>
          {!form.consent && <p className="form-help">Without the patient's agreement the person is created but not linked. The patient can approve the link later.</p>}
        </>}
      </>}

      <p className="form-help">The new person signs in with their email and the demo password <code>{DEMO_PASSWORD}</code>.</p>
      <button className="btn btn-primary" type="submit">Create user</button>
    </form>
  </Modal>
}

const IMPACT_LINES = [
  ['patientRecord', (v) => v && 'Their patient record is deleted.'],
  ['records', (v) => v > 0 && `${v} health record${v === 1 ? '' : 's'} deleted.`],
  ['medications', (v) => v > 0 && `${v} medication entr${v === 1 ? 'y' : 'ies'} deleted.`],
  ['appointments', (v) => v > 0 && `${v} appointment${v === 1 ? '' : 's'} removed.`],
  ['unassignedPatients', (v) => v > 0 && `${v} patient${v === 1 ? '' : 's'} will have no assigned doctor.`],
  ['queues', (v) => v > 0 && `${v} queue${v === 1 ? '' : 's'} closed.`],
  ['waitingTokens', (v) => v > 0 && `${v} waiting patient token${v === 1 ? '' : 's'} cancelled.`],
  ['familyLinks', (v) => v > 0 && `Family access to ${v} patient${v === 1 ? '' : 's'} is removed.`],
  ['departmentsLeadershipMoved', (v) => v > 0 && `${v === 1 ? '1 department passes' : `${v} departments pass`} to the hospital's dean (or to you).`],
  ['hospitalsLeadershipMoved', (v) => v > 0 && `${v === 1 ? '1 hospital passes' : `${v} hospitals pass`} to you as dean until a new dean is appointed.`],
]

/** Confirmation that lists exactly what deleting this person will touch. Blocks the unsafe cases. */
export function DeleteUserDialog({ target, data, actor, onClose, onConfirm }) {
  const [sure, setSure] = useState(false)
  const info = target ? describeRemoval(data, target.id, actor.id) : null
  const close = () => { setSure(false); onClose() }
  const lines = info?.ok ? IMPACT_LINES.map(([key, line]) => line(info.impact[key])).filter(Boolean) : []
  return <Modal open={Boolean(target)} onClose={close} eyebrow="IDENTITY" title={target ? `Delete ${target.name}?` : ''}>
    {target && info && (info.ok ? <div className="form-stack">
      <p>This permanently removes <b>{target.name}</b> ({roleLabels[target.role]}) and cleans up everything linked to them.</p>
      {lines.length > 0 && <ul className="delete-impact">{lines.map(l => <li key={l}>{l}</li>)}</ul>}
      <label className="checkbox-label"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)}/> I understand this cannot be undone</label>
      <div className="wizard-actions"><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={!sure} onClick={() => { setSure(false); onConfirm(target) }}><Trash2/> Delete permanently</button></div>
    </div> : <div className="form-stack">
      <p className="form-error" role="alert"><AlertTriangle/> {info.message}</p>
      <div className="wizard-actions"><button className="btn btn-secondary" onClick={close}>Close</button></div>
    </div>)}
  </Modal>
}
