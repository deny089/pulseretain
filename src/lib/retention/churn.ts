import type { CampaignRecipient } from '@/lib/mailtarget/types'

export type ContactEngagement = {
  email: string
  name?: string
  contactId?: string  // Mailtarget contactId — needed for label tagging in M4
  totalCampaigns: number
  openedCampaigns: number
  bounced: boolean
  lastActivityTs: number | null  // unix ms — survives JSON serialization safely
  openRate: number
}

export type ScoredContact = ContactEngagement & {
  score: number
  risk: 'high' | 'medium' | 'low'
}

export function aggregateEngagement(
  rows: CampaignRecipient[],
  campaignIds: string[],
): Map<string, ContactEngagement> {
  const map = new Map<string, ContactEngagement>()

  for (const r of rows) {
    const key = r.email.toLowerCase()
    let entry = map.get(key)
    if (!entry) {
      entry = {
        email: r.email,
        name: r.name ?? (r.firstname ? `${r.firstname} ${r.lastname ?? ''}`.trim() : undefined),
        contactId: r.contactId,
        totalCampaigns: 0,
        openedCampaigns: 0,
        bounced: false,
        lastActivityTs: null,
        openRate: 0,
      }
      map.set(key, entry)
    }

    entry.totalCampaigns = campaignIds.length
    if ((r.visitCount ?? 0) > 0) entry.openedCampaigns += 1
    if (r.bouncedAt) entry.bounced = true

    if (r.lastVisited) {
      const ts = new Date(r.lastVisited).getTime()
      if (!isNaN(ts) && (entry.lastActivityTs === null || ts > entry.lastActivityTs)) {
        entry.lastActivityTs = ts
      }
    }
  }

  for (const entry of map.values()) {
    entry.openRate = entry.totalCampaigns > 0
      ? entry.openedCampaigns / entry.totalCampaigns
      : 0
  }

  return map
}

export function scoreContact(e: ContactEngagement): ScoredContact {
  const now = Date.now()
  let score = 50

  if (e.bounced) score += 35

  if (e.openedCampaigns === 0) score += 25
  else if (e.openRate < 0.2) score += 15
  else if (e.openRate > 0.6) score -= 20

  if (e.lastActivityTs === null) {
    score += 25  // Never opened anything — stronger signal than just "old"
  } else {
    const daysSince = (now - e.lastActivityTs) / 86_400_000
    if (daysSince > 180) score += 30  // Very long inactive — critical
    else if (daysSince > 60) score += 20
    else if (daysSince > 30) score += 10
    else if (daysSince < 7) score -= 25
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const risk = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'

  return { ...e, score, risk }
}

export type ScoreAllResult = {
  atRisk: ScoredContact[]
  totalScored: number  // all unique contacts seen, including low-risk
}

export function scoreAll(
  rows: CampaignRecipient[],
  campaignIds: string[],
  labelName?: string,
): ScoreAllResult {
  const filtered = labelName
    ? rows.filter(r => r.labels?.some(l => l.toLowerCase() === labelName.toLowerCase()))
    : rows

  const engagements = aggregateEngagement(filtered, campaignIds)
  const all = Array.from(engagements.values()).map(scoreContact)

  return {
    atRisk: all.filter(c => c.risk !== 'low').sort((a, b) => b.score - a.score),
    totalScored: all.length,
  }
}
