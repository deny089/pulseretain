import { GoogleGenerativeAI } from '@google/generative-ai'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const model = genai.getGenerativeModel({ model: 'gemini-embedding-001' })

export const EMBEDDING_DIM = 768

export async function embed(text: string): Promise<number[]> {
  // outputDimensionality is supported by the API but not yet typed in SDK v0.24
  const req = { content: { parts: [{ text }], role: 'user' }, outputDimensionality: 768 }
  const result = await model.embedContent(req as Parameters<typeof model.embedContent>[0])
  return result.embedding.values
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results = await Promise.all(texts.map(t => embed(t)))
  return results
}
