import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTrackBands, signalTrackPath, annotationFeaturePath } from '../src/render.js'

test('computeTrackBands divides the radius range evenly with a gap', () => {
  const bands = computeTrackBands([{ id: 1 }, { id: 2 }], {
    minRadius: 100,
    maxRadius: 200,
    bandGap: 4,
  })
  assert.equal(bands.length, 2)
  assert.equal(bands[0].innerRadius, 102)
  assert.equal(bands[0].outerRadius, 148)
  assert.equal(bands[1].innerRadius, 152)
  assert.equal(bands[1].outerRadius, 198)
})

test('signalTrackPath returns empty string for no bins', () => {
  assert.equal(signalTrackPath([], { innerRadius: 10, outerRadius: 20 }, 1000), '')
})

test('signalTrackPath produces a closed path starting with M and ending with Z', () => {
  const bins = [
    { start: 0, value: 1 },
    { start: 250, value: 5 },
    { start: 500, value: 2 },
    { start: 750, value: 0 },
  ]
  const d = signalTrackPath(bins, { innerRadius: 10, outerRadius: 20 }, 1000)
  assert.match(d, /^M/)
  assert.match(d, /Z$/)
})

test('signalTrackPath mirrored keeps points within outerRadius from center', () => {
  const bins = [
    { start: 0, value: 1 },
    { start: 500, value: -1 },
  ]
  const d = signalTrackPath(bins, { innerRadius: 10, outerRadius: 30 }, 1000, { mirrored: true })
  const coords = [...d.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ])
  for (const [x, y] of coords) {
    assert.ok(Math.hypot(x, y) <= 30.0001)
  }
})

test('annotationFeaturePath produces a closed wedge path', () => {
  const d = annotationFeaturePath({ start: 0, end: 500, name: 'x' }, { innerRadius: 50, outerRadius: 60 }, 2000)
  assert.match(d, /^M/)
  assert.match(d, /Z$/)
})
