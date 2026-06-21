export interface ApiResponse<T> {
  data: T | null
  meta: PaginationMeta | null
  error: string | null
}

export interface PaginationMeta {
  total: number
  page: number
  perPage: number
  totalPage: number
}

// ── Settings ──────────────────────────────────────────────
export interface CompanyDetail {
  companyId?: string
  name?: string
  email?: string
  phone?: string
  address?: string
  industry?: string
  website?: string
  logo?: string
  image?: string
  timezone?: string
  city?: string
  country?: string
  zipcode?: string
  slug?: string
  packet?: string
  paid?: boolean
  role?: string
  autoLinkUtm?: boolean
  expiredDate?: string
  gracePeriodDate?: string
  language?: string
}

export interface UserProfile {
  userId?: string
  email?: string
  firstname?: string
  lastname?: string
  fullname?: string
  phone?: string
  image?: string
  language?: string
  policyVersion?: string
  time?: number
  tours?: string[]
  validate?: boolean
  hints?: unknown
}

// ── Contacts ──────────────────────────────────────────────
export type ContactState = 'ACTIVE' | 'UNSUBSCRIBED' | 'BOUNCED'

export interface Contact {
  id: string
  email: string
  name?: string
  firstname?: string
  lastname?: string
  phone?: string
  labels?: string[]
  state?: ContactState
  createdAt?: string
  updatedAt?: string
  birthDate?: string
  city?: string
  country?: string
  company?: string
  gender?: string
  funnel?: string
  note?: string
  tester?: boolean
  customField?: Record<string, unknown>
  segments?: string[]
}

export interface CreateContactPayload {
  email: string
  firstname?: string
  lastname?: string
  name?: string
  phone?: string
  labels?: string[]
  city?: string
  country?: string
  company?: string
  gender?: string
  note?: string
  birthDate?: string
}

// ── Campaigns ─────────────────────────────────────────────
export interface CampaignSender {
  name?: string
  email?: string
}

export interface Campaign {
  id: string
  subject: string
  stage?: string
  active?: boolean
  htmlContent?: string
  sender?: CampaignSender
  recipients?: { labels?: string[] }
  dueDate?: string
  emailId?: string
  emailType?: string
  snippet?: string
  startType?: string
  type?: string
  memberCount?: number
  sentCount?: number
  lastUpdate?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateCampaignPayload {
  subject: string
  sender?: { name: string; email: string }
  htmlContent?: string
  recipients?: { labels?: string[] }
  emailType?: string
  dueDate?: string
  startType?: string
  type?: string
  templateId?: string
  snippet?: string
}

export interface CampaignAnalytics {
  campaignId?: string
  subject?: string
  sentCount?: number
  deliveredCount?: number
  openCount?: number
  clickCount?: number
  bounceCount?: number
  complaintCount?: number
  unsubscribeCount?: number
  openRate?: number
  clickRate?: number
  bounceRate?: number
}

export interface CampaignRecipient {
  email: string
  name?: string
  firstname?: string
  lastname?: string
  contactId?: string
  status?: string
  deliveredAt?: string
  bouncedAt?: string
  bounceReason?: string
  firstVisited?: string
  lastVisited?: string
  visitCount?: number
  peak?: string
  labels?: string[]
}

// ── Senders ───────────────────────────────────────────────
export interface Sender {
  id: string
  name: string
  email: string
  domain?: string
  domainId?: string
  domainAssignment?: string
  domainStatus?: string
  permitted?: boolean
  validate?: boolean
  dkim?: boolean
  dmarc?: boolean
  spf?: boolean
  deleted?: boolean
  used?: boolean
  useSuggestionValue?: boolean
  message?: string
  ampStatus?: string
  lastUpdateConfig?: string
  lastValidate?: string
}

export interface CreateSenderPayload {
  name: string
  email: string
  assignment?: string
}

// ── Labels ────────────────────────────────────────────────
export interface Label {
  _id?: string
  name: string
  contactCount?: number
  createdAt?: string
  updatedAt?: string
}

// ── Transmissions ─────────────────────────────────────────
export interface TransmissionAddress {
  email: string
  name?: string
}

export interface TransmissionPayload {
  from: TransmissionAddress
  to: TransmissionAddress[]
  subject: string
  bodyHtml?: string
  bodyText?: string
  replyTo?: TransmissionAddress[]
}

export interface TransmissionResult {
  transmissionId?: string
}

// ── Analytics ─────────────────────────────────────────────
export interface AnalyticsSummary {
  name?: string
  period?: { from?: string; to?: string }
  sentCount?: number
  deliveredCount?: number
  openCount?: number
  clickCount?: number
  bounceCount?: number
  complaintCount?: number
  unsubscribeCount?: number
  openRate?: number
  clickRate?: number
  bounceRate?: number
  deliveryRate?: number
  unsubscribeRate?: number
}

export interface AnalyticsBreakdownItem {
  date?: string
  group?: string
  sentCount?: number
  deliveredCount?: number
  openCount?: number
  clickCount?: number
  bounceCount?: number
}

export interface TransmissionEvent {
  type: string
  timestamp?: number
  recipient?: string
  friendlyFrom?: string
  subject?: string
  userAgent?: string
  url?: string
  reason?: string
}
