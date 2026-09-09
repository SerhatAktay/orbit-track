// src/app.js
import { BlobFile } from '../vendor/bbi.bundle.js'
import { createGenome, resetView } from './genome.js'
import {
  createSignalTrack,
  createAnnotationTrack,
  addTrack,
  setVisibility,
  reorderTrack,
  setColor,
  visibleTracksInOrder,
  checkGenomeLengthMismatch,
} from './tracks.js'
import { openBigWig, getBinnedValues } from './parse-bigwig.js'
import { parseAnnotation } from './parse-annotation.js'
import { computeTrackBands, signalTrackPath, annotationFeaturePath } from './render.js'
import { attachZoomPan, renderTrackPanel } from './interaction.js'

const canvasArea = document.getElementById('canvas-area')
const svg = document.getElementById('canvas')
const viewport = document.getElementById('viewport')
const panel = document.getElementById('track-list')
const errorBanner = document.getElementById('error-banner')
const resetZoomBtn = document.getElementById('reset-zoom')

let genome = null
let trackList = []
const bigWigHandles = new Map()

function showError(message) {
  errorBanner.textContent = message
  errorBanner.style.display = 'block'
  setTimeout(() => { errorBanner.style.display = 'none' }, 6000)
}

async function render() {
  if (!genome) return
  viewport.innerHTML = ''
  const cx = svg.clientWidth / 2
  const cy = svg.clientHeight / 2
  const maxRadius = Math.min(cx, cy) - 10
  const visible = visibleTracksInOrder(trackList)
  const bands = computeTrackBands(visible, { minRadius: 30, maxRadius, bandGap: 4 })

  for (const { track, innerRadius, outerRadius } of bands) {
    if (track.type === 'annotation') {
      for (const feature of track.features) {
        const d = annotationFeaturePath(feature, { innerRadius, outerRadius }, genome.length)
        appendPath(d, track.color, cx, cy)
      }
      continue
    }

    const handle = bigWigHandles.get(track.id)
    if (!handle) continue
    const { start, end } = genome.view
    const chromName = Object.keys(handle.chromSizes)[0]

    if (track.strand === 'paired') {
      const [plusBins, minusBins] = await Promise.all([
        getBinnedValues(handle.plus, chromName, start, end, track.binCount),
        getBinnedValues(handle.minus, chromName, start, end, track.binCount),
      ])
      const merged = plusBins.map((b, i) => ({ start: b.start, value: b.value - minusBins[i].value }))
      const d = signalTrackPath(merged, { innerRadius, outerRadius }, genome.length, { mirrored: true })
      appendPath(d, track.color, cx, cy)
    } else {
      const bins = await getBinnedValues(handle.single, chromName, start, end, track.binCount)
      const d = signalTrackPath(bins, { innerRadius, outerRadius }, genome.length)
      appendPath(d, track.color, cx, cy)
    }
  }

  renderTrackPanel(panel, trackList, {
    onVisibilityChange: (id, visible) => { trackList = setVisibility(trackList, id, visible); render() },
    onColorChange: (id, color) => { trackList = setColor(trackList, id, color); render() },
    onReorder: (id, newOrder) => { trackList = reorderTrack(trackList, id, newOrder); render() },
  })
}

function appendPath(d, color, cx, cy) {
  if (!d) return
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('transform', `translate(${cx},${cy})`)
  path.setAttribute('fill', color)
  path.setAttribute('fill-opacity', '0.7')
  viewport.appendChild(path)
}

async function handleBigWigFile(file) {
  const handle = await openBigWig(new BlobFile(file))
  const chromName = Object.keys(handle.chromSizes)[0]
  const length = handle.chromSizes[chromName]

  if (!genome) {
    genome = resetView(createGenome(length))
  }

  return { handle, length, name: file.name.replace(/\.(bw|bigwig)$/i, '') }
}

async function handleDroppedFiles(files) {
  const bigwigFiles = files.filter((f) => /\.(bw|bigwig)$/i.test(f.name))
  const annotationFiles = files.filter((f) => /\.(bed|gtf|gff3?)$/i.test(f.name))
  const knownFiles = new Set([...bigwigFiles, ...annotationFiles])
  const unknownFiles = files.filter((f) => !knownFiles.has(f))

  for (const file of unknownFiles) {
    showError(`"${file.name}" isn't a recognized bigWig or annotation file.`)
  }

  for (const file of annotationFiles) {
    try {
      const text = await file.text()
      const features = parseAnnotation(text, file.name)
      trackList = addTrack(trackList, createAnnotationTrack({ name: file.name, features }))
    } catch (err) {
      showError(`Couldn't parse "${file.name}": ${err.message}`)
    }
  }

  for (const file of bigwigFiles) {
    try {
      const { handle, length, name } = await handleBigWigFile(file)
      const track = createSignalTrack({ name, files: { single: file.name }, genomeLength: length })
      if (checkGenomeLengthMismatch(track, genome.length)) {
        showError(`"${file.name}" genome length (${length}) doesn't match the loaded genome (${genome.length}); it will be clipped.`)
      }
      bigWigHandles.set(track.id, { chromSizes: handle.chromSizes, single: handle.handle })
      trackList = addTrack(trackList, track)
    } catch (err) {
      showError(`Couldn't parse "${file.name}": ${err.message}`)
    }
  }

  render()
}

canvasArea.addEventListener('dragover', (e) => { e.preventDefault(); canvasArea.classList.add('dragover') })
canvasArea.addEventListener('dragleave', () => canvasArea.classList.remove('dragover'))
canvasArea.addEventListener('drop', (e) => {
  e.preventDefault()
  canvasArea.classList.remove('dragover')
  handleDroppedFiles([...e.dataTransfer.files])
})

resetZoomBtn.addEventListener('click', () => {
  if (genome) { genome = resetView(genome); render() }
})

// Pass a getter rather than `genome` itself: attachZoomPan runs once, here,
// before any file has loaded (genome is still null). Its wheel/pointer
// handlers call getGenome() on every event, so they always see whatever
// `genome` currently is — including the real one created later in
// handleBigWigFile — instead of closing over the null/placeholder value
// that existed at attach time.
attachZoomPan(svg, () => genome, (next) => { genome = next; render() })
