// The app's side of the phone link: asks the local gateway (server/phoneGateway.js, same origin, /phone-link/c/*)
// for a pairing, the phones' status and their frames. The gateway only answers this computer, so these calls never
// go anywhere else. Every call resolves null on failure (gateway not running, not reachable) instead of throwing.

const BASE = '/phone-link/c'
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function call(path, init, fetchImpl) {
  try {
    const res = await fetchImpl(`${BASE}/${path}`, { cache: 'no-store', ...init })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export const getInfo = (fetchImpl = fetch) => call('info', undefined, fetchImpl)
export const ensureSession = (patientId, fetchImpl = fetch) => call('session', post({ patientId }), fetchImpl)
export const resetSession = (patientId, fetchImpl = fetch) => call('reset', post({ patientId }), fetchImpl)
export const getStatus = (patientId, fetchImpl = fetch) => call(`status?patient=${encodeURIComponent(patientId)}`, undefined, fetchImpl)
/** The thermal phone captures only while this is renewed (about every 10 s). */
export const setWatch = (patientId, on, fetchImpl = fetch) => call(`watch?patient=${encodeURIComponent(patientId)}`, post({ thermal: on }), fetchImpl)
/** The camera phone turns its camera on only while this is renewed. Switching off deletes its last picture. */
export const setNormalCamera = (patientId, on, reason = '', fetchImpl = fetch) => call(`normal?patient=${encodeURIComponent(patientId)}`, post({ on, reason }), fetchImpl)

export const thermalFrameUrl = (patientId) => `${BASE}/frame/thermal?patient=${encodeURIComponent(patientId)}`
export const normalFrameUrl = (patientId) => `${BASE}/frame/normal?patient=${encodeURIComponent(patientId)}`

/** One pairing link per network address of this computer, for each phone. */
export function pairingLinks(info, token) {
  if (!info?.httpsPort || !token) return []
  const scheme = info.tls ? 'https' : 'http'
  return (info.addresses || []).map(({ address, name }) => {
    const origin = `${scheme}://${address}:${info.httpsPort}/phone/`
    return { address, name, hint: addressHint(address), thermal: `${origin}#role=thermal&t=${token}`, normal: `${origin}#role=normal&t=${token}` }
  })
}

/** What kind of network an address usually is, to help choose the right one for a phone. */
export function addressHint(address = '') {
  if (/^192\.168\.42\./.test(address)) return 'usual Android USB tethering range'
  if (/^192\.168\.(43|44)\./.test(address)) return 'usual Android Wi-Fi hotspot range'
  if (/^172\.20\.10\./.test(address)) return 'usual iPhone hotspot or USB range'
  if (/^192\.168\.137\./.test(address)) return 'Windows Mobile Hotspot'
  if (/^192\.168\.56\./.test(address)) return 'VirtualBox network, not a phone'
  return 'local network'
}

const ago = (ms) => (ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60000)} min ago`)

/** One line about a phone for the setup card. */
export function describeNode(node, role) {
  if (!node?.connected) return { tone: 'neutral', text: 'Waiting for the phone…' }
  const mode = role === 'thermal' && node.mode ? ({ silhouette: 'silhouette', camera: 'thermal picture', test: 'test pattern' }[node.mode] || node.mode) : ''
  const bits = [node.label || 'Phone', mode].filter(Boolean).join(' · ')
  if (role === 'normal') return { tone: 'green', text: `${bits} · ${node.capturing ? 'camera ON for a live check' : 'camera off (private)'}` }
  if (!node.capturing) return { tone: 'green', text: `${bits} · ready, waiting for AI care mode` }
  return node.frameAgeMs !== null && node.frameAgeMs < 5000 ? { tone: 'green', text: `${bits} · sending (${ago(node.frameAgeMs)})` } : { tone: 'gold', text: `${bits} · connected, no picture yet` }
}
