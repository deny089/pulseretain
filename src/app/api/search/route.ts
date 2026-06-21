import { NextRequest, NextResponse } from 'next/server'
import { searchChunks } from '@/lib/rag/search'

export async function POST(req: NextRequest) {
  try {
    const { query, topK } = await req.json()

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return NextResponse.json({ error: 'query must be at least 3 characters' }, { status: 400 })
    }

    const results = await searchChunks(query.trim(), topK ?? 5)
    return NextResponse.json({ data: results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
