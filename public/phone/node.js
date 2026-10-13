// The phone page. It links this phone to CareBridge on the PC (over USB tethering, Wi-Fi or any private network).
//   thermal phone: while the app is watching, sends a small grid of heat (never a picture of a face)
//   camera phone : camera stays OFF until the app asks for a live check, sends pictures only while it is on
// The phone's owner stays in control: "Pause sharing" and "Disconnect" turn the camera off at once.

import { SilhouetteSensor, backoffMs, parseLink, testFrame, toThermalGrid } from './node-core.js'

const $ = (id) => document.getElementById(id)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const link = parseLink(location.hash || location.search)
const role = link?.role
const FRAME_MS = { thermal: 500, normal: 700 }
const state = { running: false, paused: false, capture: false, stream: null, frameTimer: null, busy: false, tick: 0, failures: 0, wakeLock: null, poll: null, sensor: new SilhouetteSensor() }
const scratch = document.createElement('canvas')

const mode = () => (role === 'thermal' ? $('mode').value : 'camera')
// the video is always in the page (some phones stop decoding a hidden one); it is just invisible unless it is the camera phone
const setVideoVisible = (visible) => $('video').classList.toggle('offscreen', !visible)

function show(text, tone = '', detail = '') {
  const badge = $('badge')
  badge.textContent = text
  badge.className = tone
  $('detail').textContent = detail
}

function banner(text, on = false) {
  const el = $('cameraBanner')
  el.hidden = !text
  el.textContent = text || ''
  el.className = `banner ${on ? 'on' : 'off'}`
  document.body.classList.toggle('private', role === 'normal' && !state.capture)
}

function explain(error) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was refused. Allow the camera for this site in the browser settings, then tap Start again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No matching camera was found. Pick another camera in the list.'
  if (name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.'
  return error?.message || 'Something went wrong.'
}

function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'x-link-token': link.token }
  let payload
  if (body instanceof Blob) { headers['content-type'] = 'image/jpeg'; payload = body } else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
  return fetch(`/phone-link/n/${path}`, { method, headers, body: payload, signal, cache: 'no-store' })
}

// ------------------------------------------------------------------ camera
async function grantCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open a camera.')
  const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }) // asks permission once
  probe.getTracks().forEach((t) => t.stop())
  const select = $('camera')
  const chosen = select.value
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  select.replaceChildren(new Option('Default (rear camera)', ''), ...devices.map((d, i) => new Option(d.label || `Camera ${i + 1}`, d.deviceId)))
  select.value = devices.some((d) => d.deviceId === chosen) ? chosen : ''
}

async function openCamera() {
  const id = $('camera').value
  const size = { width: { ideal: 640 }, height: { ideal: 480 } }
  state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: id ? { deviceId: { exact: id }, ...size } : { facingMode: { ideal: 'environment' }, ...size } })
  const video = $('video')
  video.srcObject = state.stream
  await video.play()
  state.stream.getVideoTracks()[0].addEventListener('ended', () => setCapture(false))
}

function closeCamera() {
  state.stream?.getTracks().forEach((t) => t.stop())
  state.stream = null
  $('video').srcObject = null
}

function drawGrid(frame) {
  const canvas = $('preview')
  canvas.width = frame.width; canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(frame.width, frame.height)
  frame.temps.forEach((t, i) => {
    const k = Math.max(0, Math.min(1, (t - 20) / 20))
    img.data.set([Math.round(255 * Math.min(1, k * 2)), Math.round(255 * Math.max(0, k * 2 - 1)), Math.round(120 * (1 - k)), 255], i * 4)
  })
  ctx.putImageData(img, 0, 0)
}

async function nextFrame() {
  if (role === 'normal') {
    const video = $('video')
    const scale = Math.min(1, 640 / (video.videoWidth || 640))
    scratch.width = Math.round((video.videoWidth || 640) * scale)
    scratch.height = Math.round((video.videoHeight || 480) * scale)
    scratch.getContext('2d').drawImage(video, 0, 0, scratch.width, scratch.height)
    return new Promise((resolve) => scratch.toBlob(resolve, 'image/jpeg', 0.6))
  }
  let grid
  if (mode() === 'test') grid = testFrame($('scenario').value, state.tick++)
  else {
    scratch.width = 64; scratch.height = 48
    const ctx = scratch.getContext('2d', { willReadFrequently: true })
    ctx.drawImage($('video'), 0, 0, 64, 48)
    const image = ctx.getImageData(0, 0, 64, 48)
    grid = mode() === 'camera'
      ? toThermalGrid(image, { palette: $('palette').value, minC: Number($('minC').value) || 20, maxC: Number($('maxC').value) || 40 })
      : state.sensor.update(image)
  }
  drawGrid(grid)
  return grid
}

function startFrames() {
  stopFrames()
  state.frameTimer = setInterval(async () => {
    if (!state.capture || state.busy) return
    state.busy = true
    try {
      const frame = await nextFrame()
      if (!state.capture || !frame) return
      const res = await api(`frame?role=${role}`, { method: 'POST', body: frame })
      if (res.status === 409) { await setCapture(false); return } // the app does not want pictures right now
      if (res.status === 401) { fatal('This pairing link is no longer valid. Scan the new QR code in CareBridge.'); return }
      if (!res.ok && res.status !== 429) throw new Error(String(res.status))
      state.failures = 0
    } catch {
      state.failures += 1
      if (state.failures >= 3) { await setCapture(false); show('Lost the connection', 'warn', 'Camera off. Trying to reconnect…') }
    } finally { state.busy = false }
  }, FRAME_MS[role])
}

function stopFrames() { clearInterval(state.frameTimer); state.frameTimer = null }

/** Turns sending on or off. Off always closes the camera, so the camera light goes out. */
async function setCapture(on, reason = '') {
  if (on && state.paused) on = false
  if (on === state.capture) { if (on && role === 'normal') banner(`Camera ON: ${reason || 'CareBridge asked for a live check'}`, true); return }
  if (!on) {
    state.capture = false
    stopFrames(); closeCamera()
    setVideoVisible(false)
    banner(state.paused ? 'Paused by you. Nothing is being sent.' : role === 'normal' ? 'Camera off. Nothing is being sent.' : 'Waiting for CareBridge to start watching.')
    return
  }
  try {
    if (role === 'normal' || mode() !== 'test') await openCamera()
    state.capture = true; state.tick = 0; state.failures = 0; state.sensor.reset()
    setVideoVisible(role === 'normal')
    $('preview').hidden = role !== 'thermal'
    startFrames()
    banner(role === 'normal' ? `Camera ON: ${reason || 'CareBridge asked for a live check'}` : 'Sending heat shapes to CareBridge.', role === 'normal')
  } catch (error) {
    show('Camera problem', 'bad', explain(error))
    state.capture = false
    await sleep(3000)
  }
}

// ------------------------------------------------------------------ the link to CareBridge
async function commandLoop() {
  let attempt = 0
  while (state.running) {
    try {
      state.poll = new AbortController()
      const res = await api(`poll?role=${role}&capture=${state.capture ? 1 : 0}`, { signal: state.poll.signal })
      if (res.status === 401) return fatal('This pairing link is no longer valid. Scan the new QR code in CareBridge.')
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      attempt = 0
      if (!state.capture) show('Connected', 'good', role === 'normal' ? 'Camera is off until CareBridge needs a live check.' : 'Ready. CareBridge starts the heat watch when AI care mode is on.')
      await setCapture(Boolean(body.capture), body.reason)
      if (state.capture) show('Connected', 'good', role === 'normal' ? 'The camera is on for a live check. You can pause or disconnect below.' : 'Sending heat shapes. Keep this screen on.')
      if (state.paused) await sleep(2000)
    } catch (error) {
      if (!state.running) return
      attempt += 1
      await setCapture(false)
      show('Reconnecting…', 'warn', 'Cannot reach CareBridge. Check the USB cable or network.')
      await sleep(backoffMs(attempt))
    }
  }
}

async function requestWakeLock() {
  try { state.wakeLock = await navigator.wakeLock?.request('screen') } catch { /* the screen may still dim: fine */ }
}

async function start() {
  $('start').disabled = true
  try {
    if (role === 'normal' || mode() !== 'test') await grantCamera()
    const hello = await api('hello', { method: 'POST', body: { role, label: $('camera').selectedOptions[0]?.text || 'Phone', mode: mode() } })
    if (hello.status === 401) return fatal('This pairing link is no longer valid. Scan the new QR code in CareBridge.')
    if (!hello.ok) throw new Error('CareBridge did not answer')
    state.running = true
    state.paused = false
    await requestWakeLock()
    $('setup').hidden = true; $('live').hidden = false
    $('pause').textContent = 'Pause sharing'
    banner(role === 'normal' ? 'Camera off. Nothing is being sent.' : 'Waiting for CareBridge to start watching.')
    show('Connected', 'good', 'Keep this page open and the screen on.')
    commandLoop()
  } catch (error) {
    show('Could not start', 'bad', explain(error))
    $('start').disabled = false
  }
}

async function stop(message = 'Disconnected') {
  state.running = false
  state.poll?.abort()
  await setCapture(false)
  api(`bye?role=${role}`, { method: 'POST', body: {} }).catch(() => {})
  try { await state.wakeLock?.release() } catch { /* ignore */ }
  $('live').hidden = true; $('setup').hidden = false; $('start').disabled = false
  banner(null)
  show(message, 'warn', 'Tap Start to connect again.')
}

function fatal(message) {
  stop('Pairing problem').then(() => show('Pairing problem', 'bad', message))
}

// ------------------------------------------------------------------ page
function setup() {
  if (!link) { show('Not a pairing link', 'bad', 'In CareBridge open AI Companion, scroll to "Phone cameras", and scan the QR code for this phone.'); return }
  if (!window.isSecureContext) { show('Camera blocked', 'bad', 'This page is not secure, so the browser blocks the camera. Open the https:// link from the QR code and accept the one-time certificate warning.'); return }
  $('title').textContent = role === 'thermal' ? 'Thermal phone' : 'Camera phone'
  $('roleLine').textContent = role === 'thermal' ? 'Watches heat shapes only. No faces and no pictures leave this phone.' : 'Stays OFF until CareBridge needs a live check. Then it sends pictures only for as long as needed.'
  $('roleHelp').textContent = role === 'thermal'
    ? 'No thermal attachment? Choose "Silhouette". It sends only a coarse moving shape and cannot measure temperature.'
    : 'Point this phone at the bed or chair. The camera is off until CareBridge asks, and the screen goes black meanwhile.'
  $('modeBox').hidden = role !== 'thermal'
  const updateMode = () => {
    const m = mode()
    $('cameraSettings').hidden = !(role === 'thermal' && m === 'camera')
    $('scenarioBox').hidden = !(role === 'thermal' && m === 'test')
    $('cameraBox').hidden = role === 'thermal' && m === 'test'
  }
  $('mode').addEventListener('change', updateMode)
  updateMode()
  $('setup').hidden = false
  show('Not started', '', 'Tap Start. Your browser asks for camera permission once.')
  $('start').addEventListener('click', start)
  $('pause').addEventListener('click', async () => {
    state.paused = !state.paused
    $('pause').textContent = state.paused ? 'Resume sharing' : 'Pause sharing'
    if (state.paused) { await setCapture(false); show('Paused by you', 'warn', 'Nothing is being sent.') }
  })
  $('stop').addEventListener('click', () => stop())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.running) requestWakeLock() })
}

setup()
