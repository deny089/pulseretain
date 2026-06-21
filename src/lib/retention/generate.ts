import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ScoredContact } from './churn'
import type { SearchResult } from '@/lib/rag/search'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })

export async function generateRetentionInsight(
  atRisk: ScoredContact[],
  ragChunks: SearchResult[],
  labelName: string,
  userQuery: string,
): Promise<string> {
  const highRisk  = atRisk.filter(c => c.risk === 'high').length
  const medRisk   = atRisk.filter(c => c.risk === 'medium').length
  const avgScore  = atRisk.length
    ? Math.round(atRisk.reduce((s, c) => s + c.score, 0) / atRisk.length)
    : 0

  const behaviorSummary = `
Segment: "${labelName}"
At-risk contacts: ${atRisk.length} total (${highRisk} high risk, ${medRisk} medium risk)
Average churn score: ${avgScore}/100
Bounce rate: ${atRisk.filter(c => c.bounced).length}/${atRisk.length} contacts have bounced
Never opened: ${atRisk.filter(c => c.openedCampaigns === 0).length} contacts
Average open rate: ${atRisk.length ? (atRisk.reduce((s, c) => s + c.openRate, 0) / atRisk.length * 100).toFixed(1) : 0}%
`.trim()

  // Cap RAG context to ~6000 chars to stay within Gemini token limits
  const MAX_CONTEXT_CHARS = 6000
  let contextChars = 0
  const cappedChunks = ragChunks.filter(c => {
    if (contextChars + c.content.length > MAX_CONTEXT_CHARS) return false
    contextChars += c.content.length
    return true
  })

  const knowledgeContext = cappedChunks.length > 0
    ? cappedChunks.map((c, i) => `[Source ${i + 1}: ${c.sourceTitle}]\n${c.content}`).join('\n\n---\n\n')
    : 'No knowledge base sources available.'

  const prompt = `You are a retention strategist for a B2B email marketing platform. Your goal is to prevent customer churn.

BEHAVIORAL DATA:
${behaviorSummary}

KNOWLEDGE BASE (relevant excerpts):
${knowledgeContext}

USER CONTEXT: ${userQuery || 'Identify retention opportunities for at-risk contacts.'}

Generate 3–5 PRAGMATIC retention actions. Rules:
- Each action must be specific and executable TODAY (not generic advice)
- Reference actual behavioral signals (bounce rate, open rate, last activity) where relevant
- Reference knowledge base content where it informs the strategy
- Keep each action to 2 sentences max
- Output format: numbered list, no headers, no markdown beyond bold for key terms
- Focus ONLY on retaining existing contacts — no upsell, no acquisition
- Tone: direct, analytical, no filler phrases`

  const result = await model.generateContent(prompt)
  const text = result.response?.text?.()?.trim()
  if (!text) throw new Error('Gemini returned an empty response')
  return text
}
