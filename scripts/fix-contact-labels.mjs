/**
 * Fix contact labels: contacts were created with lowercase label names
 * but Mailtarget stores them Title Case ("retail" → "Retail").
 *
 * Strategy:
 *  1. Fetch labels from API → build lowercase→exactName map
 *  2. Re-run FULL deterministic generator (exact same RNG state) → email→labels map
 *  3. Fetch all contacts from API
 *  4. PUT each with { email, labels } using correctly-cased names
 *
 * Run: node scripts/fix-contact-labels.mjs
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

// ── Exact copy of PRNG from seed-contacts.mjs ────────────────
let seed = 1337
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = arr => arr[Math.floor(rng() * arr.length)]
const weighted = pairs => {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v }
  return pairs[0][0]
}

// ── Exact copy of data pools from seed-contacts.mjs ──────────
const BASES = [
  ['deny.ervan', 'gmail.com'],
  ['deny.nullpointer', 'gmail.com'],
  ['deny', 'mtarget.co'],
  ['deny', 'mailtarget.co'],
]
const MALE   = ['Andi','Budi','Cahyo','Dimas','Eko','Fajar','Gilang','Hadi','Irfan','Joko','Krisna','Lukman','Made','Naufal','Oki','Putra','Rizki','Surya','Teguh','Wahyu','Yoga','Bayu','Dani','Hendra','Reza','Aditya','Bagas','Fahmi','Galih','Ivan']
const FEMALE = ['Ayu','Bunga','Citra','Dewi','Elok','Fitri','Gita','Hana','Indah','Jihan','Kirana','Lestari','Maya','Nadia','Oktavia','Putri','Rani','Sari','Tania','Wulan','Yuni','Anggun','Dinda','Farah','Intan','Kartika','Mega','Novita','Rina','Salsabila']
const LAST   = ['Wijaya','Santoso','Pratama','Nugroho','Halim','Saputra','Kusuma','Hartono','Permana','Lesmana','Gunawan','Setiawan','Wibowo','Hidayat','Maulana','Suryadi','Prabowo','Susanto','Firmansyah','Rahardjo','Tanuwijaya','Iskandar','Hakim','Anggraini','Puspita','Wardani','Handayani','Utami','Cahyani','Kusumawardhani']
const COMPANIES = ['PT Bank Central Asia','PT Astra International','PT Telkom Indonesia','PT Unilever Indonesia','PT Pertamina','PT Bank Mandiri','PT Indofood Sukses Makmur','PT Gudang Garam','PT Kalbe Farma','PT Bukit Asam','PT Adaro Energy','PT GoTo Gojek Tokopedia','PT Bank Rakyat Indonesia','PT Semen Indonesia','PT Sido Muncul','PT Mayora Indah','PT Wijaya Karya','PT Vale Indonesia','PT Tower Bersama','RS Siloam','Universitas Indonesia','Kementerian Keuangan','Wiraswasta','Profesional Independen','Dokter Praktik Mandiri','Kantor Notaris','Konsultan Pajak']
const CITIES = ['Jakarta','Surabaya','Bandung','Medan','Semarang','Makassar','Denpasar','Yogyakarta','Tangerang','Bekasi','Palembang','Balikpapan','Batam','Malang','Bogor']
const PRODUCTS = [
  { label: 'reksadana-saham',            short: 'rdsaham'  },
  { label: 'reksadana-pendapatan-tetap', short: 'rdpt'     },
  { label: 'reksadana-pasar-uang',       short: 'rdpu'     },
  { label: 'obligasi-sbn',               short: 'obligasi' },
  { label: 'saham',                      short: 'saham'    },
]
const PRODUCTS_BY_RISK = {
  konservatif: ['reksadana-pasar-uang', 'reksadana-pendapatan-tetap', 'obligasi-sbn'],
  moderat:     ['reksadana-pendapatan-tetap', 'reksadana-saham', 'obligasi-sbn'],
  agresif:     ['reksadana-saham', 'saham', 'reksadana-saham'],
}
const SHORT_BY_LABEL = Object.fromEntries(PRODUCTS.map(p => [p.label, p.short]))
const pad3 = n => String(n).padStart(3, '0')

// Exact replica of genContact — must consume identical RNG calls
function genContact(i) {
  const isFemale = rng() < 0.45
  const first    = isFemale ? pick(FEMALE) : pick(MALE)
  pick(LAST) // last name — consumed but not returned

  const tier = weighted([['retail', 60], ['priority', 30], ['private-wealth', 10]])
  const risk = tier === 'private-wealth'
    ? weighted([['agresif', 50], ['moderat', 40], ['konservatif', 10]])
    : tier === 'priority'
      ? weighted([['moderat', 50], ['agresif', 30], ['konservatif', 20]])
      : weighted([['konservatif', 45], ['moderat', 40], ['agresif', 15]])

  const pool    = PRODUCTS_BY_RISK[risk]
  const primary = pick(pool)
  const products = [primary]
  if (rng() < 0.4) {                   // this conditional rng() must always be consumed
    const second = pick(pool)
    if (second !== primary) products.push(second)
  }

  const lifecycle = weighted([['nasabah-aktif', 55], ['nasabah-baru', 20], ['nasabah-dormant', 25]])
  const labels    = [...new Set([...products, tier, risk, lifecycle])]

  const [local, domain] = BASES[i % BASES.length]
  const tag   = `${SHORT_BY_LABEL[primary]}${pad3(i + 1)}`
  const email = `${local}+${tag}@${domain}`

  // Consume remaining RNG calls exactly as genContact does (don't use values)
  rng() // aum
  pick(COMPANIES) // company — calls rng() once
  pick(CITIES)    // city — calls rng() once
  rng()  // birthYear
  rng()  // birthMonth
  rng()  // birthDay
  rng(); rng(); rng(); rng() // phone — 4 calls

  return { email, labels }
}

async function fetchAllContacts() {
  let all = [], page = 1
  while (true) {
    const r = await mt('GET', `/contacts?perPage=100&page=${page}`)
    if (!r.ok) { console.error('Failed to fetch contacts:', r.status); process.exit(1) }
    const items = r.json.data ?? []
    all.push(...items)
    if (items.length < 100) break
    page++
    await sleep(200)
  }
  return all
}

async function main() {
  // Step 1: build lowercase → exactName map from API labels
  console.log('1️⃣  Fetching labels from API...')
  const labelsRes = await mt('GET', '/labels?perPage=100')
  const apiLabels = labelsRes.json.data ?? []
  const nameMap   = {}
  for (const l of apiLabels) nameMap[l.name.toLowerCase()] = l.name
  console.log(`   ${apiLabels.length} labels. Map sample: retail→${nameMap['retail']}, nasabah-baru→${nameMap['nasabah-baru']}`)

  // Step 2: reconstruct email→labels from deterministic generator
  console.log('\n2️⃣  Reconstructing contact→label map (150 contacts)...')
  const expectedByEmail = {}
  for (let i = 0; i < 150; i++) {
    const { email, labels } = genContact(i)
    expectedByEmail[email.toLowerCase()] = labels.map(l => nameMap[l.toLowerCase()] ?? l)
  }
  console.log(`   Built map for ${Object.keys(expectedByEmail).length} emails`)
  // Sanity check — print first 3
  Object.entries(expectedByEmail).slice(0, 3).forEach(([e, l]) => console.log(`     ${e} → [${l.join(', ')}]`))

  // Step 3: fetch all contacts
  console.log('\n3️⃣  Fetching all contacts from API...')
  const contacts = await fetchAllContacts()
  console.log(`   Found ${contacts.length} contacts`)

  // Step 4: PUT update
  console.log('\n4️⃣  Updating contacts with correct labels...')
  let updated = 0, skipped = 0, notFound = 0, failed = 0
  for (const c of contacts) {
    const emailKey = (c.email ?? '').toLowerCase()
    const id       = c.id ?? c._id
    const expected = expectedByEmail[emailKey]

    if (!expected) { notFound++; continue }

    const currentSorted = (c.labels ?? []).map(l => l.toLowerCase()).sort().join(',')
    const expectedSorted = expected.map(l => l.toLowerCase()).sort().join(',')
    if (currentSorted === expectedSorted) { skipped++; continue }

    // Send email explicitly to satisfy PUT validation
    const res = await mt('PUT', `/contacts/${id}`, { email: c.email, labels: expected })
    if (res.ok) {
      updated++
      if (updated % 25 === 0) console.log(`   ...${updated} updated`)
    } else {
      failed++
      console.log(`   ✗ [${res.status}] ${c.email}: ${res.json?.message ?? JSON.stringify(res.json)}`)
    }
    await sleep(150)
  }

  console.log(`\n✅ Done:`)
  console.log(`   Updated  : ${updated}`)
  console.log(`   Skipped  : ${skipped} (already correct)`)
  console.log(`   Not found: ${notFound} (not in seed map, untouched)`)
  console.log(`   Failed   : ${failed}`)

  if (notFound > 50) {
    console.log('\n⚠️  High "not found" count — PRNG may still be drifting.')
    console.log('   Try running: node scripts/diagnose-labels.mjs to check actual label data.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
