// test/genome.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGenome, setView, resetView, isFullView, viewSpan } from '../src/genome.js'

test('createGenome starts at full view', () => {
  const g = createGenome(16569)
  assert.equal(g.length, 16569)
  assert.deepEqual(g.view, { start: 0, end: 16569 })
  assert.equal(isFullView(g), true)
})

test('createGenome rejects non-positive length', () => {
  assert.throws(() => createGenome(0), /positive number/)
  assert.throws(() => createGenome(-5), /positive number/)
})

test('setView clamps to genome bounds', () => {
  const g = createGenome(1000)
  const zoomed = setView(g, -50, 2000)
  assert.deepEqual(zoomed.view, { start: 0, end: 1000 })
  assert.equal(isFullView(zoomed), true)
})

test('setView clamps end to not go below start', () => {
  const g = createGenome(1000)
  const zoomed = setView(g, 500, 100)
  assert.equal(zoomed.view.end >= zoomed.view.start, true)
})

test('resetView restores full circle and viewSpan reports window size', () => {
  const g = setView(createGenome(1000), 100, 300)
  assert.equal(viewSpan(g), 200)
  assert.equal(viewSpan(resetView(g)), 1000)
})
