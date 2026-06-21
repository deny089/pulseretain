import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ScoredContact } from './churn'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })

export type ComposedEmail = {
  subject: string
  htmlContent: string
}

export async function composeRetentionEmail(
  labelName: string,
  atRisk: ScoredContact[],
  insight: string,
  senderName: string,
): Promise<ComposedEmail> {
  const highCount  = atRisk.filter(c => c.risk === 'high').length
  const avgScore   = atRisk.length
    ? Math.round(atRisk.reduce((s, c) => s + c.score, 0) / atRisk.length)
    : 0
  const neverOpened = atRisk.filter(c => c.openedCampaigns === 0).length

  const prompt = `You are writing a retention email for the "${labelName}" customer segment.

SEGMENT CONTEXT:
- ${atRisk.length} at-risk contacts (${highCount} high risk, avg churn score ${avgScore}/100)
- ${neverOpened} contacts have never opened any email
- Goal: re-engage and prevent churn, NOT sell or upsell

RETENTION INSIGHTS (use these to inform the email content):
${insight}

SENDER: ${senderName}

Write a retention email. Output ONLY a JSON object with exactly these two fields:
{
  "subject": "compelling subject line under 60 chars, no emoji",
  "htmlContent": "complete HTML email body with inline CSS"
}

HTML requirements:
- Inline CSS only (no <style> block — email clients strip them)
- max-width: 600px, centered, white background
- Font: Arial, sans-serif, 16px, line-height 1.6, color #1a1a1a
- One clear CTA button: background #1a6b5a, color white, padding 12px 28px, border-radius 6px, no underline
- Footer with unsubscribe placeholder: <a href="{{{unsubscribe}}}">Unsubscribe</a>
- Keep it concise: greeting, 2–3 short paragraphs, CTA, footer
- Tone: warm, professional, no pushy sales language
- DO NOT reference churn scores, risk levels, or internal metrics
- Reference the insights naturally as value or concern for the reader`

  const result = await model.generateContent(prompt)
  const raw = result.response?.text?.()?.trim()
  if (!raw) throw new Error('Gemini returned empty response for email composition')

  // Extract JSON — Gemini sometimes wraps in ```json
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse email JSON from Gemini response')

  const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; htmlContent?: string }
  if (!parsed.subject || !parsed.htmlContent) {
    throw new Error('Gemini response missing subject or htmlContent field')
  }

  return {
    subject:     parsed.subject.trim(),
    htmlContent: parsed.htmlContent.trim(),
  }
}
