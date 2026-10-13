import React, { useEffect, useMemo, useState } from 'react'
import { Info, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from './ui'
import { LANGUAGE_PROMPT, MAP_AI_DEFAULTS, RETIRED_MODELS, askOpenRouter, checkOpenRouter, compareRoutes, routeFacts } from './mapAnalysis'

const SETTINGS_KEY = 'carebridge-map-ai'
const LANGUAGE_LABEL = { en: 'English', hi: 'हिन्दी (Hindi)', ta: 'தமிழ் (Tamil)' }
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const loadSettings = () => {
  try {
    const saved = { ...MAP_AI_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }
    return RETIRED_MODELS.includes(saved.model) ? { ...saved, model: MAP_AI_DEFAULTS.model } : saved // a model OpenRouter withdrew
  } catch { return MAP_AI_DEFAULTS }
}

/** Exact route facts (always shown) plus an optional OpenRouter explanation in the patient's language. */
export default function RouteAnalysisCard({ plan, start, end, accessible, path }) {
  const [settings, setSettings] = useState(loadSettings)
  const [server, setServer] = useState(null) // { ok, hasKey } from the dev server
  const [result, setResult] = useState({ phase: 'idle' })
  const facts = useMemo(() => routeFacts(plan, path), [plan, path])
  const comparison = useMemo(() => compareRoutes(plan, start, end), [plan, start, end])
  const routeKey = `${path.join('>')}|${accessible}|${settings.language}`

  const change = (patch) => setSettings(s => { const next = { ...s, ...patch }; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* private mode */ } return next })
  useEffect(() => { setResult({ phase: 'idle' }) }, [routeKey])
  useEffect(() => { if (settings.enabled) checkOpenRouter(settings).then(setServer) }, [settings.enabled, settings.endpoint])

  if (path.length < 2) return null

  const analyse = async () => {
    setResult({ phase: 'loading' })
    const r = await askOpenRouter(settings, { plan, facts, accessible, language: settings.language, comparison }, facts)
    setResult(r.ok ? { phase: 'done', analysis: r.analysis } : { phase: 'error', message: r.message })
  }

  const fastest = comparison.fastest
  const accessibleRoute = comparison.accessible
  return <div className="map-ai">
    <p className="eyebrow">ROUTE ANALYSIS</p>
    <div className="map-ai-chips">
      <Badge tone="green">≈ {facts.minutes} min</Badge>
      <Badge>{plural(facts.steps, 'step')}</Badge>
      <Badge>{facts.floorsChanged ? `${plural(facts.floorsChanged, 'floor change')}` : 'Same floor'}</Badge>
      {facts.liftLegs > 0 && <Badge tone="blue">{plural(facts.liftLegs, 'lift leg')}</Badge>}
      {accessible ? <Badge tone="green">No stairs</Badge> : facts.stairLegs > 0 && <Badge tone="gold">{plural(facts.stairLegs, 'stair leg')}</Badge>}
    </div>
    {accessible && fastest && !comparison.sameRoute && <p className="map-ai-note">The fastest route (≈ {fastest.minutes} min) uses stairs. This wheelchair-friendly route takes ≈ {facts.minutes} min ({comparison.extraMinutes} min more).</p>}
    {accessible && comparison.sameRoute && <p className="map-ai-note">This is also the fastest route.</p>}
    {!accessible && accessibleRoute && !comparison.sameRoute && <p className="map-ai-note">A wheelchair-friendly alternative takes ≈ {accessibleRoute.minutes} min.</p>}

    <label className="checkbox-label map-ai-toggle"><input type="checkbox" checked={settings.enabled} onChange={e => change({ enabled: e.target.checked })}/> <span><Sparkles/> Explain this route with AI (OpenRouter)</span></label>
    {settings.enabled && <div className="map-ai-panel">
      <div className="form-grid">
        <label>Language<select value={settings.language} onChange={e => change({ language: e.target.value })}>{Object.keys(LANGUAGE_PROMPT).map(code => <option key={code} value={code}>{LANGUAGE_LABEL[code]}</option>)}</select></label>
        <label>Model<input value={settings.model} onChange={e => change({ model: e.target.value.trim() })} spellCheck="false"/></label>
      </div>
      {server && !server.ok && <p className="form-error" role="status">The app server is not reachable, so AI explanations are unavailable here.</p>}
      {server && server.ok && !server.hasKey && <p className="form-error" role="status">No OpenRouter key yet. Add <code>OPENROUTER_API_KEY=…</code> to <code>.env.local</code> and restart <code>npm run dev</code>.</p>}
      <button className="btn btn-secondary" type="button" onClick={analyse} disabled={result.phase === 'loading' || (server && server.ok && !server.hasKey)}><Sparkles/> {result.phase === 'loading' ? 'Analysing…' : 'Explain this route'}</button>
      <p className="map-ai-privacy"><ShieldCheck/> Only the floor plan and this route are sent. No name, record or location of the patient.</p>
    </div>}

    {result.phase === 'error' && <p className="form-error" role="alert">{result.message}</p>}
    {result.phase === 'done' && <div className="map-ai-result" aria-live="polite">
      <h3>{result.analysis.summary}</h3>
      <ol>{result.analysis.directions.map((d, i) => <li key={i}>{d}</li>)}</ol>
      {result.analysis.accessibility && <p><b>Accessibility:</b> {result.analysis.accessibility}</p>}
      {result.analysis.cautions.length > 0 && <><p><b>Watch for</b></p><ul>{result.analysis.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
      {result.analysis.tips.length > 0 && <><p><b>Tips</b></p><ul>{result.analysis.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      {!result.analysis.grounded && <p className="map-ai-warn"><Info/> This answer does not clearly match the route above. Please follow the steps listed above and ask hospital staff.</p>}
      <small>AI-written from the verified route data{result.analysis.model ? ` by ${result.analysis.model}` : ''}. Always confirm directions with hospital staff.</small>
    </div>}
  </div>
}
