import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { LINK, createGateway, isLoopback, isPrivateAddress, sameOriginOnly } from '../server/phoneGateway'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6])
const grid = (w = 4, h = 3, t = 25) => ({ width: w, height: h, temps: new Array(w * h).fill(t) })

/** Calls the gateway without a network: a fake request in, { status, json | body } out. */
async function call(gateway, { method = 'GET', url, token, body, remote = '127.0.0.1', headers = {} }) {
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  const req = Readable.from(payload.length ? [payload] : [])
  Object.assign(req, { method, url, headers: { host: 'localhost:5173', 'content-length': String(payload.length), ...(token ? { 'x-link-token': token } : {}), ...headers }, socket: { remoteAddress: remote } })
  const res = new EventEmitter()
  const out = new Promise((resolve) => {
    res.headersSent = false
    res.writeHead = (status, head) => { res.status = status; res.head = head; res.headersSent = true }
    res.end = (data) => { const type = res.head['Content-Type']; resolve({ status: res.status, type, body: data, json: type === 'application/json' ? JSON.parse(data.toString()) : null }) }
  })
  const handled = await gateway.handle(req, res)
  if (!handled) return { handled: false }
  return out
}

const setup = (overrides = {}) => {
  const clock = { t: 1_000_000 }
  const gateway = createGateway({ now: () => clock.t, config: { ...LINK, ...overrides } })
  return { gateway, clock }
}
const pair = async (gateway, patientId = 'p1') => (await call(gateway, { method: 'POST', url: '/phone-link/c/session', body: { patientId } })).json.token
const app = (gateway, action, body, patient = 'p1') => call(gateway, { method: 'POST', url: `/phone-link/c/${action}?patient=${patient}`, body })

describe('phone gateway: pairing and who may talk to it', () => {
  it('a listener can open only the phone side', async () => {
    const { gateway } = setup()
    const req = Object.assign(Readable.from([]), { method: 'GET', url: '/phone-link/c/info', headers: { host: 'x' }, socket: { remoteAddress: '127.0.0.1' } })
    expect(await gateway.handle(req, new EventEmitter(), ['node'])).toBe(false)
  })
  it('ignores URLs that are not its own', async () => {
    expect((await call(setup().gateway, { url: '/api/other' })).handled).toBe(false)
  })
  it('gives each patient one token, the same one on repeat, a new one after reset', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(await pair(gateway)).toBe(token)
    expect(await pair(gateway, 'p2')).not.toBe(token)
    const reset = await call(gateway, { method: 'POST', url: '/phone-link/c/reset', body: { patientId: 'p1' } })
    expect(reset.json.token).not.toBe(token)
    expect((await call(gateway, { method: 'POST', url: '/phone-link/n/hello', token, body: { role: 'thermal' } })).status).toBe(401)
  })
  it('phones need the token, and repeated wrong guesses are blocked', async () => {
    const { gateway } = setup({ maxFailuresPerMinute: 3 })
    await pair(gateway)
    const guess = () => call(gateway, { method: 'POST', url: '/phone-link/n/hello', token: 'nope', body: { role: 'thermal' } })
    expect([(await guess()).status, (await guess()).status, (await guess()).status]).toEqual([401, 401, 401])
    expect((await guess()).status).toBe(429)
  })
  it('only private-network addresses may be phones', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    const hello = (remote) => call(gateway, { method: 'POST', url: '/phone-link/n/hello', token, remote, body: { role: 'thermal' } })
    expect((await hello('8.8.8.8')).status).toBe(403)
    expect((await hello('192.168.42.129')).status).toBe(200)
    expect((await hello('::ffff:10.1.2.3')).status).toBe(200)
    expect(['10.0.0.1', '172.16.5.5', '172.31.9.9', '192.168.1.1', '169.254.3.3', '127.0.0.1', 'fe80::1'].every(isPrivateAddress)).toBe(true)
    expect(['8.8.8.8', '172.32.0.1', '11.0.0.1', '192.169.0.1'].some(isPrivateAddress)).toBe(false)
  })
  it('the app side answers only this computer and never another website', async () => {
    const { gateway } = setup()
    const attempt = (extra) => call(gateway, { url: '/phone-link/c/info', ...extra })
    expect((await attempt({})).status).toBe(200)
    expect((await attempt({ remote: '192.168.42.50' })).status).toBe(403)
    expect((await attempt({ headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await attempt({ headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403)
    expect((await attempt({ headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200)
    expect((await attempt({ headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await attempt({ headers: { origin: 'http://localhost:5173' } })).status).toBe(200)
    expect(isLoopback('::1') && isLoopback('::ffff:127.0.0.1') && !isLoopback('192.168.0.2')).toBe(true)
    expect(sameOriginOnly({ headers: {} })).toBe(true)
  })
})

describe('phone gateway: thermal phone', () => {
  const frame = (gateway, token, body) => call(gateway, { method: 'POST', url: '/phone-link/n/frame?role=thermal', token, body })
  const latest = (gateway) => call(gateway, { url: '/phone-link/c/frame/thermal?patient=p1' })

  it('registers, reports connected, and refuses frames until the app says watch', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    await call(gateway, { method: 'POST', url: '/phone-link/n/hello', token, body: { role: 'thermal', label: 'Pixel 7', mode: 'silhouette' } })
    const st = (await call(gateway, { url: '/phone-link/c/status?patient=p1' })).json
    expect(st.thermal).toMatchObject({ connected: true, label: 'Pixel 7', mode: 'silhouette', capturing: false })
    expect(st.normal.connected).toBe(false)
    expect((await frame(gateway, token, grid())).status).toBe(409)
    await app(gateway, 'watch', { thermal: true })
    expect((await frame(gateway, token, grid(4, 3, 31))).status).toBe(200)
    const got = await latest(gateway)
    expect(got.status).toBe(200)
    expect(got.json).toMatchObject({ width: 4, height: 3 })
    expect(got.json.temps[0]).toBe(31)
  })
  it('a frame that stops arriving becomes "no signal" so the app falls back to voice', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    await app(gateway, 'watch', { thermal: true })
    await frame(gateway, token, grid())
    clock.t += LINK.staleMs + 1
    expect((await latest(gateway)).status).toBe(503)
  })
  it('stops wanting thermal when the app stops renewing, and when told to stop', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    await app(gateway, 'watch', { thermal: true })
    clock.t += LINK.thermalWantMs + 1
    expect((await frame(gateway, token, grid())).status).toBe(409)
    await app(gateway, 'watch', { thermal: true })
    await frame(gateway, token, grid())
    await app(gateway, 'watch', { thermal: false })
    expect((await latest(gateway)).status).toBe(503)
  })
  it('rejects malformed frames', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    await app(gateway, 'watch', { thermal: true })
    expect((await frame(gateway, token, { width: 4, height: 3, temps: [1, 2] })).status).toBe(400)
    expect((await frame(gateway, token, { ...grid(), temps: new Array(12).fill('hot') })).status).toBe(400)
    expect((await frame(gateway, token, { width: 999, height: 999, temps: [] })).status).toBe(400)
    expect((await frame(gateway, token, { ...grid(), temps: new Array(12).fill(9000) })).status).toBe(400)
    expect((await call(gateway, { method: 'POST', url: '/phone-link/n/frame?role=thermal', token, body: Buffer.from('not json') })).status).toBe(400)
    expect((await call(gateway, { method: 'POST', url: '/phone-link/n/frame?role=thermal', token, body: Buffer.alloc(LINK.maxJsonBytes + 5, 1) })).status).toBe(413)
  })
  it('limits how fast a phone may send', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    await app(gateway, 'watch', { thermal: true })
    expect((await frame(gateway, token, grid())).status).toBe(200)
    expect((await frame(gateway, token, grid())).status).toBe(429)
    clock.t += LINK.minFrameGapMs + 1
    expect((await frame(gateway, token, grid())).status).toBe(200)
  })
})

describe('phone gateway: normal camera privacy', () => {
  const send = (gateway, token, body = JPEG) => call(gateway, { method: 'POST', url: '/phone-link/n/frame?role=normal', token, body })
  const picture = (gateway) => call(gateway, { url: '/phone-link/c/frame/normal?patient=p1' })

  it('refuses and never stores a picture the app did not ask for', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    expect((await send(gateway, token)).status).toBe(409)
    expect((await picture(gateway)).status).toBe(409)
    await app(gateway, 'normal', { on: true, reason: 'voice change' })
    expect((await picture(gateway)).status).toBe(503) // nothing arrived yet: not the refused one
  })
  it('passes pictures through while on, deletes the last one the moment it is switched off', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    const on = await app(gateway, 'normal', { on: true, reason: 'voice change' })
    expect(on.json).toMatchObject({ reason: 'voice change', normal: { capturing: true } })
    expect((await send(gateway, token)).status).toBe(200)
    const got = await picture(gateway)
    expect(got).toMatchObject({ status: 200, type: 'image/jpeg' })
    expect(Buffer.compare(got.body, JPEG)).toBe(0)
    await app(gateway, 'normal', { on: false })
    expect((await picture(gateway)).status).toBe(409)
    clock.t += LINK.minFrameGapMs + 1
    await app(gateway, 'normal', { on: true })
    expect((await picture(gateway)).status).toBe(503) // the old picture is gone
  })
  it('turns itself off when the app stops renewing it', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    await app(gateway, 'normal', { on: true })
    await send(gateway, token)
    clock.t += LINK.normalWantMs + 1
    expect((await picture(gateway)).status).toBe(409)
    expect((await send(gateway, token)).status).toBe(409)
    expect((await call(gateway, { url: '/phone-link/c/status?patient=p1' })).json.normal.capturing).toBe(false)
  })
  it('accepts only real JPEGs of a sane size', async () => {
    const { gateway, clock } = setup()
    const token = await pair(gateway)
    await app(gateway, 'normal', { on: true })
    expect((await send(gateway, token, Buffer.from('GIF89a-not-a-jpeg'))).status).toBe(415)
    clock.t += 500
    expect((await send(gateway, token, Buffer.concat([JPEG, Buffer.alloc(LINK.maxJpegBytes)]))).status).toBe(413)
  })
})

describe('phone gateway: commands for the phone', () => {
  const poll = (gateway, token, role, capture) => call(gateway, { url: `/phone-link/n/poll?role=${role}&capture=${capture}`, token })

  it('answers at once when the phone is out of step', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    await app(gateway, 'normal', { on: true })
    expect((await poll(gateway, token, 'normal', 0)).json.capture).toBe(true)
    await app(gateway, 'normal', { on: false })
    expect((await poll(gateway, token, 'normal', 1)).json.capture).toBe(false)
  })
  it('a waiting phone hears about a change straight away', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    const waiting = poll(gateway, token, 'normal', 0)
    await new Promise((r) => setTimeout(r, 20))
    await app(gateway, 'normal', { on: true, reason: 'check' })
    expect((await waiting).json.capture).toBe(true)
  })
  it('gives up waiting after the poll window and keeps the phone marked connected', async () => {
    const { gateway } = setup({ pollMs: 60 })
    const token = await pair(gateway)
    const answer = await poll(gateway, token, 'thermal', 0)
    expect(answer.json.capture).toBe(false)
    expect((await call(gateway, { url: '/phone-link/c/status?patient=p1' })).json.thermal.connected).toBe(true)
  })
  it('a phone that says goodbye is shown as disconnected', async () => {
    const { gateway } = setup()
    const token = await pair(gateway)
    await call(gateway, { method: 'POST', url: '/phone-link/n/hello', token, body: { role: 'normal' } })
    await call(gateway, { method: 'POST', url: '/phone-link/n/bye?role=normal', token })
    expect((await call(gateway, { url: '/phone-link/c/status?patient=p1' })).json.normal.connected).toBe(false)
  })
  it('reports addresses for the setup screen', async () => {
    const { gateway } = setup()
    gateway.setInfo({ addresses: [{ address: '192.168.42.10', name: 'Ethernet 3' }], httpsPort: 8443, tls: true })
    expect((await call(gateway, { url: '/phone-link/c/info' })).json).toMatchObject({ httpsPort: 8443, tls: true, addresses: [{ address: '192.168.42.10' }] })
  })
})
