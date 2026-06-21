'use client'

import { useEffect, useState } from 'react'
import { listLabels, listSenders } from '@/lib/mailtarget/api'
import type { Label, Sender } from '@/lib/mailtarget/types'
import type { ScoredContact } from '@/lib/retention/churn'
import type { SearchResult } from '@/lib/rag/search'

type AnalysisResult = {
  atRisk: ScoredContact[]
  totalScored: number
  insight: string
  chunks: SearchResult[]
  meta: { campaignsAnalyzed: number; totalRecipients: number; labelName: string; truncated: boolean }
}

function RiskBadge({ risk }: { risk: 'high' | 'medium' | 'low' }) {
  const map = {
    high:   ['badge-red',   'High Risk'],
    medium: ['badge-amber', 'Medium Risk'],
    low:    ['badge-green', 'Low Risk'],
  } as const
  const [cls, label] = map[risk]
  return <span className={`badge ${cls}`}>{label}</span>
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--accent-neg)' : score >= 40 ? '#f59e0b' : 'var(--accent-pos)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-6 text-right" style={{ color: 'var(--text-muted)' }}>{score}</span>
    </div>
  )
}

function InsightPanel({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim())
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--accent-pos)', borderWidth: 1 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
          style={{ background: 'var(--accent-pos)', color: '#fff' }}
        >
          ✦
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent-pos)' }}>
          AI Retention Insight
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

type ComposeResult = {
  campaignId: string
  subject: string
  atRiskLabel: string
  contactsTagged: number
  contactsSkipped: number
}

type DeltaContact = {
  email: string
  name?: string
  scoreBefore: number
  scoreAfter: number
  riskBefore: 'high' | 'medium' | 'low'
  riskAfter: 'high' | 'medium' | 'low'
  delta: number
  reEngaged: boolean
}

type FeedbackResult = {
  labelName: string
  campaignId: string | null
  runCreatedAt: string
  before: { totalScored: number; atRiskCount: number }
  after:  { totalScored: number; atRiskCount: number }
  reEngaged: number
  totalTracked: number
  deltas: DeltaContact[]
}

export default function RetentionPage() {
  const [labels, setLabels]               = useState<Label[]>([])
  const [labelName, setLabelName]         = useState('')
  const [query, setQuery]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<AnalysisResult | null>(null)
  const [error, setError]                 = useState('')
  const [labelsLoading, setLabelsLoading] = useState(true)

  // Compose state
  const [senders, setSenders]             = useState<Sender[]>([])
  const [showCompose, setShowCompose]     = useState(false)
  const [composeSenderId, setComposeSenderId] = useState('')
  const [composeSubject, setComposeSubject]   = useState('')
  const [composing, setComposing]         = useState(false)
  const [composeErr, setComposeErr]       = useState('')
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null)

  // Feedback loop state (M5)
  const [runId, setRunId]                 = useState<string | null>(null)
  const [feedback, setFeedback]           = useState<FeedbackResult | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackErr, setFeedbackErr]     = useState('')

  useEffect(() => {
    listLabels({ perPage: 100 })
      .then(r => setLabels(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLabelsLoading(false))
  }, [])

  function openCompose() {
    if (!result) return
    setComposeErr(''); setComposeResult(null)
    setComposeSubject('')
    // Pre-load senders if not yet loaded
    if (senders.length === 0) {
      listSenders().then(r => {
        const list = Array.isArray(r.data) ? r.data : []
        setSenders(list)
        if (list.length > 0) setComposeSenderId(list[0].id)
      }).catch(() => {})
    }
    setShowCompose(true)
  }

  async function handleCompose() {
    if (!result || !composeSenderId) return
    const sender = senders.find(s => s.id === composeSenderId)
    if (!sender) return
    setComposing(true); setComposeErr('')

    try {
      const res = await fetch('/api/retention/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelName: result.meta.labelName,
          atRisk: result.atRisk,
          insight: result.insight,
          senderName: sender.name,
          senderEmail: sender.email,
          subjectOverride: composeSubject.trim() || undefined,
          runId: runId ?? undefined,
        }),
      })
      const json = await res.json()
      if (json.error) {
        setComposeErr(json.error)
      } else {
        setComposeResult(json.data)
      }
    } catch {
      setComposeErr('Network error. Please try again.')
    }
    setComposing(false)
  }

  async function handleAnalyze() {
    if (!labelName) return
    setLoading(true); setError(''); setResult(null)
    setRunId(null); setFeedback(null); setFeedbackErr('')

    try {
      const res = await fetch('/api/retention/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelName, query: query.trim() }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setResult(json.data)
        setRunId(json.data.runId ?? null)
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  async function handleFeedback() {
    if (!runId) return
    setFeedbackLoading(true); setFeedbackErr('')
    try {
      const res = await fetch('/api/retention/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      })
      const json = await res.json()
      if (json.error) setFeedbackErr(json.error)
      else setFeedback(json.data)
    } catch {
      setFeedbackErr('Network error. Please try again.')
    }
    setFeedbackLoading(false)
  }

  const highCount  = result?.atRisk.filter(c => c.risk === 'high').length ?? 0
  const medCount   = result?.atRisk.filter(c => c.risk === 'medium').length ?? 0
  const totalScored = result?.totalScored ?? 0

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Retention Analysis</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Identify at-risk contacts and get AI-powered retention recommendations
        </p>
      </div>

      {/* Analyze Form */}
      <div
        className="rounded-xl border p-5 flex flex-col gap-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Analysis Parameters
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>Contact Segment (Label) *</span>
            <select
              className="input-text"
              value={labelName}
              onChange={e => setLabelName(e.target.value)}
              disabled={labelsLoading}
            >
              <option value="">{labelsLoading ? 'Loading labels…' : '— Select a label —'}</option>
              {labels.map(l => (
                <option key={l._id ?? l.name} value={l.name}>{l.name} ({l.contactCount ?? 0})</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>
              Context for AI
              <span className="font-normal ml-1" style={{ color: 'var(--text-muted)' }}>(optional)</span>
            </span>
            <input
              className="input-text"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. re-engagement for inactive premium users"
              onKeyDown={e => e.key === 'Enter' && !loading && labelName && handleAnalyze()}
            />
          </label>

          <button
            onClick={handleAnalyze}
            disabled={loading || !labelName}
            className="px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 shrink-0"
            style={{ background: 'var(--accent-pos)', color: '#fff' }}
          >
            {loading ? 'Analyzing…' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          className="rounded-xl border p-8 flex flex-col items-center gap-3"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent-pos)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Fetching campaign data, scoring contacts, running RAG analysis…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p
          className="text-xs px-3 py-2 rounded-lg border"
          style={{ color: 'var(--accent-neg)', borderColor: 'var(--border)', background: 'var(--bg-base)' }}
        >
          {error}
        </p>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Summary chips */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Campaigns analyzed', val: result.meta.campaignsAnalyzed },
              { label: 'Recipients scanned', val: result.meta.totalRecipients },
              { label: 'Total contacts', val: totalScored },
              { label: 'High risk', val: highCount, color: 'var(--accent-neg)' },
              { label: 'Medium risk', val: medCount, color: '#f59e0b' },
              { label: 'KB sources used', val: result.chunks.length },
            ].map(chip => (
              <div
                key={chip.label}
                className="px-3 py-2 rounded-lg border flex flex-col"
                style={{ background: 'var(--bg-card-2)', borderColor: 'var(--border)', minWidth: 90 }}
              >
                <span className="text-lg font-bold" style={{ color: chip.color ?? 'var(--text)' }}>{chip.val}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{chip.label}</span>
              </div>
            ))}
          </div>

          {/* Truncation warning */}
          {result.meta.truncated && (
            <p
              className="text-xs px-3 py-2 rounded-lg border"
              style={{ color: '#f59e0b', borderColor: 'var(--border)', background: 'var(--bg-base)' }}
            >
              ⚠ Some campaigns had more than 2,000 recipients — data was capped. Scores may not reflect the full segment.
            </p>
          )}

          {/* Insight */}
          <InsightPanel text={result.insight} />

          {/* At-risk table */}
          {result.atRisk.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                At-Risk Contacts ({result.atRisk.length})
              </p>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-card-2)', borderBottom: `1px solid var(--border)` }}>
                      {['Contact', 'Risk', 'Score', 'Open Rate', 'Campaigns', 'Last Active'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.atRisk.map((c, i) => (
                      <tr
                        key={c.email}
                        style={{
                          background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                          borderBottom: `1px solid var(--border)`,
                        }}
                      >
                        <td className="px-4 py-3" style={{ color: 'var(--text)' }}>
                          <p className="font-medium">{c.name ?? c.email}</p>
                          {c.name && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.email}</p>}
                          {c.bounced && (
                            <span className="badge badge-red mt-1">Bounced</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><RiskBadge risk={c.risk} /></td>
                        <td className="px-4 py-3 w-32"><ScoreBar score={c.score} /></td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>
                          {c.openedCampaigns === 0
                            ? <span style={{ color: 'var(--accent-neg)' }}>Never</span>
                            : `${(c.openRate * 100).toFixed(0)}%`}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                          {c.openedCampaigns}/{c.totalCampaigns}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                          {c.lastActivityTs
                            ? new Date(c.lastActivityTs).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No at-risk contacts found in this segment — engagement looks healthy!
              </p>
            </div>
          )}

          {/* RAG chunks used */}
          {result.chunks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Knowledge Sources Used
              </p>
              <div className="flex flex-col gap-2">
                {result.chunks.map((chunk, i) => (
                  <div
                    key={chunk.chunkId}
                    className="rounded-lg border px-4 py-3 flex gap-3"
                    style={{ background: 'var(--bg-card-2)', borderColor: 'var(--border)' }}
                  >
                    <span
                      className="text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                          {chunk.sourceTitle}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          {(chunk.similarity * 100).toFixed(0)}% match
                        </span>
                      </div>
                      <p
                        className="text-xs leading-relaxed line-clamp-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {chunk.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compose action */}
          {result.atRisk.length > 0 && (
            <>
              {composeResult ? (
                <div
                  className="rounded-xl border p-5 flex flex-col gap-3"
                  style={{ borderColor: 'var(--accent-pos)', background: 'rgba(26,107,90,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--accent-pos)', fontSize: 18 }}>✓</span>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-pos)' }}>
                      Campaign draft created
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <p><strong style={{ color: 'var(--text)' }}>Subject:</strong> {composeResult.subject}</p>
                    <p><strong style={{ color: 'var(--text)' }}>Label:</strong> {composeResult.atRiskLabel}</p>
                    <p>
                      <strong style={{ color: 'var(--text)' }}>Contacts tagged:</strong>{' '}
                      {composeResult.contactsTagged}
                      {composeResult.contactsSkipped > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}({composeResult.contactsSkipped} skipped — no contactId)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <a
                      href="/dashboard/campaigns"
                      className="px-4 py-2 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--accent-pos)', color: '#fff', textDecoration: 'none' }}
                    >
                      View in Campaigns →
                    </a>
                    {runId && (
                      <button
                        onClick={handleFeedback}
                        disabled={feedbackLoading}
                        className="px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ background: 'var(--border)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      >
                        {feedbackLoading ? 'Checking…' : 'Check Re-engagement'}
                      </button>
                    )}
                    <button
                      onClick={() => setComposeResult(null)}
                      className="px-4 py-2 rounded-lg text-xs"
                      style={{ background: 'transparent', color: 'var(--text-muted)' }}
                    >
                      Compose Another
                    </button>
                  </div>
                  {feedbackErr && (
                    <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{feedbackErr}</p>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-xl border px-5 py-4 flex items-center justify-between gap-4"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card-2)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      Ready to act on these insights?
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      AI will write a retention email, create an <strong>at-risk-{result.meta.labelName}</strong> label,
                      and save the campaign as a <strong>Draft</strong> for your review.
                    </p>
                  </div>
                  <button
                    onClick={openCompose}
                    className="px-4 py-2 rounded-lg text-xs font-medium shrink-0"
                    style={{ background: 'var(--accent-pos)', color: '#fff' }}
                  >
                    Compose Draft
                  </button>
                </div>
              )}

              {/* Compose Modal */}
              {showCompose && !composeResult && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  style={{ background: 'rgba(15,23,42,0.5)' }}
                  onClick={() => !composing && setShowCompose(false)}
                >
                  <div
                    className="w-full max-w-md rounded-xl border p-6 flex flex-col gap-5"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        Compose Retention Draft
                      </h3>
                      <button
                        onClick={() => setShowCompose(false)}
                        style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}
                        disabled={composing}
                      >×</button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>Sender *</span>
                        <select
                          className="input-text"
                          value={composeSenderId}
                          onChange={e => setComposeSenderId(e.target.value)}
                          disabled={composing}
                        >
                          <option value="">— Select sender —</option>
                          {senders.map(s => (
                            <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>
                          Subject
                          <span className="font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                            (leave blank to auto-generate)
                          </span>
                        </span>
                        <input
                          className="input-text"
                          type="text"
                          value={composeSubject}
                          onChange={e => setComposeSubject(e.target.value)}
                          placeholder="AI will generate if empty"
                          disabled={composing}
                          maxLength={80}
                        />
                      </label>

                      <div
                        className="text-xs rounded-lg px-3 py-2"
                        style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}
                      >
                        Campaign will target <strong style={{ color: 'var(--text)' }}>at-risk-{result.meta.labelName}</strong>
                        {' '}({result.atRisk.length} contacts) and saved as <strong style={{ color: 'var(--text)' }}>Draft</strong>.
                        No email will be sent until you manually approve it in Campaigns.
                      </div>
                    </div>

                    {composeErr && (
                      <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{composeErr}</p>
                    )}

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowCompose(false)}
                        disabled={composing}
                        className="px-4 py-2 rounded-lg text-xs disabled:opacity-40"
                        style={{ background: 'var(--border)', color: 'var(--text)' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCompose}
                        disabled={composing || !composeSenderId}
                        className="px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ background: 'var(--accent-pos)', color: '#fff' }}
                      >
                        {composing ? 'Generating & creating…' : 'Create Draft'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* M5: Feedback panel */}
          {feedback && (
            <div className="flex flex-col gap-4">
              {/* Hero metric */}
              <div
                className="rounded-xl border p-5 flex flex-col gap-4"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Re-engagement Check
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col">
                    <span
                      className="text-4xl font-bold tabular-nums"
                      style={{ color: feedback.reEngaged > 0 ? 'var(--accent-pos)' : 'var(--text-muted)' }}
                    >
                      {feedback.reEngaged}
                    </span>
                    <span className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      dari {feedback.totalTracked} contacts re-engaged
                    </span>
                  </div>
                  <div className="h-12 w-px" style={{ background: 'var(--border)' }} />
                  <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <p>
                      <strong style={{ color: 'var(--text)' }}>At-risk before:</strong>{' '}
                      {feedback.before.atRiskCount} (dari {feedback.before.totalScored} total)
                    </p>
                    <p>
                      <strong style={{ color: 'var(--text)' }}>At-risk sekarang:</strong>{' '}
                      {feedback.after.atRiskCount} (dari {feedback.after.totalScored} total)
                    </p>
                    <p>
                      <strong style={{ color: 'var(--text)' }}>Snapshot diambil:</strong>{' '}
                      {new Date(feedback.runCreatedAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                {feedback.totalTracked > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <span>Re-engaged</span>
                      <span>{Math.round(feedback.reEngaged / feedback.totalTracked * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${feedback.reEngaged / feedback.totalTracked * 100}%`,
                          background: 'var(--accent-pos)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Delta table */}
              {feedback.deltas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                    Score Delta — Before vs Sekarang
                  </p>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--bg-card-2)', borderBottom: '1px solid var(--border)' }}>
                          {['Contact', 'Before', 'Sekarang', 'Delta', 'Status'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.deltas.map((d, i) => (
                          <tr
                            key={d.email}
                            style={{
                              background: d.reEngaged
                                ? 'rgba(26,107,90,0.05)'
                                : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <td className="px-4 py-3" style={{ color: 'var(--text)' }}>
                              <p className="font-medium">{d.name ?? d.email}</p>
                              {d.name && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.email}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <RiskBadge risk={d.riskBefore} />
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{d.scoreBefore}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <RiskBadge risk={d.riskAfter} />
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{d.scoreAfter}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs font-mono font-semibold"
                                style={{
                                  color: d.delta < 0
                                    ? 'var(--accent-pos)'
                                    : d.delta > 0 ? 'var(--accent-neg)' : 'var(--text-muted)',
                                }}
                              >
                                {d.delta > 0 ? '+' : ''}{d.delta}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {d.reEngaged ? (
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: 'rgba(26,107,90,0.15)', color: 'var(--accent-pos)' }}
                                >
                                  Re-engaged ✓
                                </span>
                              ) : d.delta < 0 ? (
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Membaik</span>
                              ) : d.delta > 0 ? (
                                <span className="text-[10px]" style={{ color: 'var(--accent-neg)' }}>Memburuk</span>
                              ) : (
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sama</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setFeedback(null); setFeedbackErr('') }}
                className="text-xs self-start"
                style={{ color: 'var(--text-muted)' }}
              >
                Tutup hasil ×
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
