// src/genome.js
// ponytail: view window doesn't wrap across position 0 (e.g. a zoom spanning
// the D-loop across the origin isn't representable as one window). Add
// wraparound [start,end] support if that becomes a real need.

export function createGenome(length) {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`Genome length must be a positive number, got ${length}`)
  }
  return { length, view: { start: 0, end: length } }
}

export function isFullView(genome) {
  return genome.view.start === 0 && genome.view.end === genome.length
}

export function setView(genome, start, end) {
  const clampedStart = Math.max(0, Math.min(start, genome.length))
  const clampedEnd = Math.max(clampedStart, Math.min(end, genome.length))
  return { ...genome, view: { start: clampedStart, end: clampedEnd } }
}

export function resetView(genome) {
  return setView(genome, 0, genome.length)
}

export function viewSpan(genome) {
  return genome.view.end - genome.view.start
}
