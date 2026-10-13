// Pretends to be the two phones, so you can try the whole thermal -> camera -> Gemma 3 chain without any hardware.
//
//   node scripts/simulate-phones.mjs                       # patient p1, someone standing, then falling
//   node scripts/simulate-phones.mjs --scenario normal     # thermal: a person who stays upright
//   node scripts/simulate-phones.mjs --scenario none       # thermal: empty room
//   node scripts/simulate-phones.mjs --image my-room.jpg   # picture the camera phone sends when asked
//   node scripts/simulate-phones.mjs --patient p2 --app http://127.0.0.1:5173 --host https://127.0.0.1:8443
//
// It behaves exactly like public/phone/node.js: it pairs, waits for the app's command, sends heat grids only while
// the app is watching, and sends a camera picture ONLY while the app has switched the camera phone on.

import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testFrame } from '../public/phone/node-core.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []))
const app = args.app || 'http://127.0.0.1:5173'
const host = args.host || 'https://127.0.0.1:8443'
const patientId = args.patient || 'p1'
const scenario = args.scenario || 'fall'
const imagePath = path.resolve(args.image || path.join(here, 'sample-room.jpg'))
const picture = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null

/** One HTTP(S) call; accepts the gateway's self-signed certificate (this is only a local test tool). */
function request(base, route, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, base)
    const lib = url.protocol === 'https:' ? https : http
    const data = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
    const req = lib.request(url, { method, rejectUnauthorized: false, headers: { ...(data ? { 'content-length': data.length } : {}), ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text) } catch { /* not JSON */ } resolve({ status: res.statusCode, json }) })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (who, text) => console.log(`${new Date().toLocaleTimeString()}  ${who.padEnd(7)} ${text}`)
let running = true

async function node(role, token, nextFrame) {
  const call = (route, opts = {}) => request(host, route, { ...opts, headers: { 'x-link-token': token, ...(opts.headers || {}) } })
  const hello = await call('/phone-link/n/hello', { method: 'POST', body: { role, label: 'Simulated phone', mode: role === 'thermal' ? 'test' : 'camera' } })
  if (hello.status !== 200) throw new Error(`${role}: the gateway refused the pairing (${hello.status})`)
  log(role, 'connected, waiting for the app')
  let capture = false
  let sender = null
  let tick = 0
  const setCapture = (on, reason) => {
    if (on === capture) return
    capture = on
    log(role, on ? `${role === 'normal' ? 'CAMERA ON' : 'watching'}${reason ? ` (${reason})` : ''}` : `${role === 'normal' ? 'camera off' : 'stopped'}`)
    clearInterval(sender)
    if (!on) return
    sender = setInterval(async () => {
      const frame = nextFrame(tick++)
      if (!frame) return
      const res = await call(`/phone-link/n/frame?role=${role}`, { method: 'POST', body: frame, headers: { 'content-type': role === 'normal' ? 'image/jpeg' : 'application/json' } }).catch(() => null)
      if (res?.status === 409) setCapture(false)
    }, role === 'normal' ? 700 : 500)
  }
  while (running) {
    const res = await call(`/phone-link/n/poll?role=${role}&capture=${capture ? 1 : 0}`).catch(() => null)
    if (!res || res.status !== 200) { log(role, 'cannot reach the gateway, retrying'); await sleep(2000); continue }
    setCapture(Boolean(res.json.capture), res.json.reason)
  }
  clearInterval(sender)
  await call(`/phone-link/n/bye?role=${role}`, { method: 'POST', body: {} }).catch(() => {})
}

const session = await request(app, '/phone-link/c/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: { patientId } }).catch(() => null)
if (!session || session.status !== 200) {
  console.error(`Could not reach the phone link at ${app}. Start the app first with: npm run dev`)
  process.exit(1)
}
console.log(`Simulating both phones for patient ${patientId}. Thermal scenario: ${scenario}. Camera picture: ${picture ? path.basename(imagePath) : 'none (camera phone will send nothing)'}.`)
console.log('In CareBridge: AI Companion -> Phone cameras -> tick "Use these two phones". Press Ctrl+C here to stop.\n')
process.on('SIGINT', () => { running = false; setTimeout(() => process.exit(0), 600) })
await Promise.all([
  node('thermal', session.json.token, (tick) => testFrame(scenario, tick)),
  node('normal', session.json.token, () => picture),
])
