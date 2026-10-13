// The phone-facing listener. The CareBridge app itself stays on 127.0.0.1 only; THIS is the one narrow door the
// phones use. It serves the phone page (public/phone/*) and the token-protected /phone-link/n/* endpoints, from
// private-network addresses only, over HTTPS so the phone browser allows its camera. Everything else is a 404.

import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { isPrivateAddress } from './phoneGateway.js'
import { ensureCert, lanAddresses } from './phoneCert.js'

export const PHONE_PORT = 8443
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' }

/** Maps a URL path to a file inside public/phone, or null. Only plain file names; no folders, no traversal. */
export function resolveAsset(pathname, root) {
  const clean = decodeURIComponent(pathname)
  if (clean === '/phone' || clean === '/phone/') return path.join(root, 'index.html')
  const m = /^\/phone\/([A-Za-z0-9._-]+)$/.exec(clean)
  if (!m || m[1].startsWith('.') || !TYPES[path.extname(m[1])]) return null
  const file = path.join(root, m[1])
  return file.startsWith(root) && fs.existsSync(file) ? file : null
}

function requestHandler(gateway, root) {
  return async (req, res) => {
    const deny = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end(text) }
    if (!isPrivateAddress(req.socket.remoteAddress || '')) return deny(403, 'private networks only')
    if (await gateway.handle(req, res, ['node'])) return undefined // phones never get the app's side
    let pathname
    try { pathname = new URL(req.url, 'http://x').pathname } catch { return deny(400, 'bad request') }
    if (pathname === '/') { res.writeHead(302, { Location: '/phone/' }); return res.end() }
    let file = null
    try { file = resolveAsset(pathname, root) } catch { file = null }
    if (!file || req.method !== 'GET') return deny(404, 'not found')
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    return fs.createReadStream(file).pipe(res)
  }
}

const listen = (server, port, host) => new Promise((resolve, reject) => {
  const fail = (error) => reject(error)
  server.once('error', fail)
  server.listen(port, host, () => { server.off('error', fail); resolve(server.address().port) })
})

/** Starts the listener (HTTPS when a certificate can be made, else plain HTTP with a warning). Resolves a handle. */
export async function startPhoneServers({ gateway, publicDir, certDir, port = PHONE_PORT, host = '0.0.0.0', log = () => {} }) {
  const root = path.join(publicDir, 'phone')
  let addresses = lanAddresses()
  const cert = await ensureCert({ dir: certDir, addresses })
  const handler = requestHandler(gateway, root)
  const server = cert.ok ? https.createServer({ key: cert.key, cert: cert.cert }, handler) : http.createServer(handler)
  let bound = null
  for (let p = port; p < port + 10 && bound === null; p += 1) {
    try { bound = await listen(server, p, host) } catch (error) { if (error.code !== 'EADDRINUSE') throw error }
  }
  if (bound === null) { log(`Phone link: ports ${port}-${port + 9} are busy, so phones cannot connect.`); return { close() {}, port: null } }

  const publish = () => gateway.setInfo({
    addresses, httpsPort: bound, tls: cert.ok, fingerprint: cert.ok ? cert.fingerprint : null,
    note: cert.ok ? '' : `${cert.reason} Phones need HTTPS to open their camera.`,
  })
  publish()
  log(`Phone link ready on port ${bound} (${cert.ok ? 'HTTPS' : 'HTTP: no certificate'}). Addresses: ${addresses.map((a) => a.address).join(', ') || 'none yet'}`)

  // A phone that is plugged in or tethered later brings a new network: pick it up, and re-issue the certificate for it.
  const watcher = setInterval(async () => {
    const next = lanAddresses()
    if (next.map((a) => a.address).join() === addresses.map((a) => a.address).join()) return
    addresses = next
    if (cert.ok) {
      const fresh = await ensureCert({ dir: certDir, addresses })
      if (fresh.ok) { server.setSecureContext({ key: fresh.key, cert: fresh.cert }); cert.fingerprint = fresh.fingerprint }
    }
    publish()
  }, 8000)
  watcher.unref()
  return { port: bound, close: () => { clearInterval(watcher); server.close() } }
}
