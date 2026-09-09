// src/interaction.js
import { setView, viewSpan } from './genome.js'

// `getGenome` is a function returning the *current* genome, not the genome
// itself — attachZoomPan is wired up once, before any file is loaded, so its
// handlers must always read the live genome via this getter rather than
// closing over a value that goes stale the moment app.js replaces `genome`.
export function attachZoomPan(svgEl, getGenome, onChange) {
  let dragStartAngle = null
  let dragStartView = null

  svgEl.addEventListener('wheel', (event) => {
    event.preventDefault()
    const genome = getGenome()
    if (!genome) return
    const zoomFactor = event.deltaY < 0 ? 0.85 : 1 / 0.85
    const span = viewSpan(genome)
    const center = genome.view.start + span / 2
    const newSpan = Math.min(genome.length, Math.max(50, span * zoomFactor))
    const next = setView(genome, center - newSpan / 2, center + newSpan / 2)
    onChange(next)
  })

  svgEl.addEventListener('pointerdown', (event) => {
    const genome = getGenome()
    if (!genome) return
    dragStartAngle = Math.atan2(event.offsetY - svgEl.clientHeight / 2, event.offsetX - svgEl.clientWidth / 2)
    dragStartView = { ...genome.view }
    svgEl.setPointerCapture(event.pointerId)
  })

  svgEl.addEventListener('pointermove', (event) => {
    if (dragStartAngle === null) return
    const genome = getGenome()
    if (!genome) return
    const angle = Math.atan2(event.offsetY - svgEl.clientHeight / 2, event.offsetX - svgEl.clientWidth / 2)
    const deltaBp = ((angle - dragStartAngle) / (2 * Math.PI)) * genome.length
    const next = setView(
      { ...genome, view: dragStartView },
      dragStartView.start - deltaBp,
      dragStartView.end - deltaBp
    )
    onChange(next)
  })

  svgEl.addEventListener('pointerup', () => {
    dragStartAngle = null
  })
}

export function renderTrackPanel(panelEl, trackList, callbacks) {
  panelEl.innerHTML = ''
  for (const track of [...trackList].sort((a, b) => a.order - b.order)) {
    const row = document.createElement('div')
    row.className = 'track-row'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = track.visible
    checkbox.addEventListener('change', () => callbacks.onVisibilityChange(track.id, checkbox.checked))

    const label = document.createElement('span')
    label.textContent = track.name

    const color = document.createElement('input')
    color.type = 'color'
    color.value = track.color
    color.addEventListener('input', () => callbacks.onColorChange(track.id, color.value))

    const up = document.createElement('button')
    up.textContent = '↑'
    up.addEventListener('click', () => callbacks.onReorder(track.id, Math.max(0, track.order - 1)))

    const down = document.createElement('button')
    down.textContent = '↓'
    down.addEventListener('click', () => callbacks.onReorder(track.id, track.order + 1))

    row.append(checkbox, label, color, up, down)
    panelEl.appendChild(row)
  }
}
