// src/draw.js
// Builds the SVG scene from already-fetched data. Everything is styled with
// inline attributes so the serialized SVG exports identically.
import {
  TAU,
  computeTrackBands,
  computeScale,
  signalPath,
  zeroLineRadius,
  arcPath,
  visibleSegments,
  rulerTicks,
  niceStep,
  formatBp,
  relAngle,
  polar,
} from './render.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

function el(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (parent) parent.appendChild(node)
  return node
}

function text(parent, str, x, y, attrs = {}) {
  const t = el('text', { x, y, 'font-family': FONT, ...attrs }, parent)
  t.textContent = str
  return t
}

// Rotation that keeps tangent text upright.
function uprightRotation(angle) {
  let rot = (angle * 180) / Math.PI + 90
  rot = ((rot % 360) + 360) % 360
  return rot > 90 && rot < 270 ? rot + 180 : rot
}

function onColor(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#111' : '#fff'
}

export const fmtVal = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toPrecision(2))

// data: Map(trackId -> { bins } | { plusBins, minusBins }) for signal tracks.
// Returns the scene geometry used for hit-testing.
export function drawScene(root, { width, height, genome, tracks, data, theme }) {
  root.replaceChildren()
  const cx = width / 2
  const cy = height / 2
  const { length, view } = genome
  const { start: vs, span } = view
  const full = span >= length

  el('rect', { x: 0, y: 0, width, height, fill: theme.bg }, root)
  const g = el('g', { transform: `translate(${cx},${cy})` }, root)

  const rulerR = Math.min(cx, cy) - 40
  const maxRadius = rulerR - 8
  const minRadius = Math.max(28, rulerR * 0.2)
  const scene = { cx, cy, rulerR, minRadius, maxRadius, bands: [] }
  if (rulerR < 60) return scene

  // Ruler.
  el('circle', { r: rulerR, fill: 'none', stroke: theme.fg, 'stroke-width': 1 }, g)
  const step = niceStep(span)
  for (const t of rulerTicks(length, vs, span)) {
    const a = relAngle(t.rel, span)
    const len = t.major ? 8 : 4
    const [x1, y1] = polar(rulerR, a)
    const [x2, y2] = polar(rulerR + len, a)
    el('line', { x1, y1, x2, y2, stroke: theme.fg, 'stroke-width': t.major ? 1 : 0.6 }, g)
    if (t.major) {
      const [lx, ly] = polar(rulerR + 18, a)
      const label = step >= 1000 ? formatBp(t.bp) : t.bp.toLocaleString('en-US')
      text(g, label, lx, ly, {
        'font-size': 10,
        fill: theme.muted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        transform: `rotate(${uprightRotation(a)} ${lx} ${ly})`,
      })
    }
  }
  if (!full) {
    // Mark the seam where the window wraps onto itself.
    const [x1, y1] = polar(minRadius - 4, -Math.PI / 2)
    const [x2, y2] = polar(rulerR, -Math.PI / 2)
    el('line', { x1, y1, x2, y2, stroke: theme.accent, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g)
  }

  // Centre read-out.
  const range = full
    ? `${length.toLocaleString('en-US')} bp`
    : `${Math.round(vs + 1).toLocaleString('en-US')}–${Math.round(((vs + span - 1) % length) + 1).toLocaleString('en-US')}`
  text(g, genome.name, 0, -8, { 'font-size': 15, 'font-weight': 600, fill: theme.fg, 'text-anchor': 'middle' })
  text(g, range, 0, 10, { 'font-size': 11, fill: theme.muted, 'text-anchor': 'middle' })
  if (!full) text(g, `${Math.round(span).toLocaleString('en-US')} bp window`, 0, 24, { 'font-size': 10, fill: theme.muted, 'text-anchor': 'middle' })

  scene.bands = computeTrackBands(tracks, { minRadius: minRadius + 34, maxRadius, bandGap: 4 })
  const fs = 10

  for (const band of scene.bands) {
    const { track, innerRadius, outerRadius } = band
    const bandG = el('g', {}, g)
    el('circle', { r: (innerRadius + outerRadius) / 2, fill: 'none', stroke: theme.grid, 'stroke-width': outerRadius - innerRadius }, bandG)

    let caption = track.name
    if (track.type === 'annotation') {
      drawAnnotation(bandG, band, genome, theme)
    } else {
      const d = data.get(track.id)
      if (d) {
        const mirrored = track.strand === 'paired'
        const all = mirrored ? d.plusBins.concat(d.minusBins) : d.bins
        const scale = computeScale(
          all.map((b) => b.value),
          track.yScale,
          mirrored
        )
        band.scale = scale
        band.data = d
        const zero = zeroLineRadius(band, scale)
        if (scale.lo < 0) el('circle', { r: zero, fill: 'none', stroke: theme.muted, 'stroke-width': 0.5, 'stroke-dasharray': '2 2' }, bandG)
        const layers = mirrored
          ? [
              [d.plusBins.map((b) => ({ ...b, value: Math.abs(b.value) })), track.color],
              [d.minusBins.map((b) => ({ ...b, value: -Math.abs(b.value) })), track.colorMinus],
            ]
          : [[d.bins, track.color]]
        for (const [bins, color] of layers) {
          el('path', { d: signalPath(bins, band, vs, span, scale), fill: color, 'fill-opacity': 0.75, stroke: color, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }, bandG)
        }
        caption += `  ${fmtVal(scale.lo)}…${fmtVal(scale.hi)}`
      }
    }
    const t = text(g, caption, -6, -outerRadius + fs + 1, { 'font-size': fs, fill: theme.fg, 'text-anchor': 'end', stroke: theme.bg, 'stroke-width': 3, 'paint-order': 'stroke' })
    t.setAttribute('pointer-events', 'none')
  }
  return scene
}

function drawAnnotation(parent, band, genome, theme) {
  const { track, innerRadius, outerRadius } = band
  const { length, view } = genome
  const { start: vs, span } = view
  const laneH = (outerRadius - innerRadius) / track.laneCount
  band.hits = []
  for (const f of track.features) {
    const lane = f.lane ?? 0
    const inner = innerRadius + lane * laneH + 0.5
    const outer = innerRadius + (lane + 1) * laneH - 0.5
    const mid = (inner + outer) / 2
    for (const seg of visibleSegments(f, length, vs, span)) {
      // Arrow tip only when the tip end is really the feature end.
      const strand = f.strand === '+' && !seg.clippedEnd ? '+' : f.strand === '-' && !seg.clippedStart ? '-' : null
      const d = arcPath(seg.rel0, seg.rel1, span, inner, outer, strand)
      el('path', { d, fill: track.color, stroke: theme.bg, 'stroke-width': 0.6 }, parent)
      band.hits.push({ feature: f, rel0: seg.rel0, rel1: seg.rel1, inner, outer })

      const fontSize = Math.min(11, (outer - inner) * 0.8)
      const arcPx = ((seg.rel1 - seg.rel0) / span) * TAU * mid
      if (fontSize >= 6.5 && f.name.length * fontSize * 0.58 + 6 <= arcPx) {
        const a = relAngle((seg.rel0 + seg.rel1) / 2, span)
        const [x, y] = polar(mid, a)
        const t = text(parent, f.name, x, y, {
          'font-size': fontSize,
          fill: onColor(track.color),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          transform: `rotate(${uprightRotation(a)} ${x} ${y})`,
        })
        t.setAttribute('pointer-events', 'none')
      }
    }
  }
}
