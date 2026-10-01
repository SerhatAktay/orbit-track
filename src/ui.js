// src/ui.js — track cards in the side panel. Rebuilt only when the track list
// changes (not on every zoom), so inputs keep focus while you type.
const h = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const numOrNull = (v) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function renderTrackPanel(panelEl, trackList, cb) {
  panelEl.replaceChildren()
  const sorted = [...trackList].sort((a, b) => a.order - b.order)
  for (const track of sorted) {
    const card = h('div', { className: 'track-card' })
    // Drag by the handle only, so sliders and colour pickers keep working.
    const grip = h('span', { className: 'grip', textContent: '⠿', title: 'Drag to reorder' })
    grip.addEventListener('pointerdown', () => { card.draggable = true })
    card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(track.id)))
    card.addEventListener('dragend', () => { card.draggable = false })
    card.addEventListener('dragover', (e) => e.preventDefault())
    card.addEventListener('drop', (e) => {
      e.preventDefault()
      const id = Number(e.dataTransfer.getData('text/plain'))
      if (id && id !== track.id) cb.onReorder(id, track.order)
    })

    const visible = h('input', { type: 'checkbox', checked: track.visible, title: 'Show/hide' })
    visible.addEventListener('change', () => cb.onVisibility(track.id, visible.checked))
    const name = h('span', { className: 'track-name', textContent: track.name, title: track.name })
    const color = h('input', { type: 'color', value: track.color, title: 'Colour' })
    color.addEventListener('input', () => cb.onColor(track.id, color.value))
    const up = h('button', { textContent: '↑', title: 'Move outward', disabled: track.order === sorted.length - 1 })
    up.addEventListener('click', () => cb.onReorder(track.id, track.order + 1))
    const down = h('button', { textContent: '↓', title: 'Move inward', disabled: track.order === 0 })
    down.addEventListener('click', () => cb.onReorder(track.id, track.order - 1))
    const del = h('button', { textContent: '×', title: 'Remove track' })
    del.addEventListener('click', () => cb.onRemove(track.id))
    const head = h('div', { className: 'row' }, grip, visible, name, color)
    if (track.strand === 'paired') {
      const minus = h('input', { type: 'color', value: track.colorMinus, title: 'Minus-strand colour' })
      minus.addEventListener('input', () => cb.onColorMinus(track.id, minus.value))
      head.append(minus)
    }
    head.append(up, down, del)
    card.append(head)

    const height = h('input', { type: 'range', min: 0.3, max: 4, step: 0.1, value: track.weight, title: 'Ring thickness' })
    height.addEventListener('input', () => cb.onWeight(track.id, Number(height.value)))
    const opts = h('div', { className: 'row small' }, 'thickness', height)

    if (track.type === 'signal') {
      const mode = h('select', {}, h('option', { value: 'auto', textContent: 'auto scale' }), h('option', { value: 'fixed', textContent: 'fixed' }))
      mode.value = track.yScale.mode
      const min = h('input', { type: 'number', placeholder: 'min', value: track.yScale.min ?? '', disabled: track.yScale.mode === 'auto' })
      const max = h('input', { type: 'number', placeholder: 'max', value: track.yScale.max ?? '', disabled: track.yScale.mode === 'auto' })
      mode.addEventListener('change', () => cb.onYScale(track.id, { mode: mode.value }, true))
      min.addEventListener('change', () => cb.onYScale(track.id, { min: numOrNull(min.value) }))
      max.addEventListener('change', () => cb.onYScale(track.id, { max: numOrNull(max.value) }))
      const bins = h('input', { type: 'number', min: 0, step: 50, value: track.binCount, title: '0 = automatic' })
      bins.addEventListener('change', () => cb.onBinCount(track.id, Math.max(0, Math.round(Number(bins.value) || 0))))
      card.append(h('div', { className: 'row small' }, mode, min, max), h('div', { className: 'row small' }, 'bins', bins, '(0 = auto)'))
    }
    card.append(opts)
    panelEl.append(card)
  }
  if (!sorted.length) panelEl.append(h('p', { className: 'hint', textContent: 'No tracks yet.' }))
}
