'use client'

import type {
  ApiResponse,
  Contact,
  CreateContactPayload,
  Campaign,
  CreateCampaignPayload,
  CampaignAnalytics,
  CampaignRecipient,
  Sender,
  CreateSenderPayload,
  Label,
  TransmissionPayload,
  TransmissionResult,
  AnalyticsSummary,
  AnalyticsBreakdownItem,
  TransmissionEvent,
  CompanyDetail,
  UserProfile,
} from './types'

const BASE = '/api/mailtarget'

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | undefined>,
): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE}${path}`, location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    })
  }

  const headers: Record<string, string> = {}
  let bodyStr: string | undefined
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    bodyStr = JSON.stringify(body)
  }

  try {
    const res  = await fetch(url.toString(), { method, headers, body: bodyStr })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, meta: null, error: json.message ?? json.error ?? `HTTP ${res.status}` }
    }
    return { data: json.data ?? json, meta: json.meta ?? null, error: null }
  } catch (err) {
    return { data: null, meta: null, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ── Settings ──────────────────────────────────────────────
export const getCompanyDetail = () => req<CompanyDetail>('GET', '/settings/mtarget/company')
export const getUserProfile   = () => req<UserProfile>('GET', '/settings/mtarget/profile')

// ── Contacts ──────────────────────────────────────────────
export const listContacts   = (p?: Record<string, string | number | undefined>) => req<Contact[]>('GET', '/contacts', undefined, p)
export const getContact     = (id: string) => req<Contact>('GET', `/contacts/${id}`)
export const createContact  = (data: CreateContactPayload) => req<Contact>('POST', '/contacts', data)
export const updateContact  = (id: string, data: Partial<CreateContactPayload>) => req<Contact>('PUT', `/contacts/${id}`, data)
export const deleteContact  = (id: string) => req<unknown>('DELETE', `/contacts/${id}`)

// ── Campaigns ─────────────────────────────────────────────
export const listCampaigns       = (p?: Record<string, string | number | undefined>) => req<Campaign[]>('GET', '/campaigns', undefined, p)
export const getCampaign         = (id: string) => req<Campaign>('GET', `/campaigns/${id}`)
export const createCampaign      = (data: CreateCampaignPayload) => req<Campaign>('POST', '/campaigns', data)
export const updateCampaign      = (id: string, data: Partial<CreateCampaignPayload>) => req<Campaign>('PUT', `/campaigns/${id}`, data)
export const deleteCampaign      = (id: string) => req<unknown>('DELETE', `/campaigns/${id}`)
export const sendCampaign        = (id: string) => req<unknown>('POST', `/campaigns/${id}/send`)
export const sendTestCampaign    = (id: string, data: { recipient: string }) => req<unknown>('POST', `/campaigns/${id}/send-test`, data)
export const getCampaignAnalytics  = (id: string) => req<CampaignAnalytics>('GET', `/campaigns/${id}/analytics`)
export const getCampaignRecipients = (id: string, p?: Record<string, string | number | undefined>) => req<CampaignRecipient[]>('GET', `/campaigns/${id}/recipients`, undefined, p)

// ── Senders ───────────────────────────────────────────────
export const listSenders   = (p?: Record<string, string | number | undefined>) => req<Sender[]>('GET', '/domain/senders', undefined, p)
export const getSender     = (id: string) => req<Sender>('GET', `/domain/senders/${id}`)
export const createSender  = (data: CreateSenderPayload) => req<Sender>('POST', '/domain/senders', data)
export const updateSender  = (id: string, data: Partial<CreateSenderPayload>) => req<Sender>('PUT', `/domain/senders/${id}`, data)
export const deleteSender  = (id: string) => req<unknown>('DELETE', `/domain/senders/${id}`)

// ── Labels ────────────────────────────────────────────────
export const listLabels   = (p?: Record<string, string | number | undefined>) => req<Label[]>('GET', '/labels', undefined, p)
export const createLabel  = (name: string) => req<Label>('POST', '/labels', { name })
export const updateLabel  = (oldName: string, newName: string) => req<Label>('PUT', `/labels/${encodeURIComponent(oldName)}`, { name: newName })
export const deleteLabel  = (name: string) => req<unknown>('DELETE', `/labels/${encodeURIComponent(name)}`)

// ── Transmissions ─────────────────────────────────────────
export const sendTransmission = (data: TransmissionPayload) => req<TransmissionResult>('POST', '/transmissions', data)
export const getTransmission  = (id: string) => req<unknown>('GET', `/analytics/transmission/${id}`)

export async function getTransmissionEvents(id: string): Promise<ApiResponse<TransmissionEvent[]>> {
  const result = await req<{ events?: TransmissionEvent[] }>('GET', `/analytics/transmission/${id}/events`)
  return { ...result, data: result.data?.events ?? null }
}

// ── Analytics ─────────────────────────────────────────────
export const getAnalyticsSummary   = (p?: Record<string, string | number | undefined>) => req<AnalyticsSummary>('GET', '/analytics/summary', undefined, p)
export const getAnalyticsBreakdown = (p?: Record<string, string | number | undefined>) => req<AnalyticsBreakdownItem[]>('GET', '/analytics/summary/breakdown', undefined, p)
