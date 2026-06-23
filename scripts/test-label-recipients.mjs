/**
 * Test whether Mailtarget can resolve contacts from labels
 * (i.e. will a campaign sent to label X actually reach anyone?)
 *
 * Run: node scripts/test-label-recipients.mjs
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

async function mt(method, p, body) {
  const res = await fetch(`${BASE_URL}${p}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

const TESTS = [
  { desc: 'labels array (Title Case)',   body: { labels: ['Retail'] } },
  { desc: 'labels array (lowercase)',    body: { labels: ['retail'] } },
  { desc: 'label string (Title Case)',   body: { label: 'Retail' } },
  { desc: 'label string (lowercase)',    body: { label: 'retail' } },
  { desc: 'segments array',             body: { segments: ['Retail'] } },
  { desc: 'no filter (total)',           body: {} },
]

async function main() {
  console.log('🔍 Testing POST /contacts/count with various label filters:\n')
  for (const t of TESTS) {
    const r = await mt('POST', '/contacts/count', t.body)
    const count = r.json.data?.count ?? r.json.count ?? r.json.data ?? JSON.stringify(r.json)
    console.log(`  [${r.status}] ${t.desc.padEnd(35)} → count: ${count}`)
  }

  console.log('\n🔍 Testing GET /contacts with label filter params:\n')
  const paramTests = [
    '/contacts?perPage=5&label=Retail',
    '/contacts?perPage=5&labels=Retail',
    '/contacts?perPage=5&segment=Retail',
  ]
  for (const p of paramTests) {
    const r = await mt('GET', p)
    const total = r.json.meta?.total ?? '?'
    const count = (r.json.data ?? []).length
    console.log(`  [${r.status}] GET ${p.padEnd(45)} → returned: ${count}, meta.total: ${total}`)
  }

  // Check campaign recipients endpoint for a real campaign
  console.log('\n🔍 Checking campaign recipients for Batch 1 campaigns:\n')
  const campaigns = await mt('GET', '/campaigns?perPage=10')
  const list = campaigns.json.data ?? []
  for (const c of list.slice(0, 3)) {
    const id = c.id ?? c._id
    const recRes = await mt('GET', `/campaigns/${id}/recipients?perPage=5`)
    const total = recRes.json.meta?.total ?? recRes.json.data?.length ?? '?'
    console.log(`  Campaign: "${c.subject?.slice(0,40)}"`)
    console.log(`    Labels: ${JSON.stringify(c.recipients?.labels ?? [])}`)
    console.log(`    Recipients resolved: ${total}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
