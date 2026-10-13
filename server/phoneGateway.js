// Phone gateway: the link between the CareBridge app on the PC and two phones (a thermal phone and a normal-camera
// phone), over USB tethering, Wi-Fi or any private network. Plain Node, no framework, in memory only.
//
// Two sides share one state:
//   node side (the phones)  /phone-link/n/*  needs the pairing token, only private-network addresses allowed
//   consumer side (the app) /phone-link/c/*  only from this computer (loopback), never from another site
//
// Privacy rules enforced HERE, not just in the app:
//  * The normal camera sends nothing until the app asks for it (want.normal). Frames sent without that are refused
//    and never stored; when the app switches it off the stored frame is deleted.
//  * "Want" expires by itself (a few seconds after the app stops renewing), so if the app closes or crashes the
//    phone cameras turn off.
//  * Only the newest frame is kept, in memory. Nothing is written to disk and nothing is logged.

import crypto from 'node:crypto'

export const LINK = {
  prefix: '/phone-link',
  staleMs: 5000,          // a frame older than this counts as "no signal"
  connectedMs: 25000,     // a phone heard from within this is "connected"
  pollMs: 10000,          // longest a phone's command poll waits (shorter than connectedMs)
  thermalWantMs: 30000,   // the app renews "watch" at least this often
  normalWantMs: 20000,    // ...and "camera on" at least this often
  maxJsonBytes: 64 * 1024,
  maxJpegBytes: 400 * 1024,
  minFrameGapMs: 120,
  maxFailuresPerMinute: 20,
  maxGrid: 64,            // largest thermal grid side
}
export const ROLES = ['thermal', 'normal']

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
export const isLoopback = (ip) => LOOPBACK.has(ip)

/** RFC 1918 / link-local / loopback: addresses a phone on a cable or home network would have. */
export function isPrivateAddress(raw = '') {
  const ip = raw.replace(/^::ffff:/, '')
  if (ip === '::1' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

/** Browsers tell us when another website is driving the request. Refuse that; plain tools (no header) are fine. */
export function sameOriginOnly(req) {
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site' || site === 'same-site') return false
  const origin = req.headers.origin
  if (origin) { try { return new URL(origin).host === req.headers.host } catch { return false } }
  return true
}

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }

class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > limit) return reject(new HttpError(413, 'too large'))
    const chunks = []
    let size = 0
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'too large')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const parseJson = (buffer) => { try { return JSON.parse(buffer.toString('utf8') || '{}') } catch { throw new HttpError(400, 'bad json') } }

function validThermalFrame(f, max) {
  if (!f || !Number.isInteger(f.width) || !Number.isInteger(f.height) || f.width < 1 || f.height < 1 || f.width > max || f.height > max) return false
  return Array.isArray(f.temps) && f.temps.length === f.width * f.height && f.temps.every((t) => Number.isFinite(t) && t > -60 && t < 500)
}
const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

const newNode = () => ({ lastSeen: 0, label: '', mode: '', frame: null, frameAt: 0, frames: 0 })

export function createGateway({ now = () => Date.now(), makeToken = () => crypto.randomBytes(16).toString('hex'), config = LINK } = {}) {
  const sessions = new Map() // patientId -> session
  const failures = new Map() // ip -> { count, since }
  let info = { addresses: [], httpsPort: null, tls: false, note: '' }

  const newSession = (patientId) => ({ patientId, token: makeToken(), createdAt: now(), until: { thermal: 0, normal: 0 }, reason: '', nodes: { thermal: newNode(), normal: newNode() }, waiters: new Set() })
  const sessionFor = (patientId) => { if (!sessions.has(patientId)) sessions.set(patientId, newSession(patientId)); return sessions.get(patientId) }
  const byToken = (token) => { for (const s of sessions.values()) if (token && safeEqual(s.token, token)) return s; return null }
  const wants = (s, role) => now() < s.until[role]
  const wake = (s) => { for (const w of [...s.waiters]) w.wake() }

  const nodeStatus = (s, role) => {
    const n = s.nodes[role]
    return { connected: n.lastSeen > 0 && now() - n.lastSeen < config.connectedMs, lastSeenMs: n.lastSeen ? now() - n.lastSeen : null, frameAgeMs: n.frameAt ? now() - n.frameAt : null, label: n.label, mode: n.mode, frames: n.frames, capturing: wants(s, role) }
  }
  const status = (s) => ({ thermal: nodeStatus(s, 'thermal'), normal: nodeStatus(s, 'normal'), reason: s.reason })

  const send = (res, code, body, type = 'application/json') => {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    res.writeHead(code, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(data)
  }

  const noteFailure = (ip) => {
    const t = now()
    const f = failures.get(ip)
    failures.set(ip, !f || t - f.since > 60000 ? { count: 1, since: t } : { count: f.count + 1, since: f.since })
  }
  const blocked = (ip) => { const f = failures.get(ip); return Boolean(f && now() - f.since <= 60000 && f.count >= config.maxFailuresPerMinute) }

  // ------------------------------------------------------------ node side (phones)
  async function node(req, res, url) {
    const ip = req.socket.remoteAddress || ''
    if (!isPrivateAddress(ip)) return send(res, 403, { error: 'private networks only' })
    if (blocked(ip)) return send(res, 429, { error: 'too many attempts' })
    const s = byToken(req.headers['x-link-token'])
    if (!s) { noteFailure(ip); return send(res, 401, { error: 'bad token' }) }
    const role = url.searchParams.get('role')
    const action = url.pathname.slice(`${config.prefix}/n/`.length)

    if (action === 'hello' && req.method === 'POST') {
      const body = parseJson(await readBody(req, 2048))
      if (!ROLES.includes(body.role)) return send(res, 400, { error: 'role must be thermal or normal' })
      Object.assign(s.nodes[body.role], { lastSeen: now(), label: String(body.label || '').slice(0, 60), mode: String(body.mode || '').slice(0, 30) })
      return send(res, 200, { ok: true, capture: wants(s, body.role), reason: s.reason })
    }
    if (!ROLES.includes(role)) return send(res, 400, { error: 'role must be thermal or normal' })
    const n = s.nodes[role]
    n.lastSeen = now()

    if (action === 'frame' && req.method === 'POST') {
      if (!wants(s, role)) return send(res, 409, { ok: false, capture: false }) // not wanted: refused, never stored
      if (n.frameAt && now() - n.frameAt < config.minFrameGapMs) return send(res, 429, { ok: false, error: 'slow down' })
      if (role === 'thermal') {
        const frame = parseJson(await readBody(req, config.maxJsonBytes))
        if (!validThermalFrame(frame, config.maxGrid)) return send(res, 400, { error: 'bad thermal frame' })
        n.frame = { width: frame.width, height: frame.height, temps: frame.temps }
      } else {
        const jpeg = await readBody(req, config.maxJpegBytes)
        if (!isJpeg(jpeg)) return send(res, 415, { error: 'JPEG expected' })
        n.frame = jpeg
      }
      n.frameAt = now(); n.frames += 1
      return send(res, 200, { ok: true, capture: wants(s, role) })
    }
    if (action === 'poll' && req.method === 'GET') {
      const known = url.searchParams.get('capture') === '1'
      const current = wants(s, role)
      if (current !== known) return send(res, 200, { capture: current, reason: s.reason })
      const expiry = s.until[role] - now()
      const wait = Math.max(50, Math.min(config.pollMs, current && expiry > 0 ? expiry + 50 : config.pollMs))
      await new Promise((resolve) => {
        const w = { wake: () => { clearTimeout(timer); s.waiters.delete(w); resolve() } }
        const timer = setTimeout(w.wake, wait)
        s.waiters.add(w)
        res.on('close', w.wake)
      })
      if (res.destroyed || res.writableEnded) return undefined // the phone went away while waiting
      n.lastSeen = now()
      return send(res, 200, { capture: wants(s, role), reason: s.reason })
    }
    if (action === 'bye' && req.method === 'POST') { n.lastSeen = 0; return send(res, 200, { ok: true }) }
    return send(res, 404, { error: 'not found' })
  }

  // ------------------------------------------------------------ consumer side (the app)
  async function consumer(req, res, url) {
    if (!isLoopback(req.socket.remoteAddress) || !sameOriginOnly(req)) return send(res, 403, { error: 'local app only' })
    const action = url.pathname.slice(`${config.prefix}/c/`.length)
    const patient = url.searchParams.get('patient')

    if (action === 'info' && req.method === 'GET') return send(res, 200, info)
    if (action === 'session' && req.method === 'POST') {
      const { patientId } = parseJson(await readBody(req, 1024))
      if (!patientId || typeof patientId !== 'string') return send(res, 400, { error: 'patientId required' })
      const s = sessionFor(patientId)
      return send(res, 200, { token: s.token, status: status(s) })
    }
    if (action === 'reset' && req.method === 'POST') {
      const { patientId } = parseJson(await readBody(req, 1024))
      const old = sessions.get(patientId)
      if (old) { old.until = { thermal: 0, normal: 0 }; wake(old); sessions.delete(patientId) }
      const s = sessionFor(patientId)
      return send(res, 200, { token: s.token, status: status(s) })
    }
    const s = sessions.get(patient)
    if (!s) return send(res, 404, { error: 'no pairing for this patient' })

    if (action === 'status' && req.method === 'GET') return send(res, 200, status(s))
    if (action === 'watch' && req.method === 'POST') {
      const { thermal } = parseJson(await readBody(req, 512))
      s.until.thermal = thermal ? now() + config.thermalWantMs : 0
      if (!thermal) { s.nodes.thermal.frame = null; s.nodes.thermal.frameAt = 0 }
      wake(s)
      return send(res, 200, status(s))
    }
    if (action === 'normal' && req.method === 'POST') {
      const { on, reason } = parseJson(await readBody(req, 1024))
      s.until.normal = on ? now() + config.normalWantMs : 0
      s.reason = on ? String(reason || '').slice(0, 120) : ''
      if (!on) { s.nodes.normal.frame = null; s.nodes.normal.frameAt = 0 } // privacy: delete the last picture at once
      wake(s)
      return send(res, 200, status(s))
    }
    if (action === 'frame/thermal' && req.method === 'GET') {
      const n = s.nodes.thermal
      if (!n.frame || now() - n.frameAt > config.staleMs) return send(res, 503, { error: 'no-signal' })
      return send(res, 200, { ...n.frame, at: n.frameAt })
    }
    if (action === 'frame/normal' && req.method === 'GET') {
      const n = s.nodes.normal
      if (!wants(s, 'normal')) return send(res, 409, { error: 'camera-off' })
      if (!n.frame || now() - n.frameAt > config.staleMs) return send(res, 503, { error: 'no-signal' })
      return send(res, 200, n.frame, 'image/jpeg')
    }
    return send(res, 404, { error: 'not found' })
  }

  /**
   * Returns true when the request belonged to the gateway (and was answered). `sides` says which doors this
   * listener opens: the phone-facing port opens only 'node', the app's own server opens both.
   */
  async function handle(req, res, sides = ['node', 'consumer']) {
    const url = new URL(req.url, 'http://gateway')
    const isNode = sides.includes('node') && url.pathname.startsWith(`${config.prefix}/n/`)
    const isConsumer = sides.includes('consumer') && url.pathname.startsWith(`${config.prefix}/c/`)
    if (!isNode && !isConsumer) return false
    try {
      await (isNode ? node(req, res, url) : consumer(req, res, url))
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'server error' })
    }
    return true
  }

  return {
    handle,
    setInfo: (next) => { info = { ...info, ...next } },
    getInfo: () => info,
    tokenFor: (patientId) => sessionFor(patientId).token,
    statusFor: (patientId) => { const s = sessions.get(patientId); return s ? status(s) : null },
  }
}
