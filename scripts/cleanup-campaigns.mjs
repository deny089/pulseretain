/**
 * Cleanup duplicate campaigns:
 * - Per subject: keep the one WITH sender data, delete the rest
 * - Delete debug campaigns (P prefix-1, BISECT FULL)
 * - Delete campaigns with old firm name (Nusantara Asset Management)
 *
 * Run: node scripts/cleanup-campaigns.mjs
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const env = Object.fromEntries(
  fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const BASE_URL = env.MAILTARGET_BASE_URL
const API_KEY  = env.MAILTARGET_API_KEY

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function mt(method, p, body) {
  const res = await fetch(`${BASE_URL}${p}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

// Known debug/junk campaign subjects to always delete
const JUNK_SUBJECTS = ['P prefix-1', 'BISECT FULL']
// Old firm name — campaigns with this in subject should be deleted
const OLD_FIRM = 'Nusantara Asset Management'

async function fetchAllCampaigns() {
  let all = [], page = 1
  while (true) {
    const res = await mt('GET', `/campaigns?page=${page}&perPage=100`)
    if (!res.ok) { console.error('Failed to fetch campaigns:', res.status); process.exit(1) }
    const items = res.json.data ?? []
    all.push(...items)
    const meta = res.json.meta ?? {}
    if (items.length === 0 || all.length >= (meta.total ?? all.length)) break
    page++
    await sleep(300)
  }
  return all
}

async function main() {
  console.log('🧹 Fetching all campaigns...')
  const all = await fetchAllCampaigns()
  console.log(`   Found ${all.length} campaigns total\n`)

  const toDelete = []
  const toKeep   = []

  // Step 1: mark junk & old-name campaigns for deletion
  for (const c of all) {
    const id = c.id ?? c._id
    const subject = c.subject ?? ''
    const hasSender = !!(c.sender?.email)

    if (JUNK_SUBJECTS.includes(subject) || subject.includes(OLD_FIRM)) {
      toDelete.push({ id, subject, reason: 'junk/old-name' })
    }
  }

  // Step 2: group remaining by subject, keep best (has sender), delete rest
  const remaining = all.filter(c => {
    const subject = c.subject ?? ''
    return !JUNK_SUBJECTS.includes(subject) && !subject.includes(OLD_FIRM)
  })

  const grouped = {}
  for (const c of remaining) {
    const subject = c.subject ?? ''
    if (!grouped[subject]) grouped[subject] = []
    grouped[subject].push(c)
  }

  for (const [subject, group] of Object.entries(grouped)) {
    if (group.length === 1) {
      toKeep.push({ id: group[0].id ?? group[0]._id, subject, sender: group[0].sender?.email ?? '—' })
      continue
    }

    // Prefer the one with sender data; among those, pick the last (most recent)
    const withSender    = group.filter(c => c.sender?.email)
    const candidates    = withSender.length > 0 ? withSender : group
    const keeper        = candidates[candidates.length - 1]
    const keepId        = keeper.id ?? keeper._id
    toKeep.push({ id: keepId, subject, sender: keeper.sender?.email ?? '—' })

    for (const c of group) {
      const cid = c.id ?? c._id
      if (cid !== keepId) toDelete.push({ id: cid, subject, reason: 'duplicate' })
    }
  }

  console.log(`📋 Plan:`)
  console.log(`   Keep   : ${toKeep.length} campaigns`)
  toKeep.forEach(c => console.log(`     ✓ [sender:${c.sender}] ${c.subject}`))
  console.log(`   Delete : ${toDelete.length} campaigns`)
  toDelete.forEach(c => console.log(`     ✗ [${c.reason}] ${c.subject} (${c.id})`))

  if (toDelete.length === 0) {
    console.log('\n✅ Nothing to delete.')
    return
  }

  console.log('\n🗑️  Deleting duplicates...')
  let deleted = 0, failed = 0
  for (const c of toDelete) {
    const res = await mt('DELETE', `/campaigns/${c.id}`)
    if (res.ok) {
      deleted++
      console.log(`   ✓ Deleted: ${c.subject}`)
    } else {
      failed++
      console.log(`   ✗ Failed [${res.status}]: ${c.subject} — ${res.json?.message ?? ''}`)
    }
    await sleep(300)
  }

  console.log(`\n✅ Done: ${deleted} deleted, ${failed} failed.`)
  console.log(`   Remaining: ${toKeep.length} clean campaigns`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
