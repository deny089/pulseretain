import { sql } from '@/lib/db'
import { embedBatch } from '@/lib/embedding'
import { chunkText } from './chunk'
import { toVectorLiteral } from './search'

export async function ingestText(sourceId: string, text: string): Promise<number> {
  const chunks = chunkText(text)
  if (chunks.length === 0) throw new Error('No usable content to ingest')

  try {
    // Embed all chunks in parallel (batch), then insert concurrently
    const vectors = await embedBatch(chunks)

    await Promise.all(
      chunks.map((chunk, i) => {
        const vectorLiteral = toVectorLiteral(vectors[i])
        return sql`
          INSERT INTO chunks (id, source_id, chunk_index, content, embedding)
          VALUES (
            ${crypto.randomUUID()},
            ${sourceId},
            ${i},
            ${chunk},
            ${vectorLiteral}::vector
          )
        `
      })
    )

    await sql`
      UPDATE sources SET status = 'ready', processed_at = now() WHERE id = ${sourceId}
    `
  } catch (err) {
    // Clean up any partial chunks so the source doesn't sit half-ingested
    await sql`DELETE FROM chunks WHERE source_id = ${sourceId}`
    await setSourceError(sourceId, err instanceof Error ? err.message : String(err))
    throw err
  }

  return chunks.length
}

export async function setSourceError(sourceId: string, msg: string) {
  await sql`
    UPDATE sources SET status = 'error', error_msg = ${msg} WHERE id = ${sourceId}
  `
}
