import React, { useMemo } from 'react'
import { Accessibility, AlertTriangle, CircleCheck, Plus, Trash2 } from 'lucide-react'
import { FLOORS, PLACE_TYPES, PLAN_TEMPLATES, draftFromPlan, emptyDraft, planFromDraft, templateDraft, validateDraft } from '../adminOps'

const floorLabel = (f) => (f === 'G' ? 'Ground' : f === 'B' ? 'Basement' : `Floor ${f}`)

/** Live picture of the map the admin is drawing: grey = step-free path, gold dashes = stairs / not wheelchair-friendly. */
function Preview({ draft }) {
  const plan = useMemo(() => planFromDraft({ places: draft.places.filter(p => p.name.trim()), paths: draft.paths }, 'Preview'), [draft])
  return <div className="floor-map map-preview">
    <svg viewBox="0 0 700 390" role="img" aria-label="Preview of the hospital map">
      <rect x="20" y="20" width="660" height="350" rx="20" className="map-shell"/>
      {plan.edges.map(([a, b, , ok]) => plan.nodes[a] && plan.nodes[b] && <line key={`${a}-${b}`} x1={plan.nodes[a].x} y1={plan.nodes[a].y} x2={plan.nodes[b].x} y2={plan.nodes[b].y} className={ok ? 'map-edge' : 'map-stairs'}/>)}
      {Object.entries(plan.nodes).map(([name, n]) => <g key={name}><circle cx={n.x} cy={n.y} r="11" className="map-node"/><text x={n.x} y={n.y - 19} textAnchor="middle">{name}</text><text x={n.x} y={n.y + 31} textAnchor="middle" className="floor-label">{floorLabel(n.floor)}{n.type === 'lift' ? ' · lift' : n.type === 'stairs' ? ' · stairs' : ''}</text></g>)}
    </svg>
    {plan.edges.length === 0 && <p className="map-preview-empty">Add places and connect them with paths to see the map.</p>}
  </div>
}

/**
 * Editor for a hospital map: places (rooms, lifts, stairs, the entrance) and the paths between them.
 * `draft` is { places: [{name, floor, type}], paths: [{from, to, distance, accessible}] }.
 * `copyFrom` lists existing hospitals whose map can be copied as a starting point.
 */
export default function MapEditor({ draft, onChange, copyFrom = [] }) {
  const check = useMemo(() => validateDraft(draft), [draft])
  const names = draft.places.map(p => p.name).filter(n => n.trim())

  const setPlace = (i, patch) => {
    const oldName = draft.places[i].name
    const places = draft.places.map((p, k) => (k === i ? { ...p, ...patch } : p))
    // renaming a place carries its paths along (only when the old name is unique, so paths are never mixed up)
    const renamed = patch.name !== undefined && oldName && draft.places.filter(p => p.name === oldName).length === 1
    const paths = renamed ? draft.paths.map(p => ({ ...p, from: p.from === oldName ? patch.name : p.from, to: p.to === oldName ? patch.name : p.to })) : draft.paths
    onChange({ places, paths })
  }
  const addPlace = () => onChange({ ...draft, places: [...draft.places, { name: `Place ${draft.places.length + 1}`, floor: draft.places.at(-1)?.floor || 'G', type: draft.places.some(p => p.type === 'entrance') ? 'room' : 'entrance' }] })
  const removePlace = (i) => {
    const gone = draft.places[i].name
    onChange({ places: draft.places.filter((_, k) => k !== i), paths: draft.paths.filter(p => p.from !== gone && p.to !== gone) })
  }
  const setPath = (i, patch) => onChange({ ...draft, paths: draft.paths.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const addPath = () => onChange({ ...draft, paths: [...draft.paths, { from: names[0] || '', to: names[1] || names[0] || '', distance: 1, accessible: true }] })
  const removePath = (i) => onChange({ ...draft, paths: draft.paths.filter((_, k) => k !== i) })

  return <div className="map-editor">
    <div className="map-editor-start">
      <b>Start from</b>
      {Object.entries(PLAN_TEMPLATES).map(([key, t]) => <button key={key} type="button" className="btn btn-secondary" onClick={() => onChange(templateDraft(key))}>{t.label}</button>)}
      {copyFrom.map(({ id, name, plan }) => <button key={id} type="button" className="btn btn-secondary" onClick={() => onChange(draftFromPlan(plan))}>Copy {name}</button>)}
      <button type="button" className="text-btn" onClick={() => onChange(emptyDraft())}>Clear all</button>
    </div>

    <div className="map-editor-grid">
      <div>
        <h3>Places <small>rooms, lifts, stairs and the entrance</small></h3>
        <div className="map-rows">
          {draft.places.map((p, i) => <div className="map-row map-row-place" key={i}>
            <input value={p.name} onChange={e => setPlace(i, { name: e.target.value })} placeholder="Name, e.g. Pharmacy" aria-label={`Place ${i + 1} name`} maxLength="30"/>
            <select value={p.floor} onChange={e => setPlace(i, { floor: e.target.value })} aria-label={`Place ${i + 1} floor`}>{FLOORS.map(f => <option key={f} value={f}>{floorLabel(f)}</option>)}</select>
            <select value={p.type} onChange={e => setPlace(i, { type: e.target.value })} aria-label={`Place ${i + 1} type`}>{PLACE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <button type="button" className="icon-btn" onClick={() => removePlace(i)} aria-label={`Remove ${p.name || `place ${i + 1}`}`}><Trash2/></button>
          </div>)}
        </div>
        <button type="button" className="btn btn-secondary" onClick={addPlace}><Plus/> Add place</button>

        <h3>Paths <small>which places connect, and how far</small></h3>
        <div className="map-rows">
          {draft.paths.map((p, i) => <div className="map-row map-row-path" key={i}>
            <select value={p.from} onChange={e => setPath(i, { from: e.target.value })} aria-label={`Path ${i + 1} from`}><option value="">From…</option>{names.map(n => <option key={n}>{n}</option>)}</select>
            <select value={p.to} onChange={e => setPath(i, { to: e.target.value })} aria-label={`Path ${i + 1} to`}><option value="">To…</option>{names.map(n => <option key={n}>{n}</option>)}</select>
            <input type="number" min="1" max="9" value={p.distance} onChange={e => setPath(i, { distance: Number(e.target.value) })} aria-label={`Path ${i + 1} distance`} title="Distance: 1 = very close, 5 = far"/>
            <label className="map-check" title="Tick if a wheelchair can use this path (no steps)"><input type="checkbox" checked={p.accessible} onChange={e => setPath(i, { accessible: e.target.checked })}/><Accessibility/></label>
            <button type="button" className="icon-btn" onClick={() => removePath(i)} aria-label={`Remove path ${i + 1}`}><Trash2/></button>
          </div>)}
        </div>
        <button type="button" className="btn btn-secondary" onClick={addPath} disabled={names.length < 2}><Plus/> Add path</button>
        <p className="map-help">Distance 1 is next door, 5 is a long walk. Paths touching stairs are never counted as wheelchair-friendly.</p>
      </div>

      <div>
        <Preview draft={draft}/>
        <div className="map-checks" role="status" aria-live="polite">
          {check.errors.map(e => <p key={e} className="map-error"><AlertTriangle/> {e}</p>)}
          {check.warnings.map(w => <p key={w} className="map-warning"><AlertTriangle/> {w}</p>)}
          {check.ok && <p className="map-ok"><CircleCheck/> Map is complete: {draft.places.length} places, {draft.paths.length} paths.</p>}
        </div>
      </div>
    </div>
  </div>
}
