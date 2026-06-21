import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

type Params = { id: string }

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id } = await params
    await sql`DELETE FROM sources WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
