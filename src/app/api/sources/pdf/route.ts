import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { ingestText, setSourceError } from '@/lib/rag/ingest'
import { classifyIngestError } from '@/lib/rag/errors'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null

    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF file required' }, { status: 400 })
    }

    const sourceId = crypto.randomUUID()
    const title = file.name.replace(/\.pdf$/i, '')

    await sql`
      INSERT INTO sources (id, type, title, origin, status)
      VALUES (${sourceId}, 'pdf', ${title}, ${file.name}, 'processing')
    `

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const pdfModule = await import('pdf-parse')
      type PdfFn = (buf: Buffer) => Promise<{ text: string; numpages: number }>
      const pdfParse = ((pdfModule as unknown as { default?: PdfFn }).default ?? pdfModule) as PdfFn
      const parsed = await pdfParse(buffer)
      const text = parsed.text

      if (!text || text.trim().length < 50) {
        throw new Error('PDF appears to be scanned or image-based')
      }

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
