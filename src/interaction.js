// src/interaction.js
import { zoomAt, panBy } from './genome.js'
import { TAU } from './render.js'

const angleOf = (svgEl, event) => {
  const r = svgEl.getBoundingClientRect()
  return Math.atan2(event.clientY - r.top - r.height / 2, event.clientX - r.left - r.width / 2)
}

// Fraction (0..1) round the ring from 12 o'clock, clockwise.
export const fracOf = (svgEl, event) => ((((angleOf(svgEl, event) + Math.PI / 2) / TAU) % 1) + 1) % 1

export function radiusOf(svgEl, event) {
  const r = svgEl.getBoundingClientRect()
  return Math.hypot(event.clientX - r.left - r.width / 2, event.clientY - r.top - r.height / 2)
}

// `getGenome` returns the *current* genome: this is wired once before any file
// loads, so handlers must read live state instead of closing over a stale value.
// onClick fires for a press-release without drag.
export function attachZoomPan(svgEl, getGenome, onChange, onClick) {
  let last = null // last pointer angle while dragging
  let moved = 0

  svgEl.addEventListener('wheel', (event) => {
    event.preventDefault()
    const genome = getGenome()
    if (!genome) return
    const factor = Math.exp(event.deltaY * 0.0015) // smooth for trackpads and wheels
    onChange(zoomAt(genome, factor, fracOf(svgEl, event)))
  }, { passive: false })

  svgEl.addEventListener('pointerdown', (event) => {
    if (!getGenome()) return
    last = angleOf(svgEl, event)
    moved = 0
    svgEl.setPointerCapture(event.pointerId)
  })

  svgEl.addEventListener('pointermove', (event) => {
    if (last === null) return
    const genome = getGenome()
    if (!genome) return
    const a = angleOf(svgEl, event)
    let delta = a - last
    if (delta > Math.PI) delta -= TAU
    if (delta < -Math.PI) delta += TAU
    last = a
    moved += Math.abs(delta) * radiusOf(svgEl, event)
    if (moved > 4) onChange(panBy(genome, -(delta / TAU) * genome.view.span))
  })

  svgEl.addEventListener('pointerup', (event) => {
    if (last !== null && moved <= 4 && onClick) onClick(event)
    last = null
  })

  svgEl.addEventListener('dblclick', (event) => {
    const genome = getGenome()
    if (genome) onChange(zoomAt(genome, event.shiftKey ? 2 : 0.5, fracOf(svgEl, event)))
  })
}
