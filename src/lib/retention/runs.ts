import { sql } from '@/lib/db'
import type { ScoredContact } from './churn'

export async function saveAnalysisRun(
  labelName: string,
  atRisk: ScoredContact[],
  totalScored: number,
): Promise<string> {
  const id = crypto.randomUUID()
  await sql`
    INSERT INTO analysis_runs (id, label_name, at_risk_snapshot, total_scored)
    VALUES (${id}, ${labelName}, ${JSON.stringify(atRisk)}::jsonb, ${totalScored})
  `
  return id
}

export async function updateRunCampaignId(runId: string, campaignId: string): Promise<void> {
  await sql`UPDATE analysis_runs SET campaign_id = ${campaignId} WHERE id = ${runId}`
}

export type FeedbackSummary = {
  reEngaged: number
  totalTracked: number
  atRiskBefore: number
  atRiskAfter: number
  totalScored: number
  missing: number
}

export async function saveFeedbackResult(runId: string, summary: FeedbackSummary): Promise<void> {
  await sql`
    UPDATE analysis_runs
    SET feedback_result   = ${JSON.stringify(summary)}::jsonb,
        last_feedback_at  = now()
    WHERE id = ${runId}
  `
}

export type AnalysisRunRow = {
  id: string
  labelName: string
  campaignId: string | null
  atRiskSnapshot: ScoredContact[]
  totalScored: number
  createdAt: string
  feedbackResult: FeedbackSummary | null
  lastFeedbackAt: string | null
}

export async function getAnalysisRun(runId: string): Promise<AnalysisRunRow | null> {
  const rows = await sql`
    SELECT
      id,
      label_name        AS "labelName",
      campaign_id       AS "campaignId",
      at_risk_snapshot  AS "atRiskSnapshot",
      total_scored      AS "totalScored",
      created_at        AS "createdAt",
      feedback_result   AS "feedbackResult",
      last_feedback_at  AS "lastFeedbackAt"
    FROM analysis_runs
    WHERE id = ${runId}
  `
  if (!rows || rows.length === 0) return null
  return rows[0] as AnalysisRunRow
}

export type AnalysisRunListItem = {
  id: string
  labelName: string
  campaignId: string | null
  atRiskCount: number
  totalScored: number
  createdAt: string
  feedbackResult: FeedbackSummary | null
  lastFeedbackAt: string | null
}

export async function listAnalysisRuns(limit = 50): Promise<AnalysisRunListItem[]> {
  const rows = await sql`
    SELECT
      id,
      label_name                                          AS "labelName",
      campaign_id                                         AS "campaignId",
      jsonb_array_length(at_risk_snapshot)                AS "atRiskCount",
      total_scored                                        AS "totalScored",
      created_at                                          AS "createdAt",
      feedback_result                                     AS "feedbackResult",
      last_feedback_at                                    AS "lastFeedbackAt"
    FROM analysis_runs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as AnalysisRunListItem[]
}
