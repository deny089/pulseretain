import { sql } from '@/lib/db'
import { embed } from '@/lib/embedding'

export type SearchResult = {
  chunkId: string
  sourceId: string
  sourceTitle: string
  sourceType: string
  content: string
  similarity: number
}

export function toVectorLiteral(vector: number[]): string {
  if (!vector.every(n => isFinite(n))) throw new Error('Embedding contains non-finite values')
  return '[' + vector.join(',') + ']'
}

export async function searchChunks(query: string, topK = 5): Promise<SearchResult[]> {
  const vector = await embed(query)
  const vectorLiteral = toVectorLiteral(vector)

  const rows = await sql`
    SELECT
      c.id          AS "chunkId",
      c.source_id   AS "sourceId",
      s.title       AS "sourceTitle",
      s.type        AS "sourceType",
      c.content,
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM chunks c
    JOIN sources s ON s.id = c.source_id
    WHERE s.status = 'ready'
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `

  return rows as SearchResult[]
}
