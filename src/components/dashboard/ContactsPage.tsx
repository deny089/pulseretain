'use client'

import { useEffect, useState, useRef } from 'react'
import {
  listContacts, createContact, updateContact, deleteContact, listLabels,
} from '@/lib/mailtarget/api'
import type { Contact, Label, CreateContactPayload } from '@/lib/mailtarget/types'

const PRESET_COLORS = ['#1a6b5a','#1d4ed8','#6d28d9','#d97706','#dc2626','#16a34a','#ea580c','#db2777','#64748b']
function labelColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PRESET_COLORS.length
  return PRESET_COLORS[h]
}

function contactDisplayName(c: Contact): string {
  if (c.firstname || c.lastname) return [c.firstname, c.lastname].filter(Boolean).join(' ')
  return c.name ?? c.email
}

function StateBadge({ state }: { state: string | undefined }) {
  const map: Record<string, [string, string]> = {
    ACTIVE:       ['badge-green', 'Active'],
    UNSUBSCRIBED: ['badge-gray',  'Unsubscribed'],
    BOUNCED:      ['badge-red',   'Bounced'],
  }
  const [cls, label] = map[state ?? ''] ?? ['badge-gray', state ?? '—']
  return <span className={`badge ${cls}`}>{label}</span>
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

type FormState = CreateContactPayload & { labelsArr?: string[] }

const EMPTY_FORM: FormState = { email: '', firstname: '', lastname: '', phone: '', labels: [] }

export default function ContactsPage() {
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [labels, setLabels]           = useState<Label[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterLabel, setFilterLabel] = useState('')
  const searchTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Contact | null>(null)
  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)

  async function reload(q = '') {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = { perPage: 50 }
      if (q) params.search = q
      const [c, l] = await Promise.all([listContacts(params), listLabels({ perPage: 100 })])
      setAllContacts(Array.isArray(c.data) ? c.data : [])
      setLabels(Array.isArray(l.data) ? l.data : [])
    } catch {
      setAllContacts([]); setLabels([])
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  function handleSearchChange(q: string) {
    setSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => reload(q), 400)
  }

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setSaveErr(''); setShowForm(true)
  }

  function openEdit(c: Contact) {
    setEditing(c)
    setForm({
      email: c.email,
      firstname: c.firstname ?? '',
      lastname: c.lastname ?? '',
      phone: c.phone ?? '',
      labels: c.labels ?? [],
    })
    setSaveErr(''); setShowForm(true)
  }

  async function handleSave() {
    setSaving(true); setSaveErr('')
    const payload: CreateContactPayload = {
      ...form,
      labels: form.labels?.length ? form.labels : undefined,
      firstname: form.firstname || undefined,
      lastname: form.lastname || undefined,
      phone: form.phone || undefined,
    }
    const { error } = editing
      ? await updateContact(editing.id, payload)
      : await createContact(payload)
    if (error) { setSaveErr(error); setSaving(false); return }
    setShowForm(false); reload()
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteContact(deleteTarget.id)
    setDeleteTarget(null); reload()
  }

  const displayed = filterLabel
    ? allContacts.filter(c => (c.labels ?? []).some(l => l.toLowerCase() === filterLabel.toLowerCase()))
    : allContacts

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Contacts</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{allContacts.length} contacts</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent-pos)', color: '#fff' }}
        >
          + New Contact
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          className="input-text"
          style={{ minWidth: 200 }}
          placeholder="Search contacts…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
        />
        <select
          className="input-select"
          value={filterLabel}
          onChange={e => setFilterLabel(e.target.value)}
        >
          <option value="">All Labels</option>
          {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-card-2)', borderBottom: `1px solid var(--border)` }}>
              {['Name', 'Email', 'Labels', 'State', 'Created', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No contacts found.</td></tr>
            ) : displayed.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{contactDisplayName(c)}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>{c.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.labels ?? []).map(l => (
                      <span
                        key={l}
                        className="badge"
                        style={{
                          background: labelColor(l) + '22',
                          color: labelColor(l),
                          border: `1px solid ${labelColor(l)}44`,
                        }}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3"><StateBadge state={c.state} /></td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(c)} style={{ color: 'var(--accent-blue)' }}>Edit</button>
                    <button onClick={() => setDeleteTarget(c)} style={{ color: 'var(--accent-neg)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal title={editing ? 'Edit Contact' : 'New Contact'} onClose={() => setShowForm(false)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name">
                <input className="input-text" value={form.firstname ?? ''} onChange={e => setForm(f => ({ ...f, firstname: e.target.value }))} placeholder="Jane" />
              </Field>
              <Field label="Last Name">
                <input className="input-text" value={form.lastname ?? ''} onChange={e => setForm(f => ({ ...f, lastname: e.target.value }))} placeholder="Doe" />
              </Field>
            </div>
            <Field label="Email *">
              <input className="input-text" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" disabled={!!editing} />
            </Field>
            <Field label="Phone">
              <input className="input-text" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+62…" />
            </Field>
            <Field label="Labels">
              <select
                className="input-select"
                multiple
                value={form.labels ?? []}
                onChange={e => {
                  const vals = Array.from(e.target.selectedOptions, o => o.value)
                  setForm(f => ({ ...f, labels: vals }))
                }}
              >
                {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            </Field>
            {saveErr && <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{saveErr}</p>}
            <button
              onClick={handleSave}
              disabled={saving || !form.email}
              className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--accent-pos)', color: '#fff' }}
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Contact'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Contact" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Delete <strong>{contactDisplayName(deleteTarget)}</strong> ({deleteTarget.email})? This cannot be undone.
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
