export function chunkText(text: string, maxChars = 600, overlap = 100): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxChars) return cleaned ? [cleaned] : []

  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    let end = start + maxChars

    if (end < cleaned.length) {
      const sentenceBreak = cleaned.lastIndexOf('. ', end)
      const newlineBreak  = cleaned.lastIndexOf('\n', end)
      const breakAt = Math.max(sentenceBreak, newlineBreak)
      if (breakAt > start + maxChars / 2) end = breakAt + 1
    }

    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 20) chunks.push(chunk)

    start = end - overlap
    if (start <= 0 || start >= cleaned.length) break
  }

  return chunks
}
