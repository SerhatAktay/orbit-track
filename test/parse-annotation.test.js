// test/parse-annotation.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseBed, parseGtf, parseAnnotation } from '../src/parse-annotation.js'

test('parseBed parses fields and defaults strand to null', () => {
  const text = readFileSync(new URL('./fixtures/sample.bed', import.meta.url), 'utf8')
  const features = parseBed(text)
  assert.equal(features.length, 3)
  assert.deepEqual(features[0], { name: 'D-loop', start: 0, end: 576, strand: '+' })
})

test('parseBed rejects malformed lines', () => {
  assert.throws(() => parseBed('chrM\t0\n'), /Invalid BED line/)
})

test('parseGtf converts 1-based inclusive to 0-based half-open and reads gene_name', () => {
  const line = 'chrM\tsource\tgene\t1\t576\t.\t+\t.\tgene_id "ND1"; gene_name "MT-ND1";\n'
  const features = parseGtf(line)
  assert.deepEqual(features[0], { name: 'MT-ND1', start: 0, end: 576, strand: '+' })
})

test('parseAnnotation dispatches on file extension', () => {
  const bedText = readFileSync(new URL('./fixtures/sample.bed', import.meta.url), 'utf8')
  assert.equal(parseAnnotation(bedText, 'foo.bed').length, 3)
})
