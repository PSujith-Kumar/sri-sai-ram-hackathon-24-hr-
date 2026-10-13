import { describe, expect, it } from 'vitest'
import { IRONBOW, SilhouetteSensor, backoffMs, heatFraction, parseLink, testFrame, toThermalGrid } from '../public/phone/node-core.js'
import { analyzeThermalFrame } from '../src/companion/thermal'

/** An RGBA picture built from a function (x, y) -> [r, g, b]. */
const picture = (width, height, colour) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const [r, g, b] = colour(x, y); data.set([r, g, b, 255], (y * width + x) * 4) }
  return { data, width, height }
}
const grey = (v) => [v, v, v]

describe('thermal picture -> temperatures', () => {
  it('white-hot maps black to the cold end and white to the hot end of the range', () => {
    const cold = toThermalGrid(picture(64, 48, () => grey(0)), { palette: 'whitehot', minC: 20, maxC: 40 })
    const hot = toThermalGrid(picture(64, 48, () => grey(255)), { palette: 'whitehot', minC: 20, maxC: 40 })
    expect(cold).toMatchObject({ width: 32, height: 24 })
    expect(cold.temps.length).toBe(768)
    expect(new Set(cold.temps)).toEqual(new Set([20]))
    expect(new Set(hot.temps)).toEqual(new Set([40]))
  })
  it('black-hot is the mirror image', () => {
    const dark = toThermalGrid(picture(64, 48, () => grey(0)), { palette: 'blackhot', minC: 20, maxC: 40 })
    expect(dark.temps[0]).toBe(40)
  })
  it('averages each block and honours the temperature range', () => {
    const half = toThermalGrid(picture(64, 48, (x) => (x < 32 ? grey(255) : grey(0))), { minC: 30, maxC: 40 })
    expect(half.temps[0]).toBe(40)
    expect(half.temps[31]).toBe(30)
  })
  it('ironbow colours come back in the right order, cold to hot', () => {
    const at = (i) => heatFraction(...IRONBOW[i], 'ironbow')
    expect(at(0)).toBeLessThan(at(20))
    expect(at(20)).toBeLessThan(at(40))
    expect(at(40)).toBeLessThan(at(63))
    expect(Math.abs(at(32) - 32 / 63)).toBeLessThan(0.05)
  })
  it('works on any picture size', () => {
    expect(toThermalGrid(picture(10, 7, () => grey(128))).temps.length).toBe(768)
  })
})

describe('silhouette sensor (any camera, no temperatures)', () => {
  const room = (x, y) => grey(180 + ((x + y) % 3)) // a bright wall with a little texture
  const person = (x0, y0, w, h) => (x, y) => (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h ? grey(40) : room(x, y))
  const learned = () => {
    const sensor = new SilhouetteSensor()
    for (let i = 0; i < 10; i++) sensor.update(picture(64, 48, room))
    return sensor
  }

  it('shows a cold room while nothing moves', () => {
    const frame = learned().update(picture(64, 48, room))
    expect(new Set(frame.temps)).toEqual(new Set([22]))
  })
  it('keeps only what moved into the picture, as a warm shape', () => {
    const frame = learned().update(picture(64, 48, person(24, 6, 12, 36)))
    const warm = frame.temps.filter((t) => t > 30).length
    expect(warm).toBeGreaterThan(40)
    expect(frame.temps.some((t) => t === 36)).toBe(true) // warmer "head" at the top
    expect(Math.max(...frame.temps)).toBeLessThan(37.8) // never reaches the fever threshold: no temperatures here
  })
  it('the app thermal analyser reads a standing shape as upright and a wide one as lying', () => {
    const standing = analyzeThermalFrame(learned().update(picture(64, 48, person(26, 4, 8, 40))), null)
    const lying = analyzeThermalFrame(learned().update(picture(64, 48, person(6, 28, 50, 12))), null)
    expect(standing).toMatchObject({ presence: true, posture: 'upright' })
    expect(lying).toMatchObject({ presence: true, posture: 'lying' })
  })
  it('a sudden change of the whole picture (light switch, phone moved) restarts learning instead of a false alarm', () => {
    const sensor = learned()
    const frame = sensor.update(picture(64, 48, () => grey(20)))
    expect(new Set(frame.temps)).toEqual(new Set([22]))
    expect(new Set(sensor.update(picture(64, 48, () => grey(20))).temps)).toEqual(new Set([22]))
  })
  it('does not draw anything while it is still learning the first frames', () => {
    const sensor = new SilhouetteSensor()
    expect(new Set(sensor.update(picture(64, 48, person(24, 6, 12, 36))).temps)).toEqual(new Set([22]))
  })
})

describe('phone page helpers', () => {
  it('backs off 0.5 s, 1 s, 2 s... up to 15 s', () => {
    expect([0, 1, 2, 3].map((n) => backoffMs(n, 0.5))).toEqual([500, 1000, 2000, 4000])
    expect(backoffMs(20, 0.5)).toBe(15000)
  })
  it('reads a pairing link only when role and token are valid', () => {
    const token = 'a'.repeat(32)
    expect(parseLink(`#role=thermal&t=${token}`)).toEqual({ role: 'thermal', token })
    expect(parseLink(`?role=normal&t=${token}`)).toEqual({ role: 'normal', token })
    expect(parseLink(`#role=admin&t=${token}`)).toBeNull()
    expect(parseLink('#role=normal&t=short')).toBeNull()
    expect(parseLink('')).toBeNull()
  })
  it('the built-in test pattern has a person who then falls', () => {
    const standing = analyzeThermalFrame(testFrame('fall', 0), null)
    const fallen = analyzeThermalFrame(testFrame('fall', 20), null)
    expect(standing.posture).toBe('upright')
    expect(fallen.posture).toBe('lying')
    expect(analyzeThermalFrame(testFrame('none', 0), null).presence).toBe(false)
  })
})
