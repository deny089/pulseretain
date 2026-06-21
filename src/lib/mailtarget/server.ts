import type { ApiResponse } from './types'
import { requireEnv } from '@/lib/env'

const BASE_URL = requireEnv('MAILTARGET_BASE_URL')
const API_KEY  = requireEnv('MAILTARGET_API_KEY')

// Per-request timeout. The analyze/feedback pipelines fan out dozens of
// recipient fetches; without this, one slow Mailtarget response could hang the
// whole serverless invocation until the platform's hard timeout.
const DEFAULT_TIMEOUT_MS = 15_000

export async function mtFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        data: null,
        meta: null,
        error: json.message ?? json.error ?? `HTTP ${res.status}`,
      }
    }
    return {
      data: json.data ?? json,
      meta: json.meta ?? null,
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error
      ? (err.name === 'TimeoutError' ? `Request to ${path} timed out after ${timeoutMs / 1000}s` : err.message)
      : 'Unknown error'
    return { data: null, meta: null, error: msg }
  }
}

function qs(params: Record<string, string | number | undefined> = {}): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  ) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(Object.fromEntries(entries)) : ''
}

// ── Settings ──────────────────────────────────────────────
export const serverGetCompany = () => mtFetch('GET', '/settings/mtarget/company')
export const serverGetProfile = () => mtFetch('GET', '/settings/mtarget/profile')

// ── Contacts ──────────────────────────────────────────────
export const serverListContacts  = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/contacts${qs(p)}`)
export const serverGetContact    = (id: string) => mtFetch('GET', `/contacts/${id}`)
export const serverCreateContact = (data: unknown) => mtFetch('POST', '/contacts', data)
export const serverUpdateContact = (id: string, data: unknown) => mtFetch('PUT', `/contacts/${id}`, data)
export const serverDeleteContact = (id: string) => mtFetch('DELETE', `/contacts/${id}`)

// ── Campaigns ─────────────────────────────────────────────
export const serverListCampaigns       = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/campaigns${qs(p)}`)
export const serverGetCampaign         = (id: string) => mtFetch('GET', `/campaigns/${id}`)
export const serverCreateCampaign      = (data: unknown) => mtFetch('POST', '/campaigns', data)
export const serverUpdateCampaign      = (id: string, data: unknown) => mtFetch('PUT', `/campaigns/${id}`, data)
export const serverDeleteCampaign      = (id: string) => mtFetch('DELETE', `/campaigns/${id}`)
export const serverSendCampaign        = (id: string) => mtFetch('POST', `/campaigns/${id}/send`)
export const serverSendTestCampaign    = (id: string, data: unknown) => mtFetch('POST', `/campaigns/${id}/send-test`, data)
export const serverGetCampaignAnalytics = (id: string) => mtFetch('GET', `/campaigns/${id}/analytics`)
export const serverGetCampaignRecipients = (id: string, p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/campaigns/${id}/recipients${qs(p)}`)

// ── Senders ───────────────────────────────────────────────
export const serverListSenders   = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/domain/senders${qs(p)}`)
export const serverGetSender     = (id: string) => mtFetch('GET', `/domain/senders/${id}`)
export const serverCreateSender  = (data: unknown) => mtFetch('POST', '/domain/senders', data)
export const serverUpdateSender  = (id: string, data: unknown) => mtFetch('PUT', `/domain/senders/${id}`, data)
export const serverDeleteSender  = (id: string) => mtFetch('DELETE', `/domain/senders/${id}`)

// ── Labels ────────────────────────────────────────────────
export const serverListLabels   = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/labels${qs(p)}`)
export const serverCreateLabel  = (data: unknown) => mtFetch('POST', '/labels', data)
export const serverUpdateLabel  = (name: string, data: unknown) => mtFetch('PUT', `/labels/${encodeURIComponent(name)}`, data)
export const serverDeleteLabel  = (name: string) => mtFetch('DELETE', `/labels/${encodeURIComponent(name)}`)

// ── Transmissions ─────────────────────────────────────────
export const serverSendTransmission  = (data: unknown) => mtFetch('POST', '/transmissions', data)
export const serverGetTransmission   = (id: string) => mtFetch('GET', `/analytics/transmission/${id}`)
export const serverGetTransmissionEvents = (id: string) => mtFetch('GET', `/analytics/transmission/${id}/events`)

// ── Analytics ─────────────────────────────────────────────
export const serverGetSummary       = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/analytics/summary${qs(p)}`)
export const serverGetBreakdown     = (p: Record<string, string | number | undefined> = {}) => mtFetch('GET', `/analytics/summary/breakdown${qs(p)}`)
