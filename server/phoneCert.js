// Self-signed certificate for the phone gateway. Phone browsers only allow camera access on secure pages, so the
// gateway speaks HTTPS; the phone shows a one-time "not private" warning that the person accepts.
// Needs the `openssl` command (it ships with Git for Windows, macOS and Linux). No npm package required.

import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isPrivateAddress } from './phoneGateway.js'

const OPENSSL = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe', '/usr/bin/openssl', '/usr/local/bin/openssl', '/opt/homebrew/bin/openssl']
const MAX_AGE_MS = 300 * 24 * 3600 * 1000

/** This computer's private IPv4 addresses (the ones a phone on a cable, hotspot or Wi-Fi can reach). */
export function lanAddresses(interfaces = os.networkInterfaces()) {
  const found = []
  for (const [name, list] of Object.entries(interfaces)) {
    for (const item of list || []) {
      if ((item.family === 'IPv4' || item.family === 4) && !item.internal && isPrivateAddress(item.address)) found.push({ address: item.address, name })
    }
  }
  return found
}

const run = (bin, args) => new Promise((resolve, reject) => execFile(bin, args, { windowsHide: true, timeout: 20000 }, (error, stdout, stderr) => (error ? reject(error) : resolve({ stdout, stderr }))))

async function generate(dir, names, exec) {
  const alt = names.map((n) => (/^\d+\.\d+\.\d+\.\d+$/.test(n) ? `IP:${n}` : `DNS:${n}`)).join(',')
  const args = ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '365', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'), '-subj', '/CN=CareBridge phone gateway', '-addext', `subjectAltName=${alt}`]
  let lastError = null
  for (const bin of OPENSSL) {
    try { await exec(bin, args); return null } catch (error) { lastError = error }
  }
  return lastError
}

/**
 * Returns { ok, key, cert, fingerprint, names } or { ok: false, reason }. Reuses the saved certificate while it still
 * covers every current address; makes a new one when a new network (for example a freshly tethered phone) appears.
 */
export async function ensureCert({ dir, addresses, exec = run, now = Date.now() }) {
  const names = ['localhost', '127.0.0.1', ...addresses.map((a) => a.address)]
  const keyPath = path.join(dir, 'key.pem'), certPath = path.join(dir, 'cert.pem'), metaPath = path.join(dir, 'meta.json')
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (fs.existsSync(keyPath) && fs.existsSync(certPath) && names.every((n) => meta.names.includes(n)) && now - meta.createdAt < MAX_AGE_MS) return describe(keyPath, certPath, meta.names)
  } catch { /* no usable certificate yet */ }
  fs.mkdirSync(dir, { recursive: true })
  const error = await generate(dir, names, exec)
  if (error) return { ok: false, reason: `Could not create a certificate (is OpenSSL installed?): ${error.message}` }
  fs.writeFileSync(metaPath, JSON.stringify({ names, createdAt: now }))
  return describe(keyPath, certPath, names)
}

function describe(keyPath, certPath, names) {
  const cert = fs.readFileSync(certPath)
  return { ok: true, key: fs.readFileSync(keyPath), cert, fingerprint: new crypto.X509Certificate(cert).fingerprint256, names }
}
