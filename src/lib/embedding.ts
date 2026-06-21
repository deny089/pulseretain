import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireEnv } from './env'

const genai = new GoogleGenerativeAI(requireEnv('GEMINI_API_KEY'))

const model = genai.getGenerativeModel({ model: 'gemini-embedding-001' })

export const EMBEDDING_DIM = 768

export async function embed(text: string): Promise<number[]> {
  // outputDimensionality is supported by the API but not yet typed in SDK v0.24
  const req = { content: { parts: [{ text }], role: 'user' }, outputDimensionality: 768 }
  const result = await model.embedContent(req as Parameters<typeof model.embedContent>[0])
  return result.embedding.values
}

// Fire all embeds at once (Promise.all) would burst hundreds of concurrent
// requests at Gemini for a large document → rate-limit (429) or timeouts.
// Cap concurrency with a small worker pool instead.
const EMBED_CONCURRENCY = 8

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return mapWithConcurrency(texts, EMBED_CONCURRENCY, t => embed(t))
}
