'use client'

import { useEffect, useState } from 'react'
import type { AnalysisRunListItem, FeedbackSummary } from '@/lib/retention/runs'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function ReEngagementBar({ fb }: { fb: FeedbackSummary }) {
  const pct = fb.totalTracked > 0 ? Math.round((fb.reEngaged / fb.totalTracked) * 100) : 0
  const color = pct >= 50 ? 'var(--accent-pos)' : pct >= 20 ? 'var(--accent-amber)' : 'var(--accent-neg)'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)', minWidth: 60 }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color }}>
        {fb.reEngaged}/{fb.totalTracked}
      </span>
    </div>
  )
}

function RiskBadge({ count, total }: { count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const color = pct >= 50 ? 'var(--accent-neg)' : pct >= 25 ? 'var(--accent-amber)' : 'var(--accent-pos)'
  return (
    <span className="text-xs font-semibold tabular-nums" style={{ color }}>
      {count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {total}</span>
    </span>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<AnalysisRunListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/retention/runs')
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error)
        setRuns(json.data ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          Analysis History
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Riwayat semua retention analysis run, termasuk hasil feedback re-engagement.
        </p>
      </div>

      {/* State: loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent-pos)', borderTopColor: 'transparent' }}
          />
          Memuat riwayat...
        </div>
      )}

      {/* State: error */}
      {!loading && error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--accent-neg)', color: 'var(--accent-neg)' }}
        >
          {error}
        </div>
      )}

      {/* State: empty */}
      {!loading && !error && runs.length === 0 && (
        <div
          className="rounded-xl border p-8 flex flex-col items-center gap-2 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <span className="text-2xl">📊</span>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Belum ada analysis run
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Jalankan analisis pertama kamu di halaman Retention.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && runs.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {/* Table header */}
          <div
            className="grid items-center gap-4 px-4 py-2.5 border-b text-[11px] font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '1fr 130px 110px 200px 110px',
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
              background: 'var(--bg-card-2)',
            }}
          >
            <span>Label</span>
            <span>At-Risk / Total</span>
            <span>Campaign</span>
            <span>Re-engagement</span>
            <span className="text-right">Tanggal</span>
          </div>

          {/* Rows */}
          {runs.map((run, i) => (
            <div
              key={run.id}
              className="grid items-center gap-4 px-4 py-3 border-b last:border-b-0 text-sm"
              style={{
                gridTemplateColumns: '1fr 130px 110px 200px 110px',
                borderColor: 'var(--border)',
                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
              }}
            >
              {/* Label */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="font-medium truncate"
                  style={{ color: 'var(--text)' }}
                  title={run.labelName}
                >
                  {run.labelName}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Run #{run.id.slice(0, 8)}
                </span>
              </div>

              {/* At-risk / total scored */}
              <RiskBadge count={run.atRiskCount} total={run.totalScored} />

              {/* Campaign link */}
              {run.campaignId ? (
                <a
                  href="/dashboard/campaigns"
                  className="text-xs font-mono truncate underline underline-offset-2"
                  style={{ color: 'var(--accent-blue)' }}
                  title={`Campaign ${run.campaignId}`}
                >
                  {run.campaignId.slice(0, 10)}…
                </a>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
              )}

              {/* Re-engagement */}
              {run.feedbackResult ? (
                <ReEngagementBar fb={run.feedbackResult} />
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                  Belum dicek
                </span>
              )}

              {/* Date */}
              <span className="text-xs text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {formatDate(run.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && runs.length > 0 && (
        <div
          className="flex flex-wrap gap-4 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <span><span style={{ color: 'var(--accent-pos)' }}>■</span> Re-engagement ≥50%</span>
          <span><span style={{ color: 'var(--accent-amber)' }}>■</span> 20–49%</span>
          <span><span style={{ color: 'var(--accent-neg)' }}>■</span> &lt;20%</span>
          <span className="ml-auto">
            {runs.length} run ditampilkan
          </span>
        </div>
      )}
    </div>
  )
}
