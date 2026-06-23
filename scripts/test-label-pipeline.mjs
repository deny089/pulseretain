/**
 * End-to-end test: create contact → assign label → verify contactCount → verify campaign recipients
 * Run: node scripts/test-label-pipeline.mjs
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
const SENDER   = { name: 'Mailtarget Asset Management', email: 'deny+testapi@mailtarget.co' }
const TEST_LABEL = 'pipeline-test-label'
const TEST_EMAIL = 'deny+pipelinetest001@mailtarget.co'

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function mt(method, p, body) {
  const res = await fetch(`${BASE_URL}${p}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  console.log('=== End-to-end label pipeline test ===\n')

  // 1. Create test label
  console.log(`1. Creating label "${TEST_LABEL}"...`)
  const lRes = await mt('POST', '/labels', { name: TEST_LABEL })
  if (lRes.ok) console.log(`   ✓ Created. id=${lRes.json.data?._id}`)
  else console.log(`   · Already exists or error [${lRes.status}]: ${lRes.json?.message}`)

  // 2. Check label contactCount before
  console.log(`\n2. Label contactCount BEFORE contact creation:`)
  const labelsBefore = await mt('GET', '/labels?perPage=100')
  const testLabelBefore = (labelsBefore.json.data ?? []).find(l => l.name.toLowerCase() === TEST_LABEL.toLowerCase())
  console.log(`   ${TEST_LABEL}: contactCount=${testLabelBefore?.contactCount ?? 'not found'} (name in API: "${testLabelBefore?.name}")`)

  // 3. Create test contact WITH the label (use the exact name from API response)
  const exactLabelName = testLabelBefore?.name ?? TEST_LABEL
  console.log(`\n3. Creating contact with label "${exactLabelName}"...`)
  const cRes = await mt('POST', '/contacts', {
    email: TEST_EMAIL,
    firstname: 'Pipeline',
    lastname: 'Test',
    name: 'Pipeline Test',
    labels: [exactLabelName],
  })
  const contactId = cRes.json.data?.id ?? cRes.json.data?._id ?? cRes.json?.id
  if (cRes.ok) console.log(`   ✓ Created. id=${contactId}`)
  else console.log(`   · Error [${cRes.status}]: ${cRes.json?.message}`)

  await sleep(1000)

  // 4. Check label contactCount AFTER
  console.log(`\n4. Label contactCount AFTER contact creation (wait 1s):`)
  const labelsAfter = await mt('GET', '/labels?perPage=100')
  const testLabelAfter = (labelsAfter.json.data ?? []).find(l => l.name.toLowerCase() === TEST_LABEL.toLowerCase())
  console.log(`   ${TEST_LABEL}: contactCount=${testLabelAfter?.contactCount ?? 'not found'}`)

  // 5. Fetch contact back — does it have the label?
  if (contactId) {
    console.log(`\n5. Fetching contact back to verify labels field:`)
    const cFetch = await mt('GET', `/contacts/${contactId}`)
    console.log(`   labels: ${JSON.stringify(cFetch.json.data?.labels ?? cFetch.json?.labels ?? 'N/A')}`)
  }

  // 6. Create test campaign targeting this label
  console.log(`\n6. Creating test campaign targeting "${exactLabelName}"...`)
  const campRes = await mt('POST', '/campaigns', {
    subject: `[Pipeline Test] ${Date.now()}`,
    sender: SENDER,
    htmlContent: `<p>Pipeline test</p><a href="{{{unsubscribe}}}">Unsubscribe</a>`,
    recipients: { labels: [exactLabelName] },
    type: 'ONE_TIME',
    startType: 'IMMEDIATE',
  })
  const campId = campRes.json.data?.id ?? campRes.json.data?._id
  if (campRes.ok) {
    const memberCount = campRes.json.data?.memberCount ?? campRes.json?.memberCount
    console.log(`   ✓ Campaign created. id=${campId}  memberCount=${memberCount}`)
  } else {
    console.log(`   ✗ Error [${campRes.status}]: ${campRes.json?.message}`)
  }

  // 7. Check campaign recipients
  if (campId) {
    await sleep(500)
    console.log(`\n7. Campaign recipients:`)
    const recRes = await mt('GET', `/campaigns/${campId}/recipients?perPage=5`)
    console.log(`   Status: ${recRes.status}`)
    console.log(`   meta.total: ${recRes.json.meta?.total ?? 'N/A'}`)
    console.log(`   data count: ${(recRes.json.data ?? []).length}`)
    if ((recRes.json.data ?? []).length > 0) {
      console.log(`   First recipient: ${JSON.stringify(recRes.json.data[0]?.email ?? recRes.json.data[0])}`)
    }
    // Clean up campaign
    await mt('DELETE', `/campaigns/${campId}`)
    console.log(`   (test campaign deleted)`)
  }

  // 8. Clean up — delete test contact and label
  console.log(`\n8. Cleanup...`)
  if (contactId) {
    const del = await mt('DELETE', `/contacts/${contactId}`)
    console.log(`   Contact deleted: ${del.ok}`)
  }
  const delLabel = await mt('DELETE', `/labels/${encodeURIComponent(TEST_LABEL)}`)
  console.log(`   Label deleted: ${delLabel.ok}`)

  console.log('\n=== VERDICT ===')
  const countAfter = testLabelAfter?.contactCount ?? 0
  if (countAfter > 0) {
    console.log('✅ contactCount updates correctly when creating contact via POST with label.')
    console.log('   Root cause: existing contacts were created with WRONG label names (case mismatch).')
    console.log('   Fix: delete + re-seed contacts with correct label names.')
  } else {
    console.log('⚠️  contactCount stayed 0 even after creating contact with label.')
    console.log('   contactCount is broken/cached on Mailtarget side.')
    console.log('   Need to test whether campaign ACTUALLY resolves recipients despite count=0.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
