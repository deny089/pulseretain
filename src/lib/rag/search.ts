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

export type SourceType = 'url' | 'pdf'

export async function searchChunks(
  query: string,
  topK = 5,
  sourceType?: SourceType,
): Promise<SearchResult[]> {
  const vector = await embed(query)
  const vectorLiteral = toVectorLiteral(vector)
  // Clamp so a caller can't trigger a huge scan with an absurd topK.
  const limit = Math.min(Math.max(1, Math.trunc(topK) || 5), 50)
  // null = no type filter; otherwise restrict to URL- or PDF-sourced chunks.
  const typeFilter = sourceType ?? null

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
      AND (${typeFilter}::text IS NULL OR s.type = ${typeFilter})
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `

  return rows as SearchResult[]
}
