'use client'

import { useEffect, useState } from 'react'
import { listLabels, createLabel, updateLabel, deleteLabel } from '@/lib/mailtarget/api'
import type { Label } from '@/lib/mailtarget/types'

const PRESET_COLORS = ['#1a6b5a','#1d4ed8','#6d28d9','#d97706','#dc2626','#16a34a','#ea580c','#db2777','#64748b']
function labelColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PRESET_COLORS.length
  return PRESET_COLORS[h]
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function LabelsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [labels, setLabels]   = useState<Label[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [creating, setCreating]     = useState(false)
  const [createErr, setCreateErr]   = useState('')

  const [renameTarget, setRenameTarget] = useState<Label | null>(null)
  const [renameTo, setRenameTo]         = useState('')
  const [renaming, setRenaming]         = useState(false)
  const [renameErr, setRenameErr]       = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Label | null>(null)

  async function reload() {
    setLoading(true)
    const { data } = await listLabels({ perPage: 100 })
    setLabels(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  async function handleCreate() {
    setCreating(true); setCreateErr('')
    const { error } = await createLabel(newName.trim())
    if (error) { setCreateErr(error); setCreating(false); return }
    setShowCreate(false); setNewName('')
    reload(); setCreating(false)
  }

  async function handleRename() {
    if (!renameTarget) return
    setRenaming(true); setRenameErr('')
    const { error } = await updateLabel(renameTarget.name, renameTo.trim())
    if (error) { setRenameErr(error); setRenaming(false); return }
    setRenameTarget(null); reload(); setRenaming(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteLabel(deleteTarget.name)
    setDeleteTarget(null); reload()
  }

  return (
    <div className={embedded ? 'flex flex-col gap-6 w-full' : 'p-6 flex flex-col gap-6 w-full'}>
      <div className="flex items-center justify-between">
        <div>
          {!embedded && (
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Labels</h1>
          )}
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{labels.length} labels</p>
        </div>
        <button
          onClick={() => { setNewName(''); setCreateErr(''); setShowCreate(true) }}
          className="px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent-pos)', color: '#fff' }}
        >
          + New Label
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : labels.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No labels yet. Create one to segment your contacts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {labels.map(l => {
            const color = labelColor(l.name)
            return (
              <div
                key={l.name}
                className="rounded-xl border p-4 flex items-center justify-between gap-3"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{l.name}</p>
                    {l.contactCount != null && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{l.contactCount} contacts</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0 text-xs">
                  <button
                    onClick={() => { setRenameTarget(l); setRenameTo(l.name); setRenameErr('') }}
                    style={{ color: 'var(--accent-blue)' }}
                  >
                    Rename
                  </button>
                  <button onClick={() => setDeleteTarget(l)} style={{ color: 'var(--accent-neg)' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Label" onClose={() => setShowCreate(false)}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>Label name *</span>
            <input
              className="input-text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. VIP Customer"
              onKeyDown={e => e.key === 'Enter' && newName.trim() && handleCreate()}
              autoFocus
            />
          </label>
          {createErr && <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{createErr}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: 'var(--accent-pos)', color: '#fff' }}
          >
            {creating ? 'Creating…' : 'Create Label'}
          </button>
        </Modal>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <Modal title={`Rename "${renameTarget.name}"`} onClose={() => setRenameTarget(null)}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>New name *</span>
            <input
              className="input-text"
              value={renameTo}
              onChange={e => setRenameTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && renameTo.trim() && handleRename()}
              autoFocus
            />
          </label>
          {renameErr && <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{renameErr}</p>}
          <button
            onClick={handleRename}
            disabled={renaming || !renameTo.trim()}
            className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: 'var(--accent-pos)', color: '#fff' }}
          >
            {renaming ? 'Saving…' : 'Rename'}
          </button>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Label" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Delete label <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>? This cannot be undone.
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
