import { BigWig } from '../vendor/bbi.bundle.js'

export async function openBigWig(filehandle) {
  const bigwig = new BigWig({ filehandle })
  const header = await bigwig.getHeader()
  // Note: header.refsByName maps name -> numeric refId, not a ref object.
  // Per-chromosome length lives on header.refsByNumber[refId].length.
  const chromSizes = {}
  for (const ref of Object.values(header.refsByNumber)) {
    chromSizes[ref.name] = ref.length
  }
  return { chromSizes, handle: bigwig }
}

export async function getBinnedValues(bigWigHandle, chromName, start, end, binCount) {
  const span = end - start
  const binSize = span / binCount
  const features = await bigWigHandle.getFeatures(chromName, start, end, {
    basesPerSpan: Math.max(1, Math.floor(binSize)),
  })

  const bins = Array.from({ length: binCount }, (_, i) => ({
    start: start + i * binSize,
    end: start + (i + 1) * binSize,
    sum: 0,
    count: 0,
  }))

  for (const feature of features) {
    const binIndex = Math.min(binCount - 1, Math.floor((feature.start - start) / binSize))
    if (binIndex < 0) continue
    bins[binIndex].sum += feature.score
    bins[binIndex].count += 1
  }

  return bins.map((b) => ({
    start: b.start,
    end: b.end,
    value: b.count > 0 ? b.sum / b.count : 0,
  }))
}
