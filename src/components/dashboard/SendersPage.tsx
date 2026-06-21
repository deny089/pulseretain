'use client'

import { useEffect, useState } from 'react'
import { listSenders, createSender, updateSender, deleteSender } from '@/lib/mailtarget/api'
import type { Sender, CreateSenderPayload } from '@/lib/mailtarget/types'

function SenderStatusBadge({ sender }: { sender: Sender }) {
  if (sender.permitted && sender.validate) return <span className="badge badge-green">Verified</span>
  if (sender.validate) return <span className="badge badge-blue">Validated</span>
  return <span className="badge badge-amber">Pending</span>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
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

const EMPTY: CreateSenderPayload = { name: '', email: '', assignment: '' }

export default function SendersPage() {
  const [senders, setSenders] = useState<Sender[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Sender | null>(null)
  const [form, setForm]         = useState<CreateSenderPayload>(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Sender | null>(null)

  async function reload() {
    setLoading(true)
    const { data } = await listSenders()
    setSenders(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  function openCreate() { setEditing(null); setForm(EMPTY); setSaveErr(''); setShowForm(true) }
  function openEdit(s: Sender) {
    setEditing(s)
    setForm({ name: s.name, email: s.email, assignment: s.domainAssignment ?? '' })
    setSaveErr(''); setShowForm(true)
  }

  async function handleSave() {
    setSaving(true); setSaveErr('')
    const payload = { ...form, assignment: form.assignment || undefined }
    const { error } = editing
      ? await updateSender(editing.id, payload)
      : await createSender(payload)
    if (error) { setSaveErr(error); setSaving(false); return }
    setShowForm(false); reload(); setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteSender(deleteTarget.id)
    setDeleteTarget(null); reload()
  }

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Senders</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{senders.length} sender identities</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent-pos)', color: '#fff' }}
        >
          + New Sender
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-card-2)', borderBottom: `1px solid var(--border)` }}>
              {['Name', 'Email', 'Domain', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : senders.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No senders yet.</td></tr>
            ) : senders.map((s, i) => (
              <tr
                key={s.id}
                style={{
                  background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{s.name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>{s.email}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{s.domain ?? '—'}</td>
                <td className="px-4 py-3"><SenderStatusBadge sender={s} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(s)} style={{ color: 'var(--accent-blue)' }}>Edit</button>
                    <button onClick={() => setDeleteTarget(s)} style={{ color: 'var(--accent-neg)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <Modal title={editing ? 'Edit Sender' : 'New Sender'} onClose={() => setShowForm(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Name *">
              <input className="input-text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Marketing Team" />
            </Field>
            <Field label="Email *">
              <input className="input-text" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="team@yourdomain.com" />
            </Field>
            <Field label="Assignment (optional)">
              <input className="input-text" value={form.assignment ?? ''} onChange={e => setForm(f => ({ ...f, assignment: e.target.value }))} placeholder="Domain assignment" />
            </Field>
            {saveErr && <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{saveErr}</p>}
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.email}
              className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--accent-pos)', color: '#fff' }}
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Sender'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Sender" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})? This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent-neg)', color: '#fff' }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
