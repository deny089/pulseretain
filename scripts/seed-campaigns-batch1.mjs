/**
 * Batch 1 of 4 — "Onboarding & Edukasi Nasabah Baru"
 * Creates 5 DRAFT email campaigns forming a coherent welcome/education drip
 * series for a fictional asset management firm (Mailtarget Asset Management).
 *
 * Run: node scripts/seed-campaigns-batch1.mjs
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
async function mtRetry(method, p, body, tries = 5) {
  let delay = 700
  for (let a = 1; a <= tries; a++) {
    const r = await mt(method, p, body)
    if (r.ok) return r
    const transient = r.status === 429 || (r.status >= 502 && r.status <= 504)
    if (!transient || a === tries) return r
    await sleep(delay); delay = Math.min(delay * 1.8, 6000)
  }
}

const SENDER = { name: 'Mailtarget Asset Management', email: 'deny+testapi@mailtarget.co' }
const FIRM = 'Mailtarget Asset Management'

// ── Email template (inline CSS, 600px, email-client safe) ────
const C = {
  ink: '#1f2937', muted: '#6b7280', line: '#e5e7eb',
  brand: '#0f3d3e', accent: '#1a6b5a', soft: '#eef3f1', bg: '#eceff0',
}
function button(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:8px;background:${C.accent};">
    <a href="${url}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${text}</a>
  </td></tr></table>`
}
function statCards(cards) {
  // cards: [{big, label}]
  const tds = cards.map(c => `<td width="33%" valign="top" style="padding:6px;">
    <div style="background:${C.soft};border-radius:10px;padding:16px 12px;text-align:center;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${C.brand};line-height:1.1;">${c.big}</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.muted};margin-top:6px;">${c.label}</div>
    </div></td>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;"><tr>${tds}</tr></table>`
}
function bullets(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;">` +
    items.map(it => `<tr><td valign="top" style="padding:5px 10px 5px 0;width:22px;">
      <div style="width:18px;height:18px;border-radius:50%;background:${C.soft};color:${C.accent};font-family:Arial;font-size:12px;font-weight:bold;text-align:center;line-height:18px;">✓</div></td>
      <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${C.ink};line-height:1.55;padding:4px 0;">${it}</td></tr>`).join('') +
    `</table>`
}

// NOTE: Mailtarget's compose endpoint rejects a full HTML document
// (<!DOCTYPE><html><head><body>) when the body has complex nested tables —
// it expects a BODY FRAGMENT and wraps it itself. So we emit only the content.
function email({ preheader, eyebrow, title, intro, bodyHtml, ctaText, ctaUrl }) {
  return `<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${C.line};">
    <!-- header -->
    <tr><td style="background:${C.brand};padding:20px 28px;">
      <table role="presentation" width="100%"><tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;letter-spacing:.3px;">${FIRM}</td>
        <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9fc2bb;">Berizin & Diawasi OJK</td>
      </tr></table>
    </td></tr>
    <!-- body -->
    <tr><td style="padding:32px 28px 8px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.5px;color:${C.accent};text-transform:uppercase;">${eyebrow}</div>
      <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:${C.ink};margin:10px 0 14px;">${title}</h1>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${C.ink};margin:0 0 14px;">${intro}</p>
      ${bodyHtml}
      ${button(ctaText, ctaUrl)}
    </td></tr>
    <!-- divider -->
    <tr><td style="padding:18px 28px 0;"><div style="border-top:1px solid ${C.line};"></div></td></tr>
    <!-- footer -->
    <tr><td style="padding:18px 28px 30px;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};margin:0 0 8px;">
        ${FIRM} · Menara Sentosa Lt. 21, Jl. Jenderal Sudirman Kav. 52, Jakarta 12190</p>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${C.muted};margin:0 0 10px;">
        Investasi mengandung risiko. Kinerja masa lalu bukan jaminan kinerja masa depan. Baca prospektus sebelum berinvestasi.</p>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.muted};margin:0;">
        Anda menerima email ini sebagai nasabah terdaftar. <a href="{{{unsubscribe}}}" style="color:${C.muted};text-decoration:underline;">Berhenti berlangganan</a></p>
    </td></tr>
  </table>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9aa3a0;margin-top:14px;">© 2026 ${FIRM}</div>
</td></tr></table>`
}

// ── Batch 1 campaigns ────────────────────────────────────────
const CAMPAIGNS = [
  {
    subject: 'Selamat Datang di Mailtarget Asset Management',
    labels: ['nasabah-baru'],
    html: email({
      preheader: 'Perjalanan investasi Anda dimulai hari ini — kenali langkah pertama bersama kami.',
      eyebrow: 'Panduan Nasabah Baru · 1 dari 5',
      title: 'Selamat datang di keluarga investor Mailtarget',
      intro: 'Terima kasih telah mempercayakan perjalanan investasi Anda kepada kami. Selama beberapa hari ke depan, kami akan memandu Anda langkah demi langkah agar siap berinvestasi dengan tenang dan percaya diri.',
      bodyHtml: bullets([
        'Akses portofolio Anda kapan saja melalui dashboard nasabah.',
        'Tim Relationship Manager siap membantu setiap pertanyaan Anda.',
        'Laporan kinerja transparan dikirim rutin setiap bulan.',
      ]),
      ctaText: 'Aktifkan Dashboard Saya',
      ctaUrl: 'https://nusantara-am.co.id/onboarding',
    }),
  },
  {
    subject: 'Kenali Profil Risiko Investasi Anda',
    labels: ['nasabah-baru'],
    html: email({
      preheader: 'Konservatif, moderat, atau agresif? Temukan strategi yang paling cocok untuk Anda.',
      eyebrow: 'Panduan Nasabah Baru · 2 dari 5',
      title: 'Profil risiko: fondasi keputusan investasi yang tepat',
      intro: 'Sebelum memilih produk, penting memahami seberapa besar fluktuasi yang nyaman bagi Anda. Profil risiko membantu kami merekomendasikan alokasi yang sesuai dengan tujuan dan ketenangan Anda.',
      bodyHtml: statCards([
        { big: 'Konservatif', label: 'Prioritas menjaga modal' },
        { big: 'Moderat', label: 'Seimbang risiko & imbal hasil' },
        { big: 'Agresif', label: 'Mengejar pertumbuhan maksimal' },
      ]),
      ctaText: 'Isi Kuesioner Profil Risiko',
      ctaUrl: 'https://nusantara-am.co.id/risk-profile',
    }),
  },
  {
    subject: 'Reksa Dana 101: Panduan Singkat untuk Pemula',
    labels: ['nasabah-baru', 'retail'],
    html: email({
      preheader: 'Pasar uang, pendapatan tetap, atau saham? Pahami perbedaannya dalam 3 menit.',
      eyebrow: 'Edukasi · 3 dari 5',
      title: 'Mengenal jenis-jenis reksa dana',
      intro: 'Reksa dana adalah cara mudah memulai investasi dengan modal terjangkau dan dikelola oleh manajer investasi profesional. Berikut tiga jenis yang paling umum:',
      bodyHtml: bullets([
        '<b>Reksa Dana Pasar Uang</b> — paling stabil, cocok untuk dana darurat dan tujuan jangka pendek.',
        '<b>Reksa Dana Pendapatan Tetap</b> — imbal hasil lebih tinggi dari deposito, risiko moderat.',
        '<b>Reksa Dana Saham</b> — potensi pertumbuhan tertinggi untuk tujuan jangka panjang.',
      ]),
      ctaText: 'Pelajari Lebih Lanjut',
      ctaUrl: 'https://nusantara-am.co.id/edukasi/reksa-dana',
    }),
  },
  {
    subject: '3 Langkah Memulai Investasi Pertama Anda',
    labels: ['nasabah-baru'],
    html: email({
      preheader: 'Mulai dari Rp 100.000. Sederhana, transparan, dan bisa otomatis setiap bulan.',
      eyebrow: 'Panduan Nasabah Baru · 4 dari 5',
      title: 'Investasi pertama Anda hanya tiga langkah lagi',
      intro: 'Anda tidak perlu modal besar untuk memulai. Dengan investasi berkala otomatis, Anda membangun kebiasaan finansial yang sehat tanpa repot.',
      bodyHtml: statCards([
        { big: '1', label: 'Pilih produk sesuai profil' },
        { big: '2', label: 'Tentukan nominal rutin' },
        { big: '3', label: 'Aktifkan auto-debit bulanan' },
      ]),
      ctaText: 'Mulai Investasi Sekarang',
      ctaUrl: 'https://nusantara-am.co.id/mulai',
    }),
  },
  {
    subject: 'Kunci Disiplin Investasi Jangka Panjang',
    labels: ['nasabah-aktif', 'retail'],
    html: email({
      preheader: 'Konsistensi mengalahkan timing. Inilah kebiasaan investor yang berhasil.',
      eyebrow: 'Edukasi · 5 dari 5',
      title: 'Disiplin, bukan keberuntungan, yang membangun kekayaan',
      intro: 'Investor paling sukses bukanlah yang menebak pasar dengan sempurna, melainkan yang konsisten. Strategi rata-rata biaya (dollar-cost averaging) membantu Anda tetap tenang di tengah naik-turunnya pasar.',
      bodyHtml: bullets([
        'Investasi rutin meredam dampak volatilitas jangka pendek.',
        'Hindari keputusan emosional saat pasar bergejolak.',
        'Tinjau portofolio secara berkala, bukan setiap hari.',
      ]),
      ctaText: 'Lihat Portofolio Saya',
      ctaUrl: 'https://nusantara-am.co.id/portfolio',
    }),
  },
]

async function main() {
  console.log(`→ Batch 1: Onboarding & Edukasi Nasabah Baru (${CAMPAIGNS.length} campaigns)`)
  console.log(`  Sender: ${SENDER.name} <${SENDER.email}>\n`)
  let ok = 0
  for (const c of CAMPAIGNS) {
    const payload = {
      subject: c.subject,
      sender: SENDER,
      htmlContent: c.html,
      recipients: { labels: c.labels },
      type: 'ONE_TIME',       // required — without type/startType the API rejects
      startType: 'IMMEDIATE', // the compose/email entity ("compose field" error)
    }
    const res = await mtRetry('POST', '/campaigns', payload)
    if (res.ok) {
      ok++
      const d = res.json.data ?? res.json
      console.log(`  ✓ [${d.stage ?? '?'}] ${c.subject}`)
      console.log(`      id=${d.id ?? d._id}  → labels: ${c.labels.join(', ')}`)
    } else {
      console.log(`  ✗ ${c.subject} [${res.status}] ${res.json?.message ?? res.json?.error ?? ''}`)
    }
    await sleep(400)
  }
  console.log(`\n✓ Batch 1 done: ${ok}/${CAMPAIGNS.length} draft campaigns created.`)
}
export { CAMPAIGNS, SENDER, mtRetry, BASE_URL, API_KEY }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1) })
}
