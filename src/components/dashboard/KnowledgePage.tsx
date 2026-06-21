'use client'

import { useEffect, useRef, useState } from 'react'

type SourceStatus = 'pending' | 'processing' | 'ready' | 'error'

type Source = {
  id: string
  type: 'url' | 'pdf'
  title: string
  origin: string
  status: SourceStatus
  error_msg?: string
  created_at: string
  processed_at?: string
  chunk_count: number
}

function StatusBadge({ status }: { status: SourceStatus }) {
  const map: Record<SourceStatus, [string, string]> = {
    pending:    ['badge-gray',  'Pending'],
    processing: ['badge-amber', 'Processing'],
    ready:      ['badge-green', 'Ready'],
    error:      ['badge-red',   'Error'],
  }
  const [cls, label] = map[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

function TypeBadge({ type }: { type: 'url' | 'pdf' }) {
  return (
    <span className={`badge ${type === 'pdf' ? 'badge-purple' : 'badge-blue'}`}>
      {type.toUpperCase()}
    </span>
  )
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

export default function KnowledgePage() {
  const [sources, setSources]   = useState<Source[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadErr, setLoadErr]   = useState('')
  const pollRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollAttempts = useRef(0)
  const MAX_POLL     = 30   // stop after 30 attempts (~2.5 min at max interval)
  const POLL_BASE_MS = 3000
  const POLL_MAX_MS  = 30_000

  // URL modal
  const [showUrl, setShowUrl]   = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlBusy, setUrlBusy]   = useState(false)
  const [urlMsg, setUrlMsg]     = useState('')

  // PDF upload
  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy]   = useState(false)
  const [pdfMsg, setPdfMsg]     = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
    pollAttempts.current = 0
  }

  function scheduleNextPoll() {
    if (pollAttempts.current >= MAX_POLL) { stopPolling(); return }
    const delay = Math.min(POLL_BASE_MS * Math.pow(1.4, pollAttempts.current), POLL_MAX_MS)
    pollAttempts.current += 1
    pollRef.current = setTimeout(reloadAndContinue, delay)
  }

  async function reloadAndContinue() {
    pollRef.current = null
    await reload(false)  // don't show full loading spinner on background polls
    // scheduleNextPoll is called inside reload when still processing
  }

  async function reload(showSpinner = true) {
    if (showSpinner) { setLoading(true); setLoadErr('') }
    try {
      const res = await fetch('/api/sources')
      const json = await res.json()
      const list: Source[] = Array.isArray(json.data) ? json.data : []
      setSources(list)
      const stillProcessing = list.some(s => s.status === 'processing' || s.status === 'pending')
      if (stillProcessing) {
        scheduleNextPoll()
      } else {
        stopPolling()
      }
    } catch {
      setLoadErr('Failed to load sources. Check your connection.')
      stopPolling()
    }
    if (showSpinner) setLoading(false)
  }

  function startPolling() {
    if (pollRef.current) return
    pollAttempts.current = 0
    scheduleNextPoll()
  }

  useEffect(() => {
    reload()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAddUrl() {
    if (!urlInput.trim()) return
    setUrlBusy(true); setUrlMsg('')
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const json = await res.json()
      if (json.error) {
        setUrlMsg(`Error: ${json.error}`)
      } else {
        setShowUrl(false); setUrlInput(''); reload(); startPolling()
      }
    } catch {
      setUrlMsg('Network error. Please try again.')
    }
    setUrlBusy(false)
  }

  async function handlePdfUpload(file: File) {
    setPdfBusy(true); setPdfMsg('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/sources/pdf', { method: 'POST', body: form })
      const json = await res.json()
      if (json.error) {
        setPdfMsg(`Error: ${json.error}`)
      } else {
        setPdfMsg(`Ingested ${json.data.chunkCount} chunks.`)
        reload()
      }
    } catch {
      setPdfMsg('Network error. Please try again.')
    }
    setPdfBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/sources/${target.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      reload()
    } catch {
      setLoadErr(`Failed to delete "${target.title}". Please try again.`)
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Knowledge Sources</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            URLs and documents ingested for RAG analysis
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setUrlInput(''); setUrlMsg(''); setShowUrl(true) }}
            className="px-4 py-2 rounded-lg text-xs font-medium"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            + Add URL
          </button>
          <label
            className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'var(--accent-pos)', color: '#fff', opacity: pdfBusy ? 0.5 : 1 }}
          >
            {pdfBusy ? 'Processing…' : '+ Upload PDF'}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={pdfBusy}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handlePdfUpload(f)
              }}
            />
          </label>
        </div>
      </div>

      {loadErr && (
        <p className="text-xs px-3 py-2 rounded-lg border" style={{ color: 'var(--accent-neg)', borderColor: 'var(--border)', background: 'var(--bg-base)' }}>
          {loadErr}
        </p>
      )}

      {pdfMsg && (
        <p
          className="text-xs px-3 py-2 rounded-lg border"
          style={{
            color: pdfMsg.startsWith('Error') ? 'var(--accent-neg)' : 'var(--accent-pos)',
            borderColor: 'var(--border)', background: 'var(--bg-base)',
          }}
        >
          {pdfMsg}
        </p>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-card-2)', borderBottom: `1px solid var(--border)` }}>
              {['Title', 'Type', 'Status', 'Chunks', 'Added', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  No sources yet. Add a URL or upload a PDF to start building your knowledge base.
                </td>
              </tr>
            ) : sources.map((s, i) => (
              <tr
                key={s.id}
                style={{
                  background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-2)',
                  borderBottom: `1px solid var(--border)`,
                }}
              >
                <td className="px-4 py-3 max-w-xs" style={{ color: 'var(--text)' }}>
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="truncate mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{s.origin}</p>
                  {s.error_msg && (
                    <p className="truncate mt-0.5" style={{ color: 'var(--accent-neg)', fontSize: 10 }}>{s.error_msg}</p>
                  )}
                </td>
                <td className="px-4 py-3"><TypeBadge type={s.type} /></td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3" style={{ color: 'var(--text-sub)' }}>
                  {s.status === 'ready' ? s.chunk_count : '—'}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setDeleteTarget(s)} style={{ color: 'var(--accent-neg)' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add URL Modal */}
      {showUrl && (
        <Modal title="Add URL Source" onClose={() => setShowUrl(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>URL *</span>
              <input
                className="input-text"
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !urlBusy && urlInput && handleAddUrl()}
                placeholder="https://example.com/article"
                autoFocus
              />
            </label>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              The page will be crawled, chunked, and embedded. JS-heavy or login-gated pages may not work.
            </p>
            {urlMsg && (
              <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{urlMsg}</p>
            )}
            <button
              onClick={handleAddUrl}
              disabled={urlBusy || !urlInput.trim()}
              className="self-end px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}
            >
              {urlBusy ? 'Crawling & embedding…' : 'Add Source'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Delete Source" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Delete <strong>&ldquo;{deleteTarget.title}&rdquo;</strong>? All {deleteTarget.chunk_count} chunks will be removed.
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
