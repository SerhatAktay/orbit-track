let nextId = 1

export function createSignalTrack({
  name,
  files,
  strand = 'unstranded',
  color = '#1f77b4',
  binCount = 200,
  genomeLength = null,
}) {
  if (strand === 'paired' && !(files && files.plus && files.minus)) {
    throw new Error('Paired track requires files.plus and files.minus')
  }
  if (strand !== 'paired' && !(files && files.single)) {
    throw new Error('Unstranded track requires files.single')
  }
  return {
    id: nextId++,
    name,
    type: 'signal',
    strand,
    files,
    color,
    visible: true,
    order: 0,
    yScale: { mode: 'auto', min: null, max: null },
    binCount,
    genomeLength,
  }
}

export function createAnnotationTrack({ name, features, color = '#888888' }) {
  return {
    id: nextId++,
    name,
    type: 'annotation',
    strand: 'unstranded',
    features,
    color,
    visible: true,
    order: 0,
  }
}

export function addTrack(trackList, track) {
  return [...trackList, { ...track, order: trackList.length }]
}

export function removeTrack(trackList, id) {
  return trackList.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i }))
}

export function setVisibility(trackList, id, visible) {
  return trackList.map((t) => (t.id === id ? { ...t, visible } : t))
}

export function reorderTrack(trackList, id, newOrder) {
  const sorted = [...trackList].sort((a, b) => a.order - b.order)
  const idx = sorted.findIndex((t) => t.id === id)
  if (idx === -1) return trackList
  const [moved] = sorted.splice(idx, 1)
  sorted.splice(newOrder, 0, moved)
  return sorted.map((t, i) => ({ ...t, order: i }))
}

export function setColor(trackList, id, color) {
  return trackList.map((t) => (t.id === id ? { ...t, color } : t))
}

export function setYScale(trackList, id, yScale) {
  return trackList.map((t) => (t.id === id ? { ...t, yScale: { ...t.yScale, ...yScale } } : t))
}

export function setBinCount(trackList, id, binCount) {
  return trackList.map((t) => (t.id === id ? { ...t, binCount } : t))
}

export function visibleTracksInOrder(trackList) {
  return trackList.filter((t) => t.visible).sort((a, b) => a.order - b.order)
}

export function checkGenomeLengthMismatch(track, genomeLength) {
  return track.genomeLength != null && track.genomeLength !== genomeLength
}
