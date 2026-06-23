/**
 * Setup & verify senders in Mailtarget before running campaign batches
 * Run: node scripts/setup-senders.mjs
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
const API_KEY = env.MAILTARGET_API_KEY

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
  console.log('📧 Setting up Mailtarget Senders...\n')

  // List existing senders
  console.log('1️⃣  Checking existing senders...')
  const listRes = await mt('GET', '/domain/senders')
  if (!listRes.ok) {
    console.log(`  ✗ Failed to list senders [${listRes.status}] ${listRes.json?.message ?? ''}`)
    process.exit(1)
  }

  const senders = listRes.json.data ?? []
  console.log(`  ✓ Found ${senders.length} sender(s)`)
  senders.forEach(s => {
    console.log(`     • ${s.email} (${s.status ?? 'unknown'})`)
  })

  // Check if our sender exists
  const targetSender = 'deny+testapi@mailtarget.co'
  const existing = senders.find(s => s.email === targetSender)

  if (existing) {
    console.log(`\n2️⃣  Sender "${targetSender}" already exists`)
    console.log(`  ✓ ID: ${existing.id}`)
    console.log(`     Status: ${existing.status ?? 'pending'}`)
    console.log(`     Permitted: ${existing.permitted ?? false}`)
    console.log(`     Verified: ${existing.verified ?? false}`)

    // Check domain verification status
    console.log(`\n3️⃣  Checking domain verification status...`)
    const domainRes = await mt('POST', '/domain/senders/check-domain', { email: targetSender })
    if (domainRes.ok) {
      const domainStatus = domainRes.json.data ?? domainRes.json
      console.log(`  ✓ Domain check:`)
      console.log(`     SPF: ${domainStatus.spf ?? false}`)
      console.log(`     DKIM: ${domainStatus.dkim ?? false}`)
      console.log(`     DMARC: ${domainStatus.dmarc ?? false}`)
      console.log(`     Permitted: ${domainStatus.permitted ?? false}`)
    } else {
      console.log(`  ℹ️  Could not check domain (may be pending verification)`)
    }
  } else {
    console.log(`\n2️⃣  Creating sender "${targetSender}"...`)
    const createRes = await mt('POST', '/domain/senders', {
      email: targetSender,
      name: 'Mailtarget Asset Management',
    })

    if (createRes.ok) {
      const created = createRes.json.data ?? createRes.json
      console.log(`  ✓ Sender created`)
      console.log(`     ID: ${created.id}`)
      console.log(`     Status: ${created.status ?? 'pending'}`)
      console.log(`     Permitted: ${created.permitted ?? false}`)
    } else {
      console.log(`  ✗ Failed to create sender [${createRes.status}]`)
      console.log(`     ${createRes.json?.message ?? createRes.json?.error ?? ''}`)
    }
  }

  console.log(`\n⚠️  NOTE: If sender shows "permitted: false", you may need to:`)
  console.log(`   1. Verify the domain (SPF/DKIM/DMARC records)`)
  console.log(`   2. Manually permit the sender in Mailtarget Settings → Senders`)
  console.log(`   3. Or use a pre-verified sender email\n`)
  console.log(`✅ Sender setup complete!`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
