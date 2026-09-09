export function parseBed(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('track'))
    .map((line) => {
      const fields = line.split('\t')
      if (fields.length < 3) {
        throw new Error(`Invalid BED line (need at least 3 fields): "${line}"`)
      }
      const [, startStr, endStr, name, , strand] = fields
      const start = Number(startStr)
      const end = Number(endStr)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(`Invalid BED coordinates: "${line}"`)
      }
      return {
        name: name || `feature_${start}_${end}`,
        start,
        end,
        strand: strand === '+' || strand === '-' ? strand : null,
      }
    })
}

export function parseGtf(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const fields = line.split('\t')
      if (fields.length < 9) {
        throw new Error(`Invalid GTF line (need 9 fields): "${line}"`)
      }
      const [, , , startStr, endStr, , strand, , attributes] = fields
      const start = Number(startStr) - 1
      const end = Number(endStr)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(`Invalid GTF coordinates: "${line}"`)
      }
      const nameMatch =
        attributes.match(/gene_name "([^"]+)"/) || attributes.match(/gene_id "([^"]+)"/)
      return {
        name: nameMatch ? nameMatch[1] : `feature_${start}_${end}`,
        start,
        end,
        strand: strand === '+' || strand === '-' ? strand : null,
      }
    })
}

export function parseAnnotation(text, filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.gtf') || lower.endsWith('.gff') || lower.endsWith('.gff3')) {
    return parseGtf(text)
  }
  return parseBed(text)
}
