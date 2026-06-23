/**
 * Diagnose label-contact association.
 * 1. Fetch labels → show contactCount
 * 2. Fetch a sample of contacts → show their labels field
 * 3. Show mismatch: labels with count=0 but contacts that reference them
 *
 * Run: node scripts/diagnose-labels.mjs
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

async function main() {
  // 1. Fetch all labels
  console.log('1️⃣  Labels (contactCount from API):')
  const labelsRes = await mt('GET', '/labels?perPage=100')
  const labels = labelsRes.json.data ?? []
  const labelCount = {}
  for (const l of labels) {
    labelCount[l.name ?? l._id] = l.contactCount ?? 0
    console.log(`   ${String(l.contactCount ?? 0).padStart(3)}  ${l.name}  (id: ${l._id})`)
  }

  // 2. Fetch first page of contacts and inspect their labels field
  console.log('\n2️⃣  Sample contacts (first 5) — labels field from API:')
  const contactsRes = await mt('GET', '/contacts?perPage=5&page=1')
  const contacts = contactsRes.json.data ?? []
  const actualLabelCount = {}
  for (const c of contacts) {
    const lbls = c.labels ?? []
    console.log(`   ${c.email}`)
    console.log(`     labels: [${lbls.join(', ') || 'EMPTY'}]`)
    for (const l of lbls) actualLabelCount[l] = (actualLabelCount[l] ?? 0) + 1
  }

  // 3. Count labels across all contacts (fetch up to 500)
  console.log('\n3️⃣  Counting labels across all contacts (up to 500)...')
  const allLabelCount = {}
  let page = 1, total = 0
  while (true) {
    const r = await mt('GET', `/contacts?perPage=100&page=${page}`)
    const items = r.json.data ?? []
    if (items.length === 0) break
    for (const c of items) {
      for (const l of (c.labels ?? [])) {
        allLabelCount[l] = (allLabelCount[l] ?? 0) + 1
      }
      total++
    }
    if (items.length < 100) break
    page++
    await sleep(200)
  }
  console.log(`   Checked ${total} contacts`)

  if (Object.keys(allLabelCount).length === 0) {
    console.log('\n⚠️  NO contacts have any labels assigned!')
    console.log('   Root cause: contacts were likely created before labels existed,')
    console.log('   or the labels field was silently ignored on contact creation.')
    console.log('\n   Fix: run node scripts/fix-contact-labels.mjs')
  } else {
    console.log('\n   Label counts from contact records:')
    Object.entries(allLabelCount).sort((a,b) => b[1]-a[1]).forEach(([l, n]) => {
      const apiCount = labelCount[l] ?? '?'
      const match = apiCount == n ? '✓' : '✗ API says ' + apiCount
      console.log(`   ${String(n).padStart(3)}  ${l}  ${match}`)
    })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
