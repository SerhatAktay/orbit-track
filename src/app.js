// src/app.js — state, file loading, render loop, hover/click.
import { BlobFile } from '../vendor/bbi.bundle.js'
import { createGenome, resetView, zoomToRange, bpAtRel, isFullView } from './genome.js'
import {
  PALETTE,
  createSignalTrack,
  createAnnotationTrack,
  addTrack,
  removeTrack,
  setVisibility,
  reorderTrack,
  setColor,
  setYScale,
  setBinCount,
  setWeight,
  visibleTracksInOrder,
  checkGenomeLengthMismatch,
  pairBigWigFiles,
  packLanes,
} from './tracks.js'
import { openBigWig, getBinnedValues } from './parse-bigwig.js'
import { parseAnnotation, normChrom } from './parse-annotation.js'
import { drawScene, fmtVal } from './draw.js'
import { TAU } from './render.js'
import { attachZoomPan, fracOf, radiusOf } from './interaction.js'
import { renderTrackPanel } from './ui.js'
import { exportSvg, exportPng, exportHtml } from './export.js'
import { captureSession, parseSession, applySessionTracks, applySessionView } from './session.js'

const $ = (id) => document.getElementById(id)
const canvasArea = $('canvas-area')
const svg = $('canvas')
const viewport = $('viewport')
const overlay = $('overlay')
const panel = $('track-list')
const errorBanner = $('error-banner')
const tooltip = $('tooltip')
const status = $('status')
const chromSelect = $('chrom')

const ANNOTATION_COLORS = ['#8da0cb', '#fc8d62', '#66c2a5', '#e78ac3', '#a6d854', '#ffd92f']

let genome = null
let genomeDerived = false // length guessed from annotations, replaced by the first bigWig
let trackList = []
let scene = null
const bigWigHandles = new Map() // trackId -> { chromSizes, single } | { chromSizes, plus, minus }

// ---- helpers ---------------------------------------------------------------

let errorTimer
function showError(message) {
  errorBanner.textContent = message
  errorBanner.style.display = 'block'
  clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { errorBanner.style.display = 'none' }, 6000)
}

function theme() {
  const css = getComputedStyle(document.documentElement)
  const v = (n) => css.getPropertyValue(n).trim()
  return { bg: v('--bg'), fg: v('--fg'), muted: v('--muted'), grid: v('--grid'), accent: v('--accent') }
}

// Real chromosome name in a bigWig that matches the one on screen (chrM == MT == M).
function resolveChrom(chromSizes, name) {
  if (name in chromSizes) return name
  return Object.keys(chromSizes).find((c) => normChrom(c) === normChrom(name)) ?? null
}

const annotationCache = new WeakMap() // track -> { chrom, track }
// Keep features on the displayed chromosome. Files using other chrom names
// (none match) show everything rather than nothing.
function annotationForChrom(track) {
  const hit = annotationCache.get(track)
  if (hit && hit.chrom === genome.name) return hit.track
  const mine = track.features.filter((f) => normChrom(f.chrom) === normChrom(genome.name))
  const features = mine.length ? mine : track.features
  const { lanes, laneCount } = packLanes(features)
  const out = { ...track, laneCount, features: features.map((f, i) => ({ ...f, lane: lanes[i] })) }
  annotationCache.set(track, { chrom: genome.name, track: out })
  return out
}

function updateChromList() {
  const names = new Set()
  for (const h of bigWigHandles.values()) for (const c of Object.keys(h.chromSizes)) names.add(c)
  chromSelect.replaceChildren(...[...names].map((c) => Object.assign(document.createElement('option'), { value: c, textContent: c })))
  chromSelect.hidden = names.size < 2
  if (genome && names.has(genome.name)) chromSelect.value = genome.name
}

function chromLengthFor(name) {
  for (const h of bigWigHandles.values()) {
    const c = resolveChrom(h.chromSizes, name)
    if (c) return h.chromSizes[c]
  }
  let max = 0
  for (const t of trackList) if (t.type === 'annotation') for (const f of t.features) if (normChrom(f.chrom) === normChrom(name)) max = Math.max(max, f.start, f.end, f.chromLength ?? 0)
  return max
}

// ---- rendering -------------------------------------------------------------

let renderGeneration = 0
let pending = false
function requestRender() {
  if (pending) return
  pending = true
  requestAnimationFrame(() => { pending = false; render() })
}

async function fetchSignal(track, handle, autoBins) {
  const { start, span } = genome.view
  const n = Math.max(1, Math.min(track.binCount || autoBins, Math.ceil(span)))
  const load = (reader) => {
    const chrom = resolveChrom(handle.chromSizes, genome.name)
    if (!chrom) return Promise.resolve(Array.from({ length: n }, (_, i) => ({ start: start + (i * span) / n, end: start + ((i + 1) * span) / n, value: 0 })))
    return getBinnedValues(reader, chrom, start, start + span, n, genome.length)
  }
  if (track.strand === 'paired') {
    const [plusBins, minusBins] = await Promise.all([load(handle.plus), load(handle.minus)])
    return { plusBins, minusBins }
  }
  return { bins: await load(handle.single) }
}

async function render() {
  if (!genome) return
  const gen = ++renderGeneration
  const width = svg.clientWidth
  const height = svg.clientHeight
  const visible = visibleTracksInOrder(trackList).map((t) => (t.type === 'annotation' ? annotationForChrom(t) : t))
  const autoBins = Math.max(180, Math.min(2000, Math.round((TAU * (Math.min(width, height) / 2 - 48)) / 2.5)))

  // Fetch everything first, then draw in one go: no half-drawn frames, and a
  // newer render (fast wheel zoom) can supersede this one before any DOM write.
  const data = new Map()
  try {
    await Promise.all(
      visible
        .filter((t) => t.type === 'signal' && bigWigHandles.has(t.id))
        .map(async (t) => data.set(t.id, await fetchSignal(t, bigWigHandles.get(t.id), autoBins)))
    )
  } catch (err) {
    showError(`Couldn't read signal: ${err.message}`)
    return
  }
  if (gen !== renderGeneration) return

  scene = drawScene(viewport, { width, height, genome, tracks: visible, data, theme: theme() })
  overlay.replaceChildren()
  $('empty').style.display = trackList.length ? 'none' : 'flex'
  status.textContent = isFullView(genome) ? '' : `${Math.round(genome.view.span).toLocaleString('en-US')} bp window`
}

// ---- file loading ----------------------------------------------------------

function addAnnotationTrack(name, features) {
  const count = trackList.filter((t) => t.type === 'annotation').length
  trackList = addTrack(trackList, createAnnotationTrack({ name, features, color: ANNOTATION_COLORS[count % ANNOTATION_COLORS.length] }))
  if (!genome) {
    const len = Math.max(...features.map((f) => Math.max(f.start, f.end, f.chromLength ?? 0)), 1)
    genome = resetView(createGenome(len, features[0]?.chrom ?? 'genome'))
    genomeDerived = true
  }
}

async function openEntry(entry) {
  const signals = entry.single ? { single: entry.single } : { plus: entry.plus, minus: entry.minus }
  const opened = {}
  for (const [key, file] of Object.entries(signals)) opened[key] = await openBigWig(new BlobFile(file))
  const first = Object.values(opened)[0]
  const chromName = Object.keys(first.chromSizes)[0]
  const length = first.chromSizes[chromName]

  if (!genome || genomeDerived) {
    genome = resetView(createGenome(length, chromName))
    genomeDerived = false
  }
  const count = trackList.filter((t) => t.type === 'signal').length
  const paired = !entry.single
  const track = createSignalTrack({
    name: entry.name,
    files: paired ? { plus: entry.plus.name, minus: entry.minus.name } : { single: entry.single.name },
    strand: paired ? 'paired' : 'unstranded',
    color: PALETTE[count % PALETTE.length],
    colorMinus: PALETTE[(count + 1) % PALETTE.length],
    genomeLength: length,
  })
  if (checkGenomeLengthMismatch(track, genome.length)) {
    showError(`"${entry.name}" chromosome length (${length.toLocaleString('en-US')}) differs from the loaded genome (${genome.length.toLocaleString('en-US')}); the tail is clipped or empty.`)
  }
  bigWigHandles.set(track.id, {
    chromSizes: first.chromSizes,
    ...(paired ? { plus: opened.plus.handle, minus: opened.minus.handle } : { single: opened.single.handle }),
  })
  trackList = addTrack(trackList, track)
}

async function handleFiles(files) {
  const bigwigs = files.filter((f) => /\.(bw|bigwig)$/i.test(f.name))
  const annotations = files.filter((f) => /\.(bed|gtf|gff3?|gbk?|gbff|genbank)$/i.test(f.name))
  const known = new Set([...bigwigs, ...annotations])
  for (const f of files) if (!known.has(f)) showError(`"${f.name}" isn't a bigWig (.bw) or annotation (.bed/.gtf/.gff) file.`)

  for (const entry of pairBigWigFiles(bigwigs)) {
    try {
      await openEntry(entry)
    } catch (err) {
      showError(`Couldn't read "${entry.name}": ${err.message}`)
    }
  }
  for (const file of annotations) {
    try {
      const features = parseAnnotation(await file.text(), file.name)
      if (!features.length) throw new Error('no features found')
      addAnnotationTrack(file.name, features)
    } catch (err) {
      showError(`Couldn't parse "${file.name}": ${err.message}`)
    }
  }
  updateChromList()
  applyPendingSession()
  rebuildPanel()
  requestRender()
}

// A loaded session waits here until its tracks' files are opened.
let pendingSession = null
function applyPendingSession() {
  if (!pendingSession) return
  trackList = applySessionTracks(pendingSession, trackList)
  genome = applySessionView(pendingSession, genome)
}

async function loadSessionFile(file) {
  try {
    pendingSession = parseSession(await file.text())
    applyPendingSession()
    rebuildPanel()
    requestRender()
    showError(`Session "${file.name}" loaded. Open its data files (same names) to restore tracks.`)
  } catch (err) {
    showError(`Couldn't read session: ${err.message}`)
  }
}

function saveSession() {
  const blob = new Blob([JSON.stringify(captureSession(genome, trackList), null, 2)], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${genome?.name ?? 'orbit'}_session.json` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Human mtDNA (rCRS, NC_012920.1) protein and rRNA genes; D-loop wraps the origin.
function loadDemo() {
  const g = (name, s, e, strand = '+') => ({ chrom: 'chrM', name, start: s - 1, end: e, strand, type: 'gene' })
  const features = [
    g('MT-RNR1', 648, 1601), g('MT-RNR2', 1671, 3229), g('MT-ND1', 3307, 4262), g('MT-ND2', 4470, 5511),
    g('MT-CO1', 5904, 7445), g('MT-CO2', 7586, 8269), g('MT-ATP8', 8366, 8572), g('MT-ATP6', 8527, 9207),
    g('MT-CO3', 9207, 9990), g('MT-ND3', 10059, 10404), g('MT-ND4L', 10470, 10766), g('MT-ND4', 10760, 12137),
    g('MT-ND5', 12337, 14148), g('MT-ND6', 14149, 14673, '-'), g('MT-CYB', 14747, 15887),
    { chrom: 'chrM', name: 'D-loop', start: 16023, end: 576, strand: null, type: 'control region' },
  ]
  trackList = []
  bigWigHandles.clear()
  genome = resetView(createGenome(16569, 'chrM'))
  addAnnotationTrack('Genes (demo)', features)
  genomeDerived = false
  updateChromList()
  rebuildPanel()
  requestRender()
}

// ---- panel -----------------------------------------------------------------

function update(next, { rebuild = false } = {}) {
  trackList = next
  if (rebuild) rebuildPanel()
  requestRender()
}

function rebuildPanel() {
  renderTrackPanel(panel, trackList, {
    onVisibility: (id, v) => update(setVisibility(trackList, id, v)),
    onColor: (id, c) => update(setColor(trackList, id, c)),
    onColorMinus: (id, c) => update(trackList.map((t) => (t.id === id ? { ...t, colorMinus: c } : t))),
    onReorder: (id, order) => update(reorderTrack(trackList, id, order), { rebuild: true }),
    onRemove: (id) => { bigWigHandles.delete(id); update(removeTrack(trackList, id), { rebuild: true }) },
    onWeight: (id, w) => update(setWeight(trackList, id, w)),
    onYScale: (id, patch, rebuild) => update(setYScale(trackList, id, patch), { rebuild: !!rebuild }),
    onBinCount: (id, n) => update(setBinCount(trackList, id, n)),
  })
}

// ---- hover / click ---------------------------------------------------------

function locate(event) {
  if (!genome || !scene || !scene.bands) return null
  const r = radiusOf(svg, event)
  const rel = fracOf(svg, event) * genome.view.span
  const bp = bpAtRel(genome, rel)
  const band = scene.bands.find((b) => r >= b.innerRadius && r <= b.outerRadius)
  return { r, rel, bp, band }
}

function describe(loc) {
  const { band, rel, bp } = loc
  const pos = `${genome.name}:${Math.floor(bp + 1).toLocaleString('en-US')}`
  if (!band) return { text: pos, feature: null }
  if (band.track.type === 'annotation') {
    const hit = (band.hits || []).find((h) => loc.r >= h.inner && loc.r <= h.outer && rel >= h.rel0 && rel <= h.rel1)
    if (!hit) return { text: `${band.track.name}\n${pos}`, feature: null }
    const f = hit.feature
    const len = f.end >= f.start ? f.end - f.start : f.end + genome.length - f.start
    return {
      text: `${f.name}${f.strand ? ` (${f.strand})` : ''}\n${f.start + 1}–${f.end}  ·  ${len.toLocaleString('en-US')} bp${f.type && f.type !== 'feature' ? `\n${f.type}` : ''}`,
      feature: f,
    }
  }
  const d = band.data
  if (!d) return { text: pos, feature: null }
  const bins = d.bins || d.plusBins
  const size = bins[0].end - bins[0].start
  const i = Math.min(bins.length - 1, Math.floor(rel / size))
  const value = d.bins
    ? `${fmtVal(d.bins[i].value)}`
    : `+${fmtVal(Math.abs(d.plusBins[i].value))}  −${fmtVal(Math.abs(d.minusBins[i].value))}`
  return { text: `${band.track.name}\n${pos}  ·  ${value}`, feature: null }
}

svg.addEventListener('pointermove', (event) => {
  const loc = locate(event)
  if (!loc) return
  const rect = canvasArea.getBoundingClientRect()
  if (loc.r <= scene.rulerR + 6) {
    tooltip.textContent = describe(loc).text
    tooltip.style.display = 'block'
    tooltip.style.left = `${event.clientX - rect.left + 14}px`
    tooltip.style.top = `${event.clientY - rect.top + 14}px`
    // Radial cursor guide.
    const a = (loc.rel / genome.view.span) * TAU - Math.PI / 2
    const line = overlay.firstChild || overlay.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'line'))
    line.setAttribute('x1', scene.cx + scene.minRadius * Math.cos(a))
    line.setAttribute('y1', scene.cy + scene.minRadius * Math.sin(a))
    line.setAttribute('x2', scene.cx + scene.rulerR * Math.cos(a))
    line.setAttribute('y2', scene.cy + scene.rulerR * Math.sin(a))
    line.setAttribute('stroke', theme().accent)
    line.setAttribute('stroke-width', 1)
    line.setAttribute('stroke-opacity', 0.6)
  } else {
    tooltip.style.display = 'none'
    overlay.replaceChildren()
  }
})
svg.addEventListener('pointerleave', () => { tooltip.style.display = 'none'; overlay.replaceChildren() })

function onSvgClick(event) {
  const loc = locate(event)
  if (!loc || !loc.band) return
  const { feature } = describe(loc)
  if (feature) { genome = zoomToRange(genome, feature.start, feature.end); requestRender() }
}

// ---- wiring ----------------------------------------------------------------

canvasArea.addEventListener('dragover', (e) => { e.preventDefault(); canvasArea.classList.add('dragover') })
canvasArea.addEventListener('dragleave', () => canvasArea.classList.remove('dragover'))
canvasArea.addEventListener('drop', (e) => {
  e.preventDefault()
  canvasArea.classList.remove('dragover')
  handleFiles([...e.dataTransfer.files])
})
$('open-files').addEventListener('click', () => $('file-input').click())
$('file-input').addEventListener('change', (e) => { handleFiles([...e.target.files]); e.target.value = '' })
$('demo').addEventListener('click', loadDemo)
$('save-session').addEventListener('click', () => genome && saveSession())
$('load-session').addEventListener('click', () => $('session-input').click())
$('session-input').addEventListener('change', (e) => { if (e.target.files[0]) loadSessionFile(e.target.files[0]); e.target.value = '' })
$('reset-zoom').addEventListener('click', () => { if (genome) { genome = resetView(genome); requestRender() } })
chromSelect.addEventListener('change', () => {
  genome = resetView(createGenome(chromLengthFor(chromSelect.value) || genome.length, chromSelect.value))
  requestRender()
})
$('export-svg').addEventListener('click', () => genome && exportSvg(svg, `${genome.name}_orbit`))
$('export-html').addEventListener('click', () => genome && exportHtml(svg, `${genome.name}_orbit`))
$('export-png').addEventListener('click', () => genome && exportPng(svg, `${genome.name}_orbit`).catch((e) => showError(e.message)))
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && genome && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    genome = resetView(genome)
    requestRender()
  }
})
new ResizeObserver(requestRender).observe(canvasArea)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestRender)

// getGenome is a getter: handlers are attached once, before any file loads.
attachZoomPan(svg, () => genome, (next) => { genome = next; requestRender() }, onSvgClick)
rebuildPanel()

// Test/debug hook.
window.orbit = { get genome() { return genome }, get tracks() { return trackList }, handleFiles, loadDemo }
