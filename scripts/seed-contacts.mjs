/**
 * One-off seed script — populates the Mailtarget account with ~150 realistic
 * contacts for an ASSET MANAGEMENT (wealth management) use case.
 *
 * - Uses Gmail-style "+tag" sub-addressing on 4 base inboxes so every address is
 *   unique & deliverable to a real inbox for testing.
 * - Generates coherent profiles: tier → risk profile → product holdings line up
 *   the way they would for a real wealth client (so the retention demo is believable).
 * - Creates segmentation labels first, then tags each contact.
 *
 * Run:  node scripts/seed-contacts.mjs
 * Reads MAILTARGET_BASE_URL + MAILTARGET_API_KEY from .env.local.
 */
import fs from 'fs'
import path from 'path'

// ── Load .env.local ──────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const BASE_URL = env.MAILTARGET_BASE_URL
const API_KEY  = env.MAILTARGET_API_KEY
if (!BASE_URL || !API_KEY) {
  console.error('Missing MAILTARGET_BASE_URL or MAILTARGET_API_KEY in .env.local')
  process.exit(1)
}

async function mt(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Retry transient gateway errors (502/503/504/429). A 4xx is treated as
// terminal — for /contacts that almost always means the email already exists,
// which is exactly what we want to skip on a re-run.
async function mtRetry(method, path, body, tries = 5) {
  let delay = 700
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await mt(method, path, body)
    if (res.ok) return res
    const transient = res.status === 429 || (res.status >= 502 && res.status <= 504) || res.status === 0
    if (!transient || attempt === tries) return res
    await sleep(delay)
    delay = Math.min(delay * 1.8, 6000)
  }
}

// ── Deterministic-ish PRNG so re-runs are reproducible ───────
let seed = 1337
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = arr => arr[Math.floor(rng() * arr.length)]
const weighted = pairs => {           // [[value, weight], ...]
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v }
  return pairs[0][0]
}

// ── Data pools ───────────────────────────────────────────────
const BASES = [
  ['deny.ervan', 'gmail.com'],
  ['deny.nullpointer', 'gmail.com'],
  ['deny', 'mtarget.co'],
  ['deny', 'mailtarget.co'],
]

const MALE = ['Andi','Budi','Cahyo','Dimas','Eko','Fajar','Gilang','Hadi','Irfan','Joko','Krisna','Lukman','Made','Naufal','Oki','Putra','Rizki','Surya','Teguh','Wahyu','Yoga','Bayu','Dani','Hendra','Reza','Aditya','Bagas','Fahmi','Galih','Ivan']
const FEMALE = ['Ayu','Bunga','Citra','Dewi','Elok','Fitri','Gita','Hana','Indah','Jihan','Kirana','Lestari','Maya','Nadia','Oktavia','Putri','Rani','Sari','Tania','Wulan','Yuni','Anggun','Dinda','Farah','Intan','Kartika','Mega','Novita','Rina','Salsabila']
const LAST = ['Wijaya','Santoso','Pratama','Nugroho','Halim','Saputra','Kusuma','Hartono','Permana','Lesmana','Gunawan','Setiawan','Wibowo','Hidayat','Maulana','Suryadi','Prabowo','Susanto','Firmansyah','Rahardjo','Tanuwijaya','Iskandar','Hakim','Anggraini','Puspita','Wardani','Handayani','Utami','Cahyani','Kusumawardhani']

const COMPANIES = [
  'PT Bank Central Asia','PT Astra International','PT Telkom Indonesia','PT Unilever Indonesia',
  'PT Pertamina','PT Bank Mandiri','PT Indofood Sukses Makmur','PT Gudang Garam','PT Kalbe Farma',
  'PT Bukit Asam','PT Adaro Energy','PT GoTo Gojek Tokopedia','PT Bank Rakyat Indonesia',
  'PT Semen Indonesia','PT Sido Muncul','PT Mayora Indah','PT Wijaya Karya','PT Vale Indonesia',
  'PT Tower Bersama','RS Siloam','Universitas Indonesia','Kementerian Keuangan',
  'Wiraswasta','Profesional Independen','Dokter Praktik Mandiri','Kantor Notaris','Konsultan Pajak',
]
const CITIES = ['Jakarta','Surabaya','Bandung','Medan','Semarang','Makassar','Denpasar','Yogyakarta','Tangerang','Bekasi','Palembang','Balikpapan','Batam','Malang','Bogor']

// ── Segmentation labels (asset management) ───────────────────
const PRODUCTS = [
  { label: 'reksadana-saham',            short: 'rdsaham'  },
  { label: 'reksadana-pendapatan-tetap', short: 'rdpt'     },
  { label: 'reksadana-pasar-uang',       short: 'rdpu'     },
  { label: 'obligasi-sbn',               short: 'obligasi' },
  { label: 'saham',                      short: 'saham'    },
]
const TIERS = ['retail', 'priority', 'private-wealth']
const RISKS = ['konservatif', 'moderat', 'agresif']
const LIFECYCLE = ['nasabah-baru', 'nasabah-aktif', 'nasabah-dormant']

const ALL_LABELS = [
  ...PRODUCTS.map(p => p.label),
  ...TIERS, ...RISKS, ...LIFECYCLE,
]

// Coherent product mix by risk profile (so holdings match the client's risk).
const PRODUCTS_BY_RISK = {
  konservatif: ['reksadana-pasar-uang', 'reksadana-pendapatan-tetap', 'obligasi-sbn'],
  moderat:     ['reksadana-pendapatan-tetap', 'reksadana-saham', 'obligasi-sbn'],
  agresif:     ['reksadana-saham', 'saham', 'reksadana-saham'],
}
const SHORT_BY_LABEL = Object.fromEntries(PRODUCTS.map(p => [p.label, p.short]))

function pad3(n) { return String(n).padStart(3, '0') }

function genContact(i) {
  const isFemale = rng() < 0.45
  const first = isFemale ? pick(FEMALE) : pick(MALE)
  const last  = pick(LAST)

  // tier → risk are correlated; private-wealth skews aggressive, retail conservative
  const tier = weighted([['retail', 60], ['priority', 30], ['private-wealth', 10]])
  const risk = tier === 'private-wealth'
    ? weighted([['agresif', 50], ['moderat', 40], ['konservatif', 10]])
    : tier === 'priority'
      ? weighted([['moderat', 50], ['agresif', 30], ['konservatif', 20]])
      : weighted([['konservatif', 45], ['moderat', 40], ['agresif', 15]])

  // 1–2 products consistent with the risk profile
  const pool = PRODUCTS_BY_RISK[risk]
  const primary = pick(pool)
  const products = [primary]
  if (rng() < 0.4) {
    const second = pick(pool)
    if (second !== primary) products.push(second)
  }

  const lifecycle = weighted([['nasabah-aktif', 55], ['nasabah-baru', 20], ['nasabah-dormant', 25]])

  const labels = [...new Set([...products, tier, risk, lifecycle])]

  // unique deliverable alias
  const [local, domain] = BASES[i % BASES.length]
  const tag = `${SHORT_BY_LABEL[primary]}${pad3(i + 1)}`
  const email = `${local}+${tag}@${domain}`

  // AUM band by tier (for the note — adds realism)
  const aum = tier === 'private-wealth'
    ? `Rp ${(2 + Math.floor(rng() * 48))} miliar`
    : tier === 'priority'
      ? `Rp ${(200 + Math.floor(rng() * 1800))} juta`
      : `Rp ${(10 + Math.floor(rng() * 190))} juta`

  const company = pick(COMPANIES)
  const city = pick(CITIES)
  const birthYear = 1962 + Math.floor(rng() * 39)         // 1962–2000
  const birthMonth = pad3(1 + Math.floor(rng() * 12)).slice(1)
  const birthDay = pad3(1 + Math.floor(rng() * 28)).slice(1)
  const phone = `+628${Math.floor(rng() * 9) + 1}${pad3(Math.floor(rng() * 1000))}${pad3(Math.floor(rng() * 1000))}${Math.floor(rng() * 10)}`

  return {
    email,
    firstname: first,
    lastname: last,
    name: `${first} ${last}`,
    phone,
    labels,
    company,
    city,
    country: 'Indonesia',
    gender: isFemale ? 'female' : 'male',
    birthDate: `${birthYear}-${birthMonth}-${birthDay}T00:00:00Z`,
    note: `Segmen ${tier} · profil ${risk} · AUM ${aum} · status ${lifecycle.replace('nasabah-', '')}`,
  }
}

// ── Concurrency helper ───────────────────────────────────────
async function pool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ── Run ──────────────────────────────────────────────────────
async function main() {
  console.log(`→ Target: ${BASE_URL}`)

  // 1. Create labels (ignore "already exists" errors)
  console.log(`\n[1/2] Creating ${ALL_LABELS.length} segmentation labels…`)
  let labelsCreated = 0, labelsSkipped = 0
  for (const name of ALL_LABELS) {
    const { ok } = await mt('POST', '/labels', { name })
    if (ok) { labelsCreated++; process.stdout.write(`  + ${name}\n`) }
    else    { labelsSkipped++; process.stdout.write(`  · ${name} (exists/skip)\n`) }
  }
  console.log(`  Labels: ${labelsCreated} created, ${labelsSkipped} skipped`)

  // 2. Generate + create 150 contacts
  const N = 150
  const contacts = Array.from({ length: N }, (_, i) => genContact(i))
  console.log(`\n[2/2] Creating ${N} contacts (concurrency 6)…`)

  let ok = 0, skip = 0, fail = 0
  const failures = []
  await pool(contacts, 3, async (c) => {
    const res = await mtRetry('POST', '/contacts', c)
    if (res.ok) {
      ok++
      if (ok % 25 === 0) console.log(`  …${ok} created`)
    } else if (res.status >= 400 && res.status < 500) {
      skip++  // already exists / duplicate — expected on re-run
    } else {
      fail++
      failures.push({ email: c.email, status: res.status, msg: res.json?.message ?? res.json?.error })
    }
  })

  console.log(`\n✓ Done. Contacts: ${ok} created, ${skip} skipped (already exist), ${fail} failed.`)
  if (failures.length) {
    console.log('\nRemaining failures (transient — re-run to retry):')
    failures.slice(0, 10).forEach(f => console.log(`  ✗ ${f.email} [${f.status}] ${f.msg ?? ''}`))
  }

  // Quick distribution summary
  const dist = {}
  for (const c of contacts) for (const l of c.labels) dist[l] = (dist[l] ?? 0) + 1
  console.log('\nLabel distribution:')
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([l, n]) => console.log(`  ${String(n).padStart(3)}  ${l}`))
}

main().catch(e => { console.error(e); process.exit(1) })
