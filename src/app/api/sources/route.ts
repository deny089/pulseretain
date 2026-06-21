import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { crawlUrl } from '@/lib/rag/crawl'
import { ingestText, setSourceError } from '@/lib/rag/ingest'
import { classifyIngestError } from '@/lib/rag/errors'

export async function GET() {
  try {
    const rows = await sql`
      SELECT s.*, COUNT(c.id)::int AS chunk_count
      FROM sources s
      LEFT JOIN chunks c ON c.source_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `
    return NextResponse.json({ data: rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const sourceId = crypto.randomUUID()

    await sql`
      INSERT INTO sources (id, type, title, origin, status)
      VALUES (${sourceId}, 'url', ${url}, ${url}, 'processing')
    `

    try {
      const { title, text } = await crawlUrl(url)

      await sql`UPDATE sources SET title = ${title} WHERE id = ${sourceId}`

      const count = await ingestText(sourceId, text)

      return NextResponse.json({ data: { id: sourceId, chunkCount: count } })
    } catch (err) {
      const friendly = classifyIngestError(err)
      await setSourceError(sourceId, friendly)
      return NextResponse.json({ error: friendly }, { status: 422 })
    }
  } catch (err) {
    return NextResponse.json({ error: classifyIngestError(err) }, { status: 500 })
  }
}
