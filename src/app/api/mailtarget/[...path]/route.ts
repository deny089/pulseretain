import { NextRequest, NextResponse } from 'next/server'
import { requireEnv } from '@/lib/env'

const BASE_URL       = requireEnv('MAILTARGET_BASE_URL')
const API_KEY        = requireEnv('MAILTARGET_API_KEY')
const EMAIL_API_KEY  = process.env.MAILTARGET_EMAIL_API_KEY  // optional

type Params = { path: string[] }

async function handler(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { path } = await params
  const mtPath   = '/' + path.join('/')

  const url = new URL(`${BASE_URL}${mtPath}`)
  // forward query string from original request
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  }

  let body: string | undefined
  const ct = req.headers.get('content-type') ?? ''
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && ct.includes('application/json')) {
    const raw = await req.text()
    if (req.method === 'POST' && mtPath === '/transmissions' && EMAIL_API_KEY) {
      try {
        const parsed = JSON.parse(raw)
        parsed.apiKey = EMAIL_API_KEY
        body = JSON.stringify(parsed)
      } catch {
        body = raw
      }
    } else {
      body = raw
    }
    headers['Content-Type'] = 'application/json'
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    })

    const json = await upstream.json().catch(() => ({}))
    return NextResponse.json(json, { status: upstream.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upstream error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export const GET    = handler
export const POST   = handler
export const PUT    = handler
export const PATCH  = handler
export const DELETE = handler
