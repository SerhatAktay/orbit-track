export function computeTrackBands(visibleTracks, { minRadius, maxRadius, bandGap = 4 }) {
  const bandHeight = (maxRadius - minRadius) / visibleTracks.length
  return visibleTracks.map((track, i) => ({
    track,
    innerRadius: minRadius + i * bandHeight + bandGap / 2,
    outerRadius: minRadius + (i + 1) * bandHeight - bandGap / 2,
  }))
}

function bpToAngle(bp, genomeLength) {
  return (bp / genomeLength) * 2 * Math.PI - Math.PI / 2
}

function polar(radius, angle) {
  return [
    Math.round(radius * Math.cos(angle) * 1e10) / 1e10,
    Math.round(radius * Math.sin(angle) * 1e10) / 1e10,
  ]
}

export function signalTrackPath(bins, band, genomeLength, { mirrored = false } = {}) {
  if (bins.length === 0) return ''
  const { innerRadius, outerRadius } = band
  const midRadius = mirrored ? (innerRadius + outerRadius) / 2 : innerRadius
  const halfSpan = mirrored ? (outerRadius - innerRadius) / 2 : outerRadius - innerRadius
  const maxAbs = Math.max(1e-9, ...bins.map((b) => Math.abs(b.value)))
  const points = bins.map((b) => {
    const radius = midRadius + (b.value / maxAbs) * halfSpan
    return polar(radius, bpToAngle(b.start, genomeLength))
  })
  return `M${points.map((p) => p.join(',')).join('L')}Z`
}

export function annotationFeaturePath(feature, band, genomeLength) {
  const startAngle = bpToAngle(feature.start, genomeLength)
  const endAngle = bpToAngle(feature.end, genomeLength)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  const [ox1, oy1] = polar(band.outerRadius, startAngle)
  const [ox2, oy2] = polar(band.outerRadius, endAngle)
  const [ix2, iy2] = polar(band.innerRadius, endAngle)
  const [ix1, iy1] = polar(band.innerRadius, startAngle)
  return [
    `M${ox1},${oy1}`,
    `A${band.outerRadius},${band.outerRadius} 0 ${largeArc} 1 ${ox2},${oy2}`,
    `L${ix2},${iy2}`,
    `A${band.innerRadius},${band.innerRadius} 0 ${largeArc} 0 ${ix1},${iy1}`,
    'Z',
  ].join(' ')
}
