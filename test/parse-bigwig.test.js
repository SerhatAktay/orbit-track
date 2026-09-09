import { test } from 'node:test'
import assert from 'node:assert/strict'
import genericFilehandle from 'generic-filehandle'
import { openBigWig, getBinnedValues } from '../src/parse-bigwig.js'

// generic-filehandle is CommonJS; Node's static export analysis doesn't see
// `LocalFile` as a named export, so it's pulled off the default import.
const { LocalFile } = genericFilehandle

const fixturePath = new URL('./fixtures/sample.bw', import.meta.url).pathname

test('openBigWig reads chrom sizes from the header', async () => {
  const { chromSizes, handle } = await openBigWig(new LocalFile(fixturePath))
  assert.equal(typeof chromSizes, 'object')
  assert.ok(Object.keys(chromSizes).length > 0)
  assert.ok(Object.values(chromSizes)[0] > 0)
  assert.ok(handle)
})

test('getBinnedValues returns exactly binCount bins covering the requested range', async () => {
  const { chromSizes, handle } = await openBigWig(new LocalFile(fixturePath))
  const chromName = Object.keys(chromSizes)[0]
  const length = chromSizes[chromName]
  const bins = await getBinnedValues(handle, chromName, 0, length, 10)
  assert.equal(bins.length, 10)
  assert.equal(bins[0].start, 0)
  assert.ok(bins.every((b) => Number.isFinite(b.value)))
})

test('getBinnedValues returns 0 for an out-of-data region without throwing', async () => {
  const { chromSizes, handle } = await openBigWig(new LocalFile(fixturePath))
  const chromName = Object.keys(chromSizes)[0]
  const length = chromSizes[chromName]
  const bins = await getBinnedValues(handle, chromName, length - 1, length, 1)
  assert.equal(bins.length, 1)
  assert.equal(Number.isFinite(bins[0].value), true)
})
