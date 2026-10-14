import React, { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Map as MapIcon, Pencil, Plus } from 'lucide-react'
import { Badge, Card, Modal, PageTitle } from '../ui'
import { addHospital, draftFromPlan, emptyDraft, updateHospitalMap, validateDraft, validateHospitalForm } from '../adminOps'
import MapEditor from './MapEditor'

const EMPTY_FORM = { name: '', code: '', city: '', type: 'Community care', beds: 100 }
const mapSummary = (plan) => (plan ? `${Object.keys(plan.nodes).length} places · ${plan.edges.length} paths` : null)

/** Step 1 of the wizard: the hospital's details. */
function DetailsStep({ form, setForm, errors, onSubmit }) {
  const field = (name, label, { transform = (v) => v, ...props } = {}) => <label>{label}<input value={form[name]} onChange={e => setForm({ ...form, [name]: transform(e.target.value) })} aria-invalid={Boolean(errors[name])} {...props}/>{errors[name] && <span className="field-error" role="alert">{errors[name]}</span>}</label>
  // a real form, so Enter moves on to the map step; noValidate because the errors are shown in our own style
  return <form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSubmit() }} noValidate>
    {field('name', 'Hospital name', { placeholder: 'Fictional hospital name', maxLength: 80, autoComplete: 'off' })}
    <div className="form-grid">{field('code', 'Short code', { placeholder: 'ABC', maxLength: 5, autoComplete: 'off', transform: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '') })}{field('city', 'City', { placeholder: 'City', maxLength: 60, autoComplete: 'off' })}</div>
    <div className="form-grid">
      <label>Facility type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Tertiary care</option><option>Community care</option><option>Speciality hospital</option></select></label>
      {field('beds', 'Beds', { type: 'number', min: 1, max: 5000, step: 1, inputMode: 'numeric' })}
    </div>
    <p className="form-help">Next you will add the hospital's places and the paths between them. The map is required: patients use it to find their way.</p>
    <div className="wizard-actions"><button className="btn btn-primary" type="submit">Next: draw the map <ArrowRight/></button></div>
  </form>
}

/** Admin page: every hospital, its map status, and the two-step "details, then map" creation flow. */
export default function HospitalsPage({ data, setData, user, notify }) {
  const [wizard, setWizard] = useState(null)   // { step: 1|2, form, draft, errors, mapErrors }
  const [editing, setEditing] = useState(null) // { hospital, draft, mapErrors }
  const plans = data.floorPlans || {}
  const copyFrom = data.hospitals.filter(h => plans[h.id]).map(h => ({ id: h.id, name: h.name, plan: plans[h.id] }))

  const openWizard = () => setWizard({ step: 1, form: EMPTY_FORM, draft: emptyDraft(), errors: {}, mapErrors: [] })
  const next = () => {
    const check = validateHospitalForm(data, wizard.form)
    setWizard(w => (check.ok ? { ...w, step: 2, errors: {} } : { ...w, errors: check.errors }))
  }
  const create = () => {
    const r = addHospital(data, wizard.form, wizard.draft, { actorId: user.id })
    if (!r.ok) { setWizard(w => ({ ...w, step: Object.keys(r.errors).length ? 1 : 2, errors: r.errors, mapErrors: r.mapErrors })); return }
    setData(r.data)
    setWizard(null)
    notify(`${r.hospital.name} added with its map`)
  }
  const save = () => {
    const r = updateHospitalMap(data, editing.hospital.id, editing.draft)
    if (!r.ok) { setEditing(e => ({ ...e, mapErrors: r.mapErrors })); return }
    setData(r.data)
    setEditing(null)
    notify(`Map of ${editing.hospital.name} saved`)
  }

  if (user.role !== 'admin') return <PageTitle eyebrow="NETWORK ADMINISTRATION" title="Hospitals" text="Only network administrators can manage hospitals."/>
  const mapOk = wizard && validateDraft(wizard.draft).ok
  const editOk = editing && validateDraft(editing.draft).ok

  return <>
    <PageTitle eyebrow="NETWORK ADMINISTRATION" title="Hospitals" text="Create and maintain every facility in the CareBridge network, together with its map." actions={<button className="btn btn-primary" onClick={openWizard}><Plus/> Add hospital</button>}/>
    <div className="hospital-grid">{data.hospitals.map(h => {
      const plan = plans[h.id]
      return <Card key={h.id} className="hospital-card">
        <div className="hospital-card-top"><span className="hospital-monogram large" style={{ background: h.color }}>{h.code}</span><Badge tone="green">Active</Badge></div>
        <h2>{h.name}</h2><p>{h.city} · {h.type}</p>
        <div className="hospital-stat-row">
          <span><b>{h.beds}</b><small>Beds</small></span>
          <span><b>{data.departments.filter(d => d.hospitalId === h.id).length}</b><small>Departments</small></span>
          <span><b>{data.users.filter(u => u.role === 'admin' || u.hospitalIds.includes(h.id)).length}</b><small>People</small></span>
        </div>
        <div className="hospital-card-foot">
          <span className={plan ? '' : 'map-missing'}><MapIcon/> {plan ? `Map: ${mapSummary(plan)}` : 'No map yet'}</span>
          <button className="text-btn" onClick={() => setEditing({ hospital: h, draft: draftFromPlan(plan), mapErrors: [] })}><Pencil/> {plan ? 'Edit map' : 'Add map'}</button>
        </div>
      </Card>
    })}</div>

    <Modal open={Boolean(wizard)} onClose={() => setWizard(null)} eyebrow={wizard ? `NEW FACILITY · STEP ${wizard.step} OF 2` : ''} title={wizard?.step === 2 ? 'Draw the hospital map' : 'Add a hospital'} wide={wizard?.step === 2}>
      {wizard && <>
        <ol className="wizard-steps" aria-label="Progress"><li className={wizard.step === 1 ? 'on' : 'done'}>1 · Details</li><li className={wizard.step === 2 ? 'on' : ''}>2 · Map and paths</li></ol>
        {wizard.step === 1 && <DetailsStep form={wizard.form} setForm={form => setWizard(w => ({ ...w, form }))} errors={wizard.errors} onSubmit={next}/>}
        {wizard.step === 2 && <>
          <MapEditor draft={wizard.draft} onChange={draft => setWizard(w => ({ ...w, draft, mapErrors: [] }))} copyFrom={copyFrom}/>
          {wizard.mapErrors.length > 0 && <p className="form-error" role="alert">{wizard.mapErrors[0]}</p>}
          <div className="wizard-actions"><button className="btn btn-secondary" onClick={() => setWizard(w => ({ ...w, step: 1 }))}><ArrowLeft/> Back</button><button className="btn btn-primary" onClick={create} disabled={!mapOk}><Check/> Create hospital with this map</button></div>
        </>}
      </>}
    </Modal>

    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} eyebrow="HOSPITAL MAP" title={editing ? `Map of ${editing.hospital.name}` : ''} wide>
      {editing && <>
        <MapEditor draft={editing.draft} onChange={draft => setEditing(e => ({ ...e, draft, mapErrors: [] }))} copyFrom={copyFrom.filter(c => c.id !== editing.hospital.id)}/>
        {editing.mapErrors.length > 0 && <p className="form-error" role="alert">{editing.mapErrors[0]}</p>}
        <div className="wizard-actions"><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!editOk}><Check/> Save map</button></div>
      </>}
    </Modal>
  </>
}
