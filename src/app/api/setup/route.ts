import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function POST() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`

    await sql`
      CREATE TABLE IF NOT EXISTS sources (
        id           TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        title        TEXT NOT NULL,
        origin       TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        error_msg    TEXT,
        created_at   TIMESTAMPTZ DEFAULT now(),
        processed_at TIMESTAMPTZ
      )
    `

    // Only (re)create chunks when it's missing or has the wrong vector dimension.
    // Dropping unconditionally would destroy live embeddings if setup is re-run
    // (or run concurrently). For pgvector, atttypmod holds the column dimension.
    const dimRows = await sql`
      SELECT a.atttypmod AS dim
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'chunks'
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `
    const currentDim = (dimRows[0]?.dim as number | undefined) ?? null
    const chunksReady = currentDim === 768

    if (!chunksReady) {
      await sql`DROP TABLE IF EXISTS chunks`
      await sql`
        CREATE TABLE chunks (
          id          TEXT PRIMARY KEY,
          source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          content     TEXT NOT NULL,
          embedding   vector(768),
          created_at  TIMESTAMPTZ DEFAULT now()
        )
      `
      await sql`CREATE INDEX chunks_source_id_idx ON chunks (source_id)`
      await sql`CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)`
    }

    // Index for the UI status-polling query (cheap, idempotent).
    await sql`CREATE INDEX IF NOT EXISTS sources_status_idx ON sources (status)`

    await sql`
      CREATE TABLE IF NOT EXISTS analysis_runs (
        id               TEXT PRIMARY KEY,
        label_name       TEXT NOT NULL,
        campaign_id      TEXT,
        at_risk_snapshot JSONB NOT NULL,
        total_scored     INTEGER NOT NULL,
        created_at       TIMESTAMPTZ DEFAULT now()
      )
    `

    // M6: feedback columns — idempotent, safe to re-run on existing data
    await sql`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS feedback_result   JSONB`
    await sql`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS last_feedback_at  TIMESTAMPTZ`

    return NextResponse.json({
      ok: true,
      message: chunksReady
        ? 'Schema ready (existing chunks preserved)'
        : 'Schema ready (chunks table created/rebuilt)',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
