import { NextRequest, NextResponse } from 'next/server'
import {
  serverCreateCampaign,
  serverListLabels,
  serverCreateLabel,
  serverUpdateContact,
} from '@/lib/mailtarget/server'
import { composeRetentionEmail } from '@/lib/retention/compose'
import { updateRunCampaignId } from '@/lib/retention/runs'
import type { ScoredContact } from '@/lib/retention/churn'

const MAX_TAG = 100  // max contacts to tag in one request to avoid rate-limiting

export async function POST(req: NextRequest) {
  try {
    const {
      labelName,
      atRisk,
      insight,
      senderName,
      senderEmail,
      subjectOverride,
      runId,
    }: {
      labelName: string
      atRisk: ScoredContact[]
      insight: string
      senderName: string
      senderEmail: string
      subjectOverride?: string
      runId?: string
    } = await req.json()

    if (!labelName || !senderName || !senderEmail) {
      return NextResponse.json(
        { error: 'labelName, senderName, and senderEmail are required' },
        { status: 400 }
      )
    }
    if (!Array.isArray(atRisk) || atRisk.length === 0) {
      return NextResponse.json({ error: 'No at-risk contacts to compose for' }, { status: 400 })
    }

    // 1. Generate email content
    const email = await composeRetentionEmail(labelName, atRisk, insight, senderName)
    const subject = subjectOverride?.trim() || email.subject

    // 2. Create or verify at-risk sublabel
    const atRiskLabel = `at-risk-${labelName}`
    const { data: existingLabels } = await serverListLabels({ perPage: 500 })
    const labelExists = Array.isArray(existingLabels) &&
      existingLabels.some(l => l.name.toLowerCase() === atRiskLabel.toLowerCase())

    if (!labelExists) {
      await serverCreateLabel({ name: atRiskLabel })
    }

    // 3. Tag at-risk contacts with sublabel (best-effort, cap MAX_TAG)
    const toTag = atRisk.filter(c => c.contactId).slice(0, MAX_TAG)
    const tagResults = await Promise.allSettled(
      toTag.map(c =>
        serverUpdateContact(c.contactId!, { labels: [atRiskLabel] })
      )
    )
    const contactsTagged  = tagResults.filter(r => r.status === 'fulfilled').length
    const contactsSkipped = atRisk.length - contactsTagged

    // 4. Create campaign as DRAFT targeting the at-risk sublabel
    const { data: campaign, error: campErr } = await serverCreateCampaign({
      subject,
      sender:    { name: senderName, email: senderEmail },
      htmlContent: email.htmlContent,
      recipients: { labels: [atRiskLabel] },
    })

    if (campErr || !campaign) {
      return NextResponse.json(
        { error: campErr ?? 'Failed to create campaign draft' },
        { status: 502 }
      )
    }

    const campaignData = campaign as { id?: string; _id?: string }
    const campaignId = campaignData.id ?? campaignData._id ?? ''

    // Link campaign back to the analysis snapshot (best-effort)
    if (runId && campaignId) {
      await updateRunCampaignId(runId, campaignId).catch(() => {})
    }

    return NextResponse.json({
      data: {
        campaignId,
        subject,
        atRiskLabel,
        contactsTagged,
        contactsSkipped,
        htmlPreview: email.htmlContent.slice(0, 300) + '…',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Compose failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
