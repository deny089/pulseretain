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

export type AnalysisRunRow = {
  id: string
  labelName: string
  campaignId: string | null
  atRiskSnapshot: ScoredContact[]
  totalScored: number
  createdAt: string
}

export async function getAnalysisRun(runId: string): Promise<AnalysisRunRow | null> {
  const rows = await sql`
    SELECT
      id,
      label_name        AS "labelName",
      campaign_id       AS "campaignId",
      at_risk_snapshot  AS "atRiskSnapshot",
      total_scored      AS "totalScored",
      created_at        AS "createdAt"
    FROM analysis_runs
    WHERE id = ${runId}
  `
  if (!rows || rows.length === 0) return null
  return rows[0] as AnalysisRunRow
}
