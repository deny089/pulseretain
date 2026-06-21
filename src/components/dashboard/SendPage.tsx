'use client'

import { useEffect, useRef, useState } from 'react'
import {
  listSenders,
  listCampaigns,
  listLabels,
  sendCampaign,
  sendTestCampaign,
  sendTransmission,
  getAnalyticsSummary,
  getTransmissionEvents,
} from '@/lib/mailtarget/api'
import type {
  Sender,
  Campaign,
  Label,
  AnalyticsSummary,
  TransmissionEvent,
} from '@/lib/mailtarget/types'

type Mode = 'campaign' | 'tx'
type FeedItem = {
  id: string
  type: 'campaign' | 'tx'
  subject: string
  to?: string
  status: string
  ts: string
  campaignId?: string
  txId?: string
}

const PRESET_COLORS = ['#1a6b5a','#1d4ed8','#6d28d9','#d97706','#dc2626','#16a34a','#ea580c']
function labelColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PRESET_COLORS.length
  return PRESET_COLORS[h]
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    delivered:    ['badge-green',  'Delivered'],
    opened:       ['badge-blue',   'Opened'],
    clicked:      ['badge-blue',   'Clicked'],
    sent:         ['badge-purple', 'Sent'],
    sending:      ['badge-amber',  'Sending…'],
    bounced:      ['badge-red',    'Bounced'],
    failed:       ['badge-red',    'Failed'],
    FINISH:       ['badge-green',  'Finished'],
    SENDING:      ['badge-blue',   'Sending'],
    DRAFT:        ['badge-amber',  'Draft'],
    CANCELLED:    ['badge-gray',   'Cancelled'],
  }
  const [cls, label] = map[status] ?? ['badge-gray', status ?? '—']
  return <span className={`badge ${cls}`}>{label}</span>
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-xl p-4 border flex flex-col gap-1"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function SendPage() {
  const [mode, setMode]       = useState<Mode>('campaign')
  const [senders, setSenders] = useState<Sender[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [labels, setLabels]   = useState<Label[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [feed, setFeed]       = useState<FeedItem[]>([])

  // Campaign form
  const [selCampaign, setSelCampaign] = useState('')
  const [testEmail, setTestEmail]     = useState('')
  const [sending, setSending]         = useState(false)
  const [sendMsg, setSendMsg]         = useState('')

  // Transactional form
  const [txFrom, setTxFrom]       = useState('')
  const [txTo, setTxTo]           = useState('')
  const [txSubject, setTxSubject] = useState('')
  const [txBody, setTxBody]       = useState('')
  const [txSending, setTxSending] = useState(false)
  const [txMsg, setTxMsg]         = useState('')

  // Event detail modal
  const [eventDetail, setEventDetail] = useState<{ id: string; events: TransmissionEvent[] } | null>(null)
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Preview modal
  const [previewHtml, setPreviewHtml] = useState('')

  useEffect(() => {
    const today = new Date()
    const from  = new Date(today); from.setDate(today.getDate() - 30)
    const fmt   = (d: Date) => d.toISOString().split('T')[0]

    Promise.all([
      listSenders(),
      listCampaigns({ perPage: 50 }),
      listLabels({ perPage: 100 }),
      getAnalyticsSummary({ from: fmt(from), to: fmt(today) }),
    ]).then(([s, c, l, sum]) => {
      setSenders(Array.isArray(s.data) ? s.data : [])
      const camps = Array.isArray(c.data) ? c.data : []
      setCampaigns(camps)
      setLabels(Array.isArray(l.data) ? l.data : [])
      setSummary(sum.data ?? null)

      const feedItems: FeedItem[] = camps.slice(0, 20).map(camp => ({
        id: camp.id,
        type: 'campaign',
        subject: camp.subject,
        status: camp.stage ?? '',
        ts: camp.lastUpdate ?? camp.updatedAt ?? camp.createdAt ?? '',
        campaignId: camp.id,
      }))
      setFeed(feedItems)
    })
  }, [])

  async function handleSendCampaign() {
    if (!selCampaign) return
    setSending(true); setSendMsg('')
    const { error } = await sendCampaign(selCampaign)
    setSendMsg(error ? `Error: ${error}` : 'Campaign sent successfully.')
    setSending(false)
  }

  async function handleSendTest() {
    if (!selCampaign || !testEmail) return
    setSending(true); setSendMsg('')
    const { error } = await sendTestCampaign(selCampaign, { recipient: testEmail })
    setSendMsg(error ? `Error: ${error}` : `Test email sent to ${testEmail}.`)
    setSending(false)
  }

  async function handleSendTx() {
    if (!txTo || !txSubject || !txBody) return
    const sender = senders.find(s => s.id === txFrom)
    if (!sender) { setTxMsg('Select a sender first.'); return }
    setTxSending(true); setTxMsg('')
    const { error } = await sendTransmission({
      from: { name: sender.name, email: sender.email },
      to:   [{ email: txTo }],
      subject: txSubject,
      bodyHtml: txBody,
    })
    setTxMsg(error ? `Error: ${error}` : 'Email sent successfully.')
    setTxSending(false)
  }

  async function openEventDetail(txId: string) {
    setLoadingEvents(true)
    setEventDetail({ id: txId, events: [] })
    const { data } = await getTransmissionEvents(txId)
    setEventDetail({ id: txId, events: Array.isArray(data) ? data : [] })
    setLoadingEvents(false)
  }

  const selCampaignObj = campaigns.find(c => c.id === selCampaign)

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Send & Monitor</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Compose, send, and track email activity</p>
      </div>

      {/* Metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Sent"          value={summary.sentCount ?? 0} />
          <MetricCard label="Delivered"     value={summary.deliveredCount ?? 0} color="var(--accent-pos)" />
          <MetricCard label="Opened"        value={summary.openCount ?? 0}    color="var(--accent-blue)" />
          <MetricCard label="Clicked"       value={summary.clickCount ?? 0}   color="var(--accent-blue)" />
          <MetricCard label="Bounced"       value={summary.bounceCount ?? 0}   color="var(--accent-neg)" />
          <MetricCard label="Open Rate"     value={summary.openRate != null ? `${(summary.openRate * 100).toFixed(1)}%` : '—'} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose Panel */}
        <div
          className="rounded-xl border p-5 flex flex-col gap-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Compose</h2>
            <div
              className="flex rounded-lg overflow-hidden border text-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              {(['campaign', 'tx'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="px-3 py-1.5 transition-colors"
                  style={{
                    background: mode === m ? 'var(--border)' : 'transparent',
                    color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  {m === 'campaign' ? 'Campaign' : 'Transactional'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'campaign' ? (
            <div className="flex flex-col gap-3">
              <Field label="Campaign">
                <select
                  className="input-select"
                  value={selCampaign}
                  onChange={e => setSelCampaign(e.target.value)}
                >
                  <option value="">Select campaign…</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.subject} ({c.stage ?? '—'})</option>
                  ))}
                </select>
              </Field>
              {selCampaignObj && (
                <div
                  className="text-xs rounded-lg px-3 py-2 border"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-base)', borderColor: 'var(--border)' }}
                >
                  Stage: <StatusBadge status={(selCampaignObj.stage ?? '').toUpperCase()} />
                  {selCampaignObj.recipients?.labels && (
                    <span className="ml-2">Labels: {selCampaignObj.recipients.labels.join(', ')}</span>
                  )}
                </div>
              )}
              <Field label="Test email (optional)">
                <input
                  type="email"
                  className="input-text"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
              </Field>
              {sendMsg && (
                <p
                  className="text-xs px-3 py-2 rounded-lg border"
                  style={{
                    color: sendMsg.startsWith('Error') ? 'var(--accent-neg)' : 'var(--accent-pos)',
                    borderColor: 'var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  {sendMsg}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Btn
                  onClick={handleSendTest}
                  disabled={sending || !selCampaign || !testEmail}
                  variant="ghost"
                >
                  Send Test
                </Btn>
                <Btn
                  onClick={handleSendCampaign}
                  disabled={sending || !selCampaign}
                >
                  {sending ? 'Sending…' : 'Send Campaign'}
                </Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="From">
                <select
                  className="input-select"
                  value={txFrom}
                  onChange={e => setTxFrom(e.target.value)}
                >
                  <option value="">Select sender…</option>
                  {senders.map(s => (
                    <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>
                  ))}
                </select>
              </Field>
              <Field label="To">
                <input
                  type="email"
                  className="input-text"
                  placeholder="recipient@example.com"
                  value={txTo}
                  onChange={e => setTxTo(e.target.value)}
                />
              </Field>
              <Field label="Subject">
                <input
                  type="text"
                  className="input-text"
                  placeholder="Email subject"
                  value={txSubject}
                  onChange={e => setTxSubject(e.target.value)}
                />
              </Field>
              <Field label="Body (HTML)">
                <textarea
                  className="input-text font-mono text-xs resize-none"
                  rows={5}
                  placeholder="<p>Hello, world!</p>"
                  value={txBody}
                  onChange={e => setTxBody(e.target.value)}
                />
              </Field>
              {txBody && (
                <button
                  className="text-xs self-start"
                  style={{ color: 'var(--accent-blue)' }}
                  onClick={() => setPreviewHtml(txBody)}
                >
                  Preview HTML
                </button>
              )}
              {txMsg && (
                <p
                  className="text-xs px-3 py-2 rounded-lg border"
                  style={{
                    color: txMsg.startsWith('Error') ? 'var(--accent-neg)' : 'var(--accent-pos)',
                    borderColor: 'var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  {txMsg}
                </p>
              )}
              <Btn
                onClick={handleSendTx}
                disabled={txSending || !txFrom || !txTo || !txSubject || !txBody}
              >
                {txSending ? 'Sending…' : 'Send Email'}
              </Btn>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div
          className="rounded-xl border p-5 flex flex-col gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Activity Feed</h2>
          {feed.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No activity yet.</p>
          ) : (
            <div className="flex flex-col gap-0 overflow-y-auto" style={{ maxHeight: 380 }}>
              {feed.map((item, i) => (
                <div
                  key={item.id + i}
                  className="flex items-start gap-3 py-3 border-b"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: item.type === 'campaign' ? '#DBEAFE' : '#D1FAE5', color: item.type === 'campaign' ? 'var(--accent-blue)' : 'var(--accent-pos)' }}
                  >
                    {item.type === 'campaign' ? 'C' : 'T'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{item.subject}</p>
                    {item.to && (
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{item.to}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={item.status.toUpperCase()} />
                      {item.ts && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(item.ts).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.txId && (
                    <button
                      className="text-[10px] shrink-0"
                      style={{ color: 'var(--accent-blue)' }}
                      onClick={() => openEventDetail(item.txId!)}
                    >
                      Events
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Modal */}
      {eventDetail && (
        <Modal title={`Events — ${eventDetail.id}`} onClose={() => setEventDetail(null)}>
          {loadingEvents ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : eventDetail.events.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No events found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {eventDetail.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <StatusBadge status={ev.type} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {ev.timestamp ? new Date(ev.timestamp * 1000).toLocaleString() : '—'}
                  </p>
                  {ev.recipient && <p className="text-xs" style={{ color: 'var(--text)' }}>{ev.recipient}</p>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Preview Modal */}
      {previewHtml && (
        <Modal title="HTML Preview" onClose={() => setPreviewHtml('')}>
          <iframe
            srcDoc={previewHtml}
            className="w-full rounded-lg border"
            style={{ height: 400, borderColor: 'var(--border)', background: '#fff' }}
            sandbox="allow-same-origin"
          />
        </Modal>
      )}
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>{label}</span>
      {children}
    </label>
  )
}

function Btn({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40"
      style={
        variant === 'primary'
          ? { background: 'var(--accent-pos)', color: '#fff' }
          : { background: 'var(--border)', color: 'var(--text)' }
      }
    >
      {children}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border p-5 flex flex-col gap-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="text-lg leading-none"
            style={{ color: 'var(--text-muted)' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
