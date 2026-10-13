import React, { useState } from 'react'
import { Plus, Stethoscope, Trash2 } from 'lucide-react'
import { Card, Modal, PageTitle } from '../ui'
import { Avatar } from '../shared'
import { DEPARTMENT_LIMITS, addDepartment, canManageDepartments, removeDepartment } from '../orgOps'

const blank = { name: '', floor: '', room: '', staff: '5', headId: '' }

/** The hospital hierarchy. Admins and the hospital's dean can add departments and remove empty ones. */
export default function OrganizationPage({ data, setData, user, hospital, notify }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)
  const mayManage = canManageDepartments(user, hospital.id)
  const deps = data.departments.filter(d => d.hospitalId === hospital.id)
  const dean = data.users.find(u => u.id === hospital.deanId)
  const heads = data.users.filter(u => u.hospitalIds.includes(hospital.id) && ['doctor', 'head', 'dean'].includes(u.role))
  const headId = heads.some(u => u.id === form.headId) ? form.headId : heads[0]?.id || ''
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const err = (name) => errors[name] && <span className="field-error" role="alert">{errors[name]}</span>
  const close = () => { setOpen(false); setErrors({}) }

  const add = (e) => {
    e.preventDefault()
    const entry = { ...form, headId }
    const result = addDepartment(data, entry, hospital.id, user)
    if (!result.ok) { setErrors(result.errors); return }
    setData(current => { const r = addDepartment(current, entry, hospital.id, user, { id: result.department.id }); return r.ok ? r.data : current })
    close(); setForm(blank)
    notify(`${result.department.name} added to the hierarchy`)
  }
  const remove = () => {
    const result = removeDepartment(data, removing.id, user)
    if (!result.ok) { notify(result.message, { persist: false }); setRemoving(null); return }
    setData(current => { const r = removeDepartment(current, removing.id, user); return r.ok ? r.data : current })
    setRemoving(null)
    notify(`${result.department.name} removed`)
  }

  return <>
    <PageTitle eyebrow="GOVERNANCE & REPORTING" title={`${hospital.code} organization`} text="A transparent hierarchy from dean to department heads and specialist teams." actions={mayManage && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus/> Add department</button>}/>
    <Card className="org-chart">
      <div className="org-level dean-level"><div className="person-node primary"><Avatar user={dean} size="lg"/><span><small>Hospital dean</small><b>{dean?.name || 'Not appointed'}</b><p>{dean?.title}</p></span></div></div>
      <div className="org-line"></div>
      <div className="org-level department-level">{deps.map(d => {
        const head = data.users.find(u => u.id === d.headId)
        const doctors = data.users.filter(u => u.departmentId === d.id && u.role === 'doctor')
        return <div className="dept-node" key={d.id}>
          <div className="dept-head"><span className="round-icon"><Stethoscope/></span><span><small>{d.name}</small><b>{head?.name || 'Head unassigned'}</b><p>Department head · Floor {d.floor}</p></span></div>
          <div className="specialist-list">{doctors.length ? doctors.map(doc => <div key={doc.id}><Avatar user={doc} size="sm"/><span><b>{doc.name}</b><small>{doc.specialization}</small></span></div>) : <small>No additional specialist assigned</small>}</div>
          <footer>{d.staff} staff · Room {d.room}{mayManage && <button className="icon-btn" aria-label={`Remove ${d.name}`} title="Remove this department" onClick={() => setRemoving(d)}><Trash2/></button>}</footer>
        </div>
      })}</div>
    </Card>
    <Modal open={open} onClose={close} eyebrow="ORGANIZATION" title="Add a department">
      <form className="form-stack" onSubmit={add} noValidate>
        <label>Department name<input value={form.name} maxLength={DEPARTMENT_LIMITS.name + 10} onChange={e => set({ name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="off"/>{err('name')}</label>
        <div className="form-grid">
          <label>Floor<input value={form.floor} onChange={e => set({ floor: e.target.value })} aria-invalid={Boolean(errors.floor)}/>{err('floor')}</label>
          <label>Room<input value={form.room} onChange={e => set({ room: e.target.value })} aria-invalid={Boolean(errors.room)}/>{err('room')}</label>
        </div>
        <label>Department head<select value={headId} onChange={e => set({ headId: e.target.value })}>{heads.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>{err('headId')}</label>
        <label>Team size<input type="number" min="1" max={DEPARTMENT_LIMITS.staff} value={form.staff} onChange={e => set({ staff: e.target.value })} aria-invalid={Boolean(errors.staff)}/>{err('staff')}</label>
        <button className="btn btn-primary" type="submit">Add department</button>
      </form>
    </Modal>
    <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} eyebrow="ORGANIZATION" title={removing ? `Remove ${removing.name}?` : ''}>
      {removing && <div className="form-stack">
        <p>This removes the department from the hierarchy. It works only when nobody works in it and no queue or appointment uses it.</p>
        <div className="wizard-actions"><button className="btn btn-secondary" onClick={() => setRemoving(null)}>Keep department</button><button className="btn btn-danger" onClick={remove}><Trash2/> Remove</button></div>
      </div>}
    </Modal>
  </>
}
