export async function crawlUrl(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseRetain/1.0)' },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`)

  const html = await res.text()

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url

  // Strip scripts, styles, nav, footer, header
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')

  // Convert block tags to newlines before stripping
  const withBreaks = stripped
    .replace(/<\/?(p|div|h[1-6]|li|br|tr)[^>]*>/gi, '\n')

  // Strip remaining tags
  const text = withBreaks
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length < 100) throw new Error('Not enough readable content found at this URL')

  return { title, text }
}
