import { describe, expect, it } from 'vitest'
import { addressHint, describeNode, ensureSession, getStatus, normalFrameUrl, pairingLinks, setNormalCamera, setWatch, thermalFrameUrl } from '../src/companion/phoneLink'
import { mergeProfile } from '../src/companion/config'

const token = 'b'.repeat(32)
const info = { httpsPort: 8443, tls: true, addresses: [{ address: '192.168.42.10', name: 'Ethernet 3' }, { address: '192.168.137.1', name: 'Local Area Connection* 4' }] }

describe('pairing links', () => {
  it('makes one link per network address for each phone', () => {
    const links = pairingLinks(info, token)
    expect(links).toHaveLength(2)
    expect(links[0].thermal).toBe(`https://192.168.42.10:8443/phone/#role=thermal&t=${token}`)
    expect(links[0].normal).toBe(`https://192.168.42.10:8443/phone/#role=normal&t=${token}`)
    expect(links[1].hint).toBe('Windows Mobile Hotspot')
  })
  it('falls back to http when there is no certificate, and to nothing when the gateway is not ready', () => {
    expect(pairingLinks({ ...info, tls: false }, token)[0].thermal.startsWith('http://')).toBe(true)
    expect(pairingLinks(null, token)).toEqual([])
    expect(pairingLinks({ ...info, httpsPort: null }, token)).toEqual([])
    expect(pairingLinks(info, null)).toEqual([])
  })
  it('explains which network is which', () => {
    expect(addressHint('192.168.42.77')).toMatch(/USB tethering/)
    expect(addressHint('192.168.43.1')).toMatch(/hotspot/)
    expect(addressHint('172.20.10.2')).toMatch(/iPhone/)
    expect(addressHint('192.168.56.1')).toMatch(/not a phone/)
    expect(addressHint('10.1.1.1')).toBe('local network')
  })
})

describe('describing a phone', () => {
  it('waits, then shows what the phone is doing', () => {
    expect(describeNode(null, 'thermal')).toEqual({ tone: 'neutral', text: 'Waiting for the phone…' })
    expect(describeNode({ connected: false }, 'normal').tone).toBe('neutral')
    expect(describeNode({ connected: true, label: 'Pixel 7', mode: 'silhouette', capturing: false }, 'thermal').text).toBe('Pixel 7 · silhouette · ready, waiting for AI care mode')
    expect(describeNode({ connected: true, label: 'Pixel 7', mode: 'silhouette', capturing: true, frameAgeMs: 400 }, 'thermal')).toMatchObject({ tone: 'green' })
    expect(describeNode({ connected: true, label: 'Pixel 7', capturing: true, frameAgeMs: 9000 }, 'thermal').tone).toBe('gold')
  })
  it('says the camera phone is private when off and ON when watching', () => {
    expect(describeNode({ connected: true, label: 'Moto', capturing: false }, 'normal').text).toMatch(/camera off \(private\)/)
    expect(describeNode({ connected: true, label: 'Moto', capturing: true }, 'normal').text).toMatch(/camera ON/)
  })
})

describe('calling the local gateway', () => {
  const ok = (body) => async () => ({ ok: true, json: async () => body })
  it('asks for a session, status, watch and camera on the same origin', async () => {
    const calls = []
    const fake = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) } }
    await ensureSession('p1', fake); await getStatus('p 1', fake); await setWatch('p1', true, fake); await setNormalCamera('p1', true, 'voice change', fake); await setNormalCamera('p1', false, '', fake)
    expect(calls.map((c) => c.url)).toEqual(['/phone-link/c/session', '/phone-link/c/status?patient=p%201', '/phone-link/c/watch?patient=p1', '/phone-link/c/normal?patient=p1', '/phone-link/c/normal?patient=p1'])
    expect(JSON.parse(calls[0].init.body)).toEqual({ patientId: 'p1' })
    expect(JSON.parse(calls[3].init.body)).toEqual({ on: true, reason: 'voice change' })
    expect(JSON.parse(calls[4].init.body).on).toBe(false)
    expect(thermalFrameUrl('p1')).toBe('/phone-link/c/frame/thermal?patient=p1')
    expect(normalFrameUrl('p1')).toBe('/phone-link/c/frame/normal?patient=p1')
  })
  it('returns null instead of throwing when the gateway is missing or refuses', async () => {
    expect(await getStatus('p1', async () => { throw new Error('offline') })).toBeNull()
    expect(await getStatus('p1', async () => ({ ok: false, status: 404 }))).toBeNull()
    expect(await getStatus('p1', ok({ thermal: {} }))).toEqual({ thermal: {} })
  })
})

describe('settings for phones', () => {
  it('thermal watch is on by default and Gemma vision is on, with older saved profiles still loading', () => {
    const fresh = mergeProfile({})
    expect(fresh.thermal.alwaysOn).toBe(true)
    expect(fresh.vision).toMatchObject({ enabled: true, intervalSec: 10 })
    const old = mergeProfile({ thermal: { kind: 'http', url: 'http://x', cctvKind: 'ip', cctvUrl: 'http://y' } })
    expect(old.thermal).toMatchObject({ kind: 'http', alwaysOn: true })
    expect(old.vision.enabled).toBe(true)
  })
})
