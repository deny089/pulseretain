'use client'

import { useEffect, useState } from 'react'
import {
  listCampaigns,
  listSenders,
  listLabels,
  createCampaign,
  deleteCampaign,
  sendCampaign,
  sendTestCampaign,
  getCampaignAnalytics,
  getCampaignRecipients,
} from '@/lib/mailtarget/api'
import type { Campaign, Sender, Label, CampaignAnalytics, CampaignRecipient } from '@/lib/mailtarget/types'

function StageBadge({ stage }: { stage: string | undefined }) {
  const map: Record<string, [string, string]> = {
    DRAFT:     ['badge-amber', 'Draft'],
    SENDING:   ['badge-blue',  'Sending'],
    FINISH:    ['badge-green', 'Finished'],
    CANCELLED: ['badge-gray',  'Cancelled'],
  }
  const key = (stage ?? '').toUpperCase()
  const [cls, label] = map[key] ?? ['badge-gray', stage ?? '—']
  return <span className={`badge ${cls}`}>{label}</span>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>{label}</span>
      {children}
    </label>
  )
}

type FormState = {
  subject: string
  senderName: string
  senderEmail: string
  htmlContent: string
  labelTargets: string[]
}

const EMPTY_FORM: FormState = { subject: '', senderName: '', senderEmail: '', htmlContent: '', labelTargets: [] }

const RECIPIENTS_PER_PAGE = 100

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [senders, setSenders]     = useState<Sender[]>([])
  const [labels, setLabels]       = useState<Label[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creating, setCreating]   = useState(false)
  const [createErr, setCreateErr] = useState('')

  const [analyticsModal, setAnalyticsModal] = useState<{ campaign: Campaign; data: CampaignAnalytics | null } | null>(null)
  const [recipientsModal, setRecipientsModal] = useState<{
    campaign: Campaign
    data: CampaignRecipient[]
    page: number
    hasMore: boolean
    loading: boolean
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)

  const [testTarget, setTestTarget] = useState<Campaign | null>(null)
  const [testEmail, setTestEmail]   = useState('')
  const [testMsg, setTestMsg]       = useState('')

  const [sendTarget, setSendTarget] = useState<Campaign | null>(null)
  const [sendMsg, setSendMsg]       = useState('')

  async function reload() {
    setLoading(true)
    try {
      const [c, s, l] = await Promise.all([
        listCampaigns({ perPage: 50 }),
        listSenders(),
        listLabels({ perPage: 100 }),
      ])
      setCampaigns(Array.isArray(c.data) ? c.data : [])
      setSenders(Array.isArray(s.data) ? s.data : [])
      setLabels(Array.isArray(l.data) ? l.data : [])
    } catch {
      setCampaigns([]); setSenders([]); setLabels([])
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  function handleSenderSelect(senderId: string) {
    const s = senders.find(s => s.id === senderId)
    if (s) setForm(f => ({ ...f, senderName: s.name, senderEmail: s.email }))
    else setForm(f => ({ ...f, senderName: '', senderEmail: '' }))
  }

  async function handleCreate() {
    setCreating(true); setCreateErr('')
    const { error } = await createCampaign({
      subject: form.subject,
      sender: form.senderName && form.senderEmail
        ? { name: form.senderName, email: form.senderEmail }
        : undefined,
      htmlContent: form.htmlContent || undefined,
      recipients: form.labelTargets.length ? { labels: form.labelTargets } : undefined,
    })
    if (error) { setCreateErr(error); setCreating(false); return }
    setShowCreate(false)
    setForm(EMPTY_FORM)
    reload()
    setCreating(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteCampaign(deleteTarget.id)
    setDeleteTarget(null)
    reload()
  }

  async function handleSend() {
    if (!sendTarget) return
    const { error } = await sendCampaign(sendTarget.id)
    setSendMsg(error ? `Error: ${error}` : 'Sent successfully.')
    if (!error) { setSendTarget(null); reload() }
  }

  async function handleSendTest() {
    if (!testTarget || !testEmail) return
    const { error } = await sendTestCampaign(testTarget.id, { recipient: testEmail })
    setTestMsg(error ? `Error: ${error}` : `Test sent to ${testEmail}.`)
  }

  async function openAnalytics(c: Campaign) {
    setAnalyticsModal({ campaign: c, data: null })
    const { data } = await getCampaignAnalytics(c.id)
    setAnalyticsModal({ campaign: c, data: data ?? null })
  }

  async function openRecipients(c: Campaign) {
    setRecipientsModal({ campaign: c, data: [], page: 1, hasMore: false, loading: true })
    const { data } = await getCampaignRecipients(c.id, { perPage: RECIPIENTS_PER_PAGE, page: 1 })
    const list = Array.isArray(data) ? data : []
    setRecipientsModal({
      campaign: c,
      data: list,
      page: 1,
      hasMore: list.length === RECIPIENTS_PER_PAGE,
      loading: false,
    })
  }

  async function loadMoreRecipients() {
    const current = recipientsModal
    if (!current || current.loading) return
    setRecipientsModal(m => (m ? { ...m, loading: true } : m))
    const nextPage = current.page + 1
    const { data } = await getCampaignRecipients(current.campaign.id, {
      perPage: RECIPIENTS_PER_PAGE,
      page: nextPage,
    })
    const list = Array.isArray(data) ? data : []
    setRecipientsModal(m =>
      m
        ? {
            ...m,
            data: [...m.data, ...list],
            page: nextPage,
            hasMore: list.length === RECIPIENTS_PER_PAGE,
            loading: false,
          }
        : m,
    )
  }

  const filtered = campaigns.filter(c =>
    c.subject.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Campaigns</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{campaigns.length} campaigns total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent-pos)', color: '#fff' }}
        >
          + New Campaign
        </button>
      </div>

      <input
        type="text"
        className="input-text max-w-xs"
        placeholder="Search campaigns…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-card-2)', borderBottom: `1px solid var(--border)` }}>
              {['Subject', 'Stage', 'Sender', 'Labels', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No campaigns found.</td></tr>
            ) : filtered.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <td className="px-4 py-3 font-medium max-w-xs truncate" style={{ color: 'var(--text)' }}>{c.subject}</td>
                <td className="px-4 py-3"><StageBadge stage={c.stage} /></td>
                <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>{c.sender?.name ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>
                  {c.recipients?.labels?.join(', ') ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openAnalytics(c)} style={{ color: 'var(--accent-blue)' }}>Analytics</button>
                    <button onClick={() => openRecipients(c)} style={{ color: 'var(--accent-blue)' }}>Recipients</button>
                    {(c.stage ?? '').toUpperCase() === 'DRAFT' && (
                      <>
                        <button onClick={() => { setSendTarget(c); setSendMsg('') }} style={{ color: 'var(--accent-pos)' }}>Send</button>
                        <button onClick={() => { setTestTarget(c); setTestEmail(''); setTestMsg('') }} style={{ color: 'var(--text-sub)' }}>Test</button>
                      </>
                    )}
                    <button onClick={() => setDeleteTarget(c)} style={{ color: 'var(--accent-neg)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Campaign" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Subject *">
              <input className="input-text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Campaign subject line" />
            </Field>
            <Field label="Sender">
              <select
                className="input-select"
                onChange={e => handleSenderSelect(e.target.value)}
              >
                <option value="">None</option>
                {senders.map(s => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}
              </select>
            </Field>
            <Field label="HTML Content">
              <textarea className="input-text font-mono text-xs resize-none" rows={4} value={form.htmlContent} onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))} placeholder="<p>Your email content…</p>" />
            </Field>
            <Field label="Target Labels">
              <select
                className="input-select"
                multiple
                value={form.labelTargets}
                onChange={e => {
                  const vals = Array.from(e.target.selectedOptions, o => o.value)
                  setForm(f => ({ ...f, labelTargets: vals }))
                }}
              >
                {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            </Field>
            {createErr && <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{createErr}</p>}
            <button
              onClick={handleCreate}
              disabled={creating || !form.subject}
              className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--accent-pos)', color: '#fff' }}
            >
              {creating ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </Modal>
      )}

      {/* Send Confirm */}
      {sendTarget && (
        <Modal title="Send Campaign" onClose={() => setSendTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Send <strong>&ldquo;{sendTarget.subject}&rdquo;</strong> to all recipients?
          </p>
          {sendMsg && <p className="text-xs" style={{ color: sendMsg.startsWith('Error') ? 'var(--accent-neg)' : 'var(--accent-pos)' }}>{sendMsg}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setSendTarget(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>Cancel</button>
            <button onClick={handleSend} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent-pos)', color: '#fff' }}>Send</button>
          </div>
        </Modal>
      )}

      {/* Send Test Modal */}
      {testTarget && (
        <Modal title={`Test — ${testTarget.subject}`} onClose={() => setTestTarget(null)}>
          <Field label="Test recipient email">
            <input className="input-text" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" />
          </Field>
          {testMsg && <p className="text-xs" style={{ color: testMsg.startsWith('Error') ? 'var(--accent-neg)' : 'var(--accent-pos)' }}>{testMsg}</p>}
          <button onClick={handleSendTest} disabled={!testEmail} className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40" style={{ background: 'var(--border)', color: 'var(--text)' }}>Send Test</button>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Campaign" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>Delete <strong>&ldquo;{deleteTarget.subject}&rdquo;</strong>? This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent-neg)', color: '#fff' }}>Delete</button>
          </div>
        </Modal>
      )}

      {/* Analytics Modal */}
      {analyticsModal && (
        <Modal title={`Analytics — ${analyticsModal.campaign.subject}`} onClose={() => setAnalyticsModal(null)}>
          {!analyticsModal.data ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Sent',          analyticsModal.data.sentCount],
                ['Delivered',     analyticsModal.data.deliveredCount],
                ['Opened',        analyticsModal.data.openCount],
                ['Clicked',       analyticsModal.data.clickCount],
                ['Bounced',       analyticsModal.data.bounceCount],
                ['Unsubscribed',  analyticsModal.data.unsubscribeCount],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-lg border p-3" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label as string}</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{val as number ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Recipients Modal */}
      {recipientsModal && (
        <Modal title={`Recipients — ${recipientsModal.campaign.subject}`} onClose={() => setRecipientsModal(null)}>
          {recipientsModal.loading && recipientsModal.data.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
          ) : recipientsModal.data.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No recipients found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Showing {recipientsModal.data.length} recipient{recipientsModal.data.length === 1 ? '' : 's'}
                {recipientsModal.hasMore && ' (more available)'}
              </p>
              <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 300 }}>
                {recipientsModal.data.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                    <span>{r.email}</span>
                    {r.status && <span className="badge badge-gray">{r.status}</span>}
                  </div>
                ))}
              </div>
              {recipientsModal.hasMore && (
                <button
                  onClick={loadMoreRecipients}
                  disabled={recipientsModal.loading}
                  className="self-center px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ background: 'var(--border)', color: 'var(--text)' }}
                >
                  {recipientsModal.loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
