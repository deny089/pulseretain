export function classifyIngestError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('403') || msg.includes('Forbidden'))      return 'Access denied — the URL may be behind a login or block crawlers.'
  if (msg.includes('404') || msg.includes('Not Found'))      return 'URL not found (404). Check that the link is correct.'
  if (msg.includes('429') || msg.includes('Too Many'))       return 'Rate limited by the server. Try again in a few minutes.'
  if (msg.includes('timeout') || msg.includes('AbortError')) return 'Request timed out. The URL may be too slow or unreachable.'
  if (msg.includes('no readable') || msg.includes('Not enough readable')) return 'No readable text found. The page may be JS-only, image-based, or behind a paywall.'
  if (msg.includes('scanned') || msg.includes('image-based')) return 'PDF appears to be scanned. Please use a text-based PDF, or run it through an OCR tool first.'
  if (msg.includes('non-finite'))                            return 'Embedding failed — content may be malformed. Try a different source.'
  if (msg.includes('No usable content'))                     return 'Content is too short to index. Try a page with more text.'
  return 'Ingestion failed. Please try again or use a different source.'
}
