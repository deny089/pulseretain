import { NextResponse } from 'next/server'
import { listAnalysisRuns } from '@/lib/retention/runs'

export async function GET() {
  try {
    const runs = await listAnalysisRuns(50)
    return NextResponse.json({ data: runs })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch runs'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
