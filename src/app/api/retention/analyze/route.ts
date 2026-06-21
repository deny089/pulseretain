import { NextRequest, NextResponse } from 'next/server'
import { serverListCampaigns, serverGetCampaignRecipients, serverListLabels } from '@/lib/mailtarget/server'
import { scoreAll } from '@/lib/retention/churn'
import { searchChunks } from '@/lib/rag/search'
import { generateRetentionInsight } from '@/lib/retention/generate'
import { saveAnalysisRun } from '@/lib/retention/runs'
import type { CampaignRecipient } from '@/lib/mailtarget/types'

const PAGE_SIZE = 200
const MAX_PAGES = 10  // cap at 2000 recipients per campaign to avoid runaway fetch

async function fetchAllRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  const all: CampaignRecipient[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await serverGetCampaignRecipients(campaignId, { perPage: PAGE_SIZE, page })
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break  // last page
  }
  return all
}

export async function POST(req: NextRequest) {
  try {
    const { labelName, query } = await req.json()

    if (!labelName || typeof labelName !== 'string') {
      return NextResponse.json({ error: 'labelName is required' }, { status: 400 })
    }

    // 0. Validate label exists in Mailtarget
    const { data: labels, error: labelErr } = await serverListLabels({ perPage: 500 })
    if (labelErr || !Array.isArray(labels)) {
      return NextResponse.json({ error: 'Failed to fetch labels from Mailtarget' }, { status: 502 })
    }
    const labelExists = labels.some(l => l.name.toLowerCase() === labelName.toLowerCase())
    if (!labelExists) {
      return NextResponse.json(
        { error: `Label "${labelName}" not found. Make sure the label exists in your Mailtarget account.` },
        { status: 404 }
      )
    }

    // 1. Get recent finished campaigns (last 5)
    const { data: campaigns, error: campErr } = await serverListCampaigns({ perPage: 5, stage: 'FINISH' })
    if (campErr || !Array.isArray(campaigns)) {
      return NextResponse.json({ error: campErr ?? 'Failed to fetch campaigns' }, { status: 502 })
    }

    if (campaigns.length === 0) {
      return NextResponse.json({
        data: {
          atRisk: [], totalScored: 0,
          insight: 'No finished campaigns found. Send and finish at least one campaign before running retention analysis.',
          chunks: [],
          meta: { campaignsAnalyzed: 0, totalRecipients: 0, labelName, truncated: false },
        },
      })
    }

    // 2. Fetch all recipients per campaign with pagination (parallel across campaigns)
    const recipientResults = await Promise.allSettled(
      campaigns.map(c => fetchAllRecipients(c.id))
    )

    const allRecipients: CampaignRecipient[] = recipientResults.flatMap(r =>
      r.status === 'fulfilled' ? r.value : []
    )

    const campaignIds = campaigns.map(c => c.id)
    const truncated = recipientResults.some(
      r => r.status === 'fulfilled' && r.value.length >= PAGE_SIZE * MAX_PAGES
    )

    // 3. Score contacts filtered by label — now returns { atRisk, totalScored }
    const { atRisk, totalScored } = scoreAll(allRecipients, campaignIds, labelName)

    // 4. RAG similarity search
    const searchQuery = query?.trim()
      || `retention strategy for ${labelName} contacts with low email engagement`
    const chunks = await searchChunks(searchQuery, 5).catch(() => [])

    // 5. Generate insights
    const insight = await generateRetentionInsight(atRisk, chunks, labelName, query ?? '').catch(
      err => `Insight generation failed: ${err instanceof Error ? err.message : String(err)}`
    )

    // 6. Persist snapshot for M5 feedback loop (best-effort — never fail the analysis)
    const runId = await saveAnalysisRun(labelName, atRisk, totalScored).catch(() => null)

    return NextResponse.json({
      data: {
        atRisk,
        totalScored,
        insight,
        chunks,
        runId,
        meta: {
          campaignsAnalyzed: campaigns.length,
          totalRecipients: allRecipients.length,
          labelName,
          truncated,
        },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
