import { NextRequest, NextResponse } from 'next/server'
import { serverListCampaigns, serverGetCampaignRecipients } from '@/lib/mailtarget/server'
import { aggregateEngagement, scoreContact } from '@/lib/retention/churn'
import { getAnalysisRun } from '@/lib/retention/runs'
import type { CampaignRecipient } from '@/lib/mailtarget/types'
import type { ScoredContact } from '@/lib/retention/churn'

const PAGE_SIZE = 200
const MAX_PAGES = 10

async function fetchAllRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  const all: CampaignRecipient[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await serverGetCampaignRecipients(campaignId, { perPage: PAGE_SIZE, page })
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

export type DeltaContact = {
  email: string
  name?: string
  scoreBefore: number
  scoreAfter: number
  riskBefore: ScoredContact['risk']
  riskAfter: ScoredContact['risk']
  delta: number       // negative = improved (score dropped)
  reEngaged: boolean  // was at-risk, now low OR improved ≥ 20 pts
}

export async function POST(req: NextRequest) {
  try {
    const { runId }: { runId: string } = await req.json()

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    // 1. Load before-snapshot from DB
    const run = await getAnalysisRun(runId)
    if (!run) {
      return NextResponse.json({ error: 'Analysis run not found' }, { status: 404 })
    }
    const { labelName, campaignId, atRiskSnapshot, totalScored: totalScoredBefore, createdAt } = run

    // 2. Re-fetch current campaign recipients
    const { data: campaigns, error: campErr } = await serverListCampaigns({ perPage: 5, stage: 'FINISH' })
    if (campErr || !Array.isArray(campaigns)) {
      return NextResponse.json({ error: campErr ?? 'Failed to fetch campaigns' }, { status: 502 })
    }
    if (campaigns.length === 0) {
      return NextResponse.json({ error: 'No finished campaigns to compare against' }, { status: 422 })
    }

    const recipientResults = await Promise.allSettled(campaigns.map(c => fetchAllRecipients(c.id)))
    const allRecipients: CampaignRecipient[] = recipientResults.flatMap(r =>
      r.status === 'fulfilled' ? r.value : []
    )
    const truncated = recipientResults.some(
      r => r.status === 'fulfilled' && r.value.length >= PAGE_SIZE * MAX_PAGES
    )

    // 3. Build a FULL scored map for the label (including contacts that improved to low risk).
    //    scoreAll() filters out low-risk, so we aggregate + score manually here.
    //    Normalize label case the same way scoreAll does — labelName comes from the DB
    //    snapshot and may differ in case/whitespace from the live recipient labels.
    const target = labelName.trim().toLowerCase()
    const labelRecipients = allRecipients.filter(r =>
      r.labels?.some(l => l.trim().toLowerCase() === target)
    )
    const engagements = aggregateEngagement(labelRecipients)
    const fullAfterMap = new Map<string, ScoredContact>()
    for (const e of engagements.values()) {
      const scored = scoreContact(e)
      fullAfterMap.set(scored.email.toLowerCase(), scored)
    }

    const totalScoredAfter = fullAfterMap.size
    const atRiskAfterCount = Array.from(fullAfterMap.values()).filter(c => c.risk !== 'low').length

    // 4. Compute deltas vs before-snapshot
    const deltas: DeltaContact[] = []
    let reEngaged = 0

    for (const before of atRiskSnapshot) {
      const after = fullAfterMap.get(before.email.toLowerCase())
      if (!after) continue  // contact absent from current data — skip

      const delta = after.score - before.score
      const wasAtRisk = before.risk !== 'low'
      const isReEngaged = wasAtRisk && (after.risk === 'low' || delta <= -20)
      if (isReEngaged) reEngaged++

      deltas.push({
        email:       before.email,
        name:        before.name,
        scoreBefore: before.score,
        scoreAfter:  after.score,
        riskBefore:  before.risk,
        riskAfter:   after.risk,
        delta,
        reEngaged:   isReEngaged,
      })
    }

    // Re-engaged first, then sorted by most improved (lowest delta)
    deltas.sort((a, b) => {
      if (a.reEngaged !== b.reEngaged) return a.reEngaged ? -1 : 1
      return a.delta - b.delta
    })

    return NextResponse.json({
      data: {
        labelName,
        campaignId,
        runCreatedAt: createdAt,
        before: { totalScored: totalScoredBefore, atRiskCount: atRiskSnapshot.length },
        after:  { totalScored: totalScoredAfter,  atRiskCount: atRiskAfterCount },
        reEngaged,
        totalTracked: deltas.length,
        // Contacts in the snapshot that are no longer present (deleted, unsubscribed,
        // or label removed) — they can't be compared and are excluded from deltas.
        missing: atRiskSnapshot.length - deltas.length,
        truncated,
        deltas,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Feedback check failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
