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

    // Recreate chunks to guarantee vector(768) — safe to drop since sources cascade
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

    return NextResponse.json({ ok: true, message: 'Schema ready' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
