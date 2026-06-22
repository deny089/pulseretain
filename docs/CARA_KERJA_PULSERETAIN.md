# PulseRetain — Cara Kerja, Input, Analisis & Output

> Dokumen ini menjelaskan **bagaimana PulseRetain bekerja end-to-end**: data apa yang masuk, bagaimana dianalisis, dan apa yang dihasilkan. Ditulis sebagai knowledge base — bisa dipakai untuk konteks percakapan lain, atau jadi bahan utama pitch deck.
>
> Semua angka dan logika di dokumen ini diambil langsung dari implementasi kode (bukan estimasi). Terakhir diperbarui: **2026-06-23**.

---

## 1. Apa Itu PulseRetain (1 Kalimat)

**PulseRetain adalah engine retensi yang mendeteksi pelanggan yang akan berhenti (churn) berdasarkan perilaku email mereka, lalu otomatis menyusun email penyelamat berbasis AI — dengan loop umpan balik yang mengukur apakah strategi itu berhasil.**

Fokus tunggal: **mempertahankan pelanggan yang sudah ada.** Bukan akuisisi, bukan upsell. Itu batasan scope yang disengaja.

---

## 2. Masalah yang Diselesaikan

Di industri BFSI / SaaS / e-commerce, **biaya mempertahankan pelanggan jauh lebih murah daripada mengakuisisi yang baru.** Tapi masalahnya:

1. **Churn itu diam-diam.** Pelanggan tidak mengumumkan mereka akan pergi — mereka cuma berhenti membuka email, berhenti berinteraksi.
2. **Tim marketing tidak punya sinyal objektif** untuk tahu *siapa* yang berisiko dan *kapan* harus bertindak.
3. **Saran retensi sering generik** ("kirim diskon") dan tidak nyambung dengan konteks bisnis spesifik perusahaan.
4. **Tidak ada loop pembuktian** — kampanye dikirim, lalu tidak ada yang mengukur apakah orang yang berisiko benar-benar kembali aktif.

PulseRetain menjawab keempatnya dalam satu alur tertutup (closed loop).

---

## 3. Cara Kerja — Gambaran Besar (Closed Loop)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  [1] KNOWLEDGE              [2] BEHAVIORAL DATA                        │
│  URL crawl + PDF upload     Mailtarget (engagement email)             │
│       │                          │                                    │
│       ▼                          ▼                                    │
│  Embed → pgvector           Churn Scoring (algoritma)                 │
│  (WHAT/WHY — angle)         (WHO — audience)                          │
│       │                          │                                    │
│       └──────────┬───────────────┘                                    │
│                  ▼                                                     │
│         [3] RAG + AI INSIGHT                                           │
│         Gemini menggabungkan "siapa yang berisiko" +                  │
│         "strategi apa yang relevan dari knowledge base"               │
│                  │                                                     │
│                  ▼                                                     │
│         [4] COMPOSE — email penyelamat (DRAFT)                         │
│         + buat sublabel `at-risk-{label}` + tag kontak                │
│                  │                                                     │
│                  ▼                                                     │
│         [5] MANUSIA REVIEW & KIRIM (tidak pernah otomatis)            │
│                  │                                                     │
│                  ▼                                                     │
│         [6] FEEDBACK — re-score, ukur "X dari Y kembali aktif"        │
│                  │                                                     │
│                  └──────────► tersimpan ke HISTORY ───────────────────┘
│                                (tren antar waktu)                      │
└───────────────────────────────────────────────────────────────────────┘
```

**Dua sinyal yang bertemu:** perilaku menentukan **SIAPA** (audience), knowledge base menentukan **APA/MENGAPA** (angle). Keduanya bertemu di email yang disusun.

---

## 4. INPUT DATA

### 4.1 Data Perilaku (dari Mailtarget Open API)

Sumber kebenaran utama. Untuk setiap pasangan (kontak, kampanye), PulseRetain membaca:

| Field | Arti | Dipakai untuk |
|---|---|---|
| `email` | Identitas unik kontak | Key agregasi (lowercase) |
| `firstname`, `lastname`, `name` | Nama | Personalisasi |
| `contactId` | ID Mailtarget | Tagging label nanti |
| `visitCount` | Berapa kali buka/klik email | Hitung "opened campaign" |
| `bouncedAt` | Timestamp bounce | Sinyal email mati/invalid |
| `lastVisited` | Aktivitas terakhir | Hitung "hari sejak aktif" |
| `labels` | Segment kontak | Filter audience |

> **Penting:** PulseRetain **tidak butuh data finansial nasabah.** Sinyal churn 100% berasal dari proxy engagement email — satu-satunya data nyata yang tersedia dari Mailtarget. Ini keputusan arsitektur yang disengaja dan aman untuk compliance BFSI.

Data diambil dari **5 kampanye selesai (FINISH) terbaru**, dipaginasi (200/halaman, maks 2000 penerima/kampanye), lalu di-rollup per kontak.

### 4.2 Knowledge Sources (dikonfigurasi user)

Bahan untuk "angle" strategi. Dua tipe:

| Tipe | Cara masuk | Pemrosesan |
|---|---|---|
| **URL** | User paste link | Crawl + ekstraksi teks ala-readability |
| **PDF** | User upload file | Parse via `pdf-parse` |

Setiap dokumen → dipecah jadi **chunk 600 karakter (overlap 100)** → di-embed jadi vektor **768 dimensi** (`gemini-embedding-001`) → disimpan di **pgvector (Neon Postgres)** dengan index HNSW cosine.

---

## 5. ANALISIS

### 5.1 Agregasi Engagement (per kontak)

Karena satu kontak muncul di banyak kampanye, datanya digabung:

```
totalCampaigns   = jumlah kampanye yang kontak ini ikut
openedCampaigns  = jumlah kampanye dengan visitCount > 0
bounced          = true jika pernah bounce sekali saja
lastActivityTs   = timestamp aktivitas terbaru
openRate         = openedCampaigns / totalCampaigns
```

### 5.2 Algoritma Churn Score (transparan, bukan black box)

Setiap kontak mulai dari **skor dasar 50**, lalu disesuaikan berdasarkan sinyal nyata:

| Sinyal | Penyesuaian Skor |
|---|---|
| **Pernah bounce** | **+35** (sinyal terkuat — email bermasalah) |
| Tidak pernah buka satu pun (`openedCampaigns = 0`) | +25 |
| Open rate rendah (< 20%) | +15 |
| Open rate tinggi (> 60%) | **−20** (sehat) |
| Tidak ada aktivitas tercatat sama sekali | +25 |
| Tidak aktif > 180 hari | +30 (kritis) |
| Tidak aktif > 60 hari | +20 |
| Tidak aktif > 30 hari | +10 |
| Aktif < 7 hari terakhir | **−25** (sangat sehat) |

Skor di-*clamp* ke rentang **0–100**, lalu diklasifikasi:

| Skor | Tingkat Risiko |
|---|---|
| **≥ 70** | 🔴 High Risk |
| **40–69** | 🟡 Medium Risk |
| **< 40** | 🟢 Low Risk |

> **Kenapa transparan itu penting (untuk pitch):** tim compliance & risk bisa mengaudit setiap keputusan. Tidak ada "AI bilang begitu" yang tidak bisa dijelaskan — setiap skor bisa dibongkar jadi sinyal pembentuknya.

**Determinisme:** timestamp `now` di-*inject* sebagai satu nilai tetap untuk seluruh batch scoring. Ini krusial untuk loop feedback (lihat §6.6) — supaya perbandingan before/after mengukur perubahan perilaku nyata, bukan sekadar pergeseran kalender.

### 5.3 RAG — Retrieval Augmented Generation

Saat analisis dijalankan untuk sebuah segment:

1. Sistem membuat query, misal: *"retention strategy for {label} contacts with low email engagement"*
2. Query di-embed → dicari **top 5 chunk paling mirip** (cosine similarity) dari knowledge base yang berstatus `ready`
3. Chunk-chunk ini jadi konteks "angle" untuk AI

### 5.4 Generasi Insight (Gemini 2.5 Flash)

AI menerima **dua hal**: ringkasan perilaku segment + kutipan knowledge base. Lalu menghasilkan **3–5 aksi retensi pragmatis** dengan aturan ketat:

- Setiap aksi spesifik & bisa dieksekusi **hari ini** (bukan saran generik)
- Merujuk sinyal nyata (bounce rate, open rate, last activity)
- Merujuk isi knowledge base bila relevan
- Maksimal 2 kalimat per aksi
- **Hanya retensi** — tanpa upsell/akuisisi

---

## 6. OUTPUT YANG DIHASILKAN

### 6.1 Tabel Kontak At-Risk
Daftar kontak berisiko (high + medium), diurutkan dari skor tertinggi, lengkap dengan bar skor visual & badge risiko.

### 6.2 Ringkasan Segment
Total dianalisis, jumlah high/medium risk, rata-rata skor, bounce rate, jumlah "never opened", rata-rata open rate.

### 6.3 AI Retention Insight
Panel berisi 3–5 aksi pragmatis yang menggabungkan data perilaku + knowledge base.

### 6.4 Email Penyelamat (DRAFT) + Segmentasi Otomatis
Saat user klik "Compose", sistem:
1. **Menyusun email lengkap** (subject + HTML inline-CSS) via Gemini — hangat, profesional, satu CTA jelas, tanpa menyebut skor/risiko internal ke pelanggan
2. **Membuat sublabel** `at-risk-{label}` di Mailtarget
3. **Tag hingga 100 kontak at-risk** ke sublabel itu
4. **Membuat kampanye sebagai DRAFT** yang menarget sublabel

> **Aturan keselamatan (penting untuk BFSI):** kampanye **SELALU** dibuat sebagai `DRAFT`. Manusia me-review lalu menekan Kirim secara manual. Sistem **tidak pernah** mengirim otomatis.

### 6.5 Feedback — "X dari Y Kembali Aktif"
Setelah kampanye dikirim & waktu berlalu, user klik "Check Re-engagement". Sistem:
1. Mengambil ulang & me-score ulang segment pada **satu timestamp tetap**
2. Me-score ulang snapshot lama **pada timestamp yang sama** (mengisolasi perubahan perilaku nyata dari drift kalender)
3. Menghitung delta per kontak & metrik agregat

**Definisi "Re-engaged":** kontak yang tadinya high/medium risk DAN sekarang (jadi low risk ATAU skornya turun ≥ 20 poin).

Output: hero "X dari Y kembali aktif", tabel delta before→after per kontak, progress bar, plus notice untuk kontak yang hilang/terpotong.

### 6.6 History — Tren Antar Waktu
Setiap run tersimpan permanen. Halaman History menampilkan semua run: label, tanggal, rasio at-risk/total, link kampanye, dan **rasio re-engagement** (dengan kode warna: hijau ≥50%, kuning 20–49%, merah <20%).

> **Nilai untuk pitch:** ini mengubah retensi dari tebakan jadi **disiplin yang terukur**. Setiap intervensi punya angka pembuktian, dan tren membaik/memburuk terlihat antar waktu.

---

## 7. Ringkasan Alur Data (Tabel Cepat)

| Tahap | Input | Proses | Output |
|---|---|---|---|
| **Ingest Knowledge** | URL / PDF | Crawl/parse → chunk → embed 768-dim | Vektor di pgvector |
| **Analyze** | Label segment | Fetch 5 kampanye → agregasi → scoring → RAG → insight | At-risk list + insight + snapshot (`runId`) |
| **Compose** | runId + insight + sender | Gemini tulis email → buat sublabel → tag → DRAFT | Kampanye DRAFT + kontak ter-tag |
| **Kirim** | DRAFT | **Manusia** review & kirim | Email terkirim |
| **Feedback** | runId | Re-fetch → re-score (now tetap) → delta | "X dari Y re-engaged" + tersimpan |
| **History** | — | List semua run | Tren re-engagement antar waktu |

---

## 8. Tech Stack (Ringkas)

| Komponen | Teknologi | Catatan |
|---|---|---|
| Framework | Next.js 16.2.9 (App Router, Turbopack) | BFF — API key hanya di server |
| Database | Neon serverless Postgres + pgvector | Vektor 768-dim, index HNSW cosine |
| Embedding | Gemini `gemini-embedding-001` | 768-dim (wajib, batas HNSW 2000) |
| Generasi AI | Gemini `gemini-2.5-flash` | Insight + komposisi email |
| Email API | Mailtarget Open API v1 | Diproksi via server route |
| Biaya infra | **IDR 0** | Semua di free tier |

---

## 9. Limitasi Saat Ini & Arah Pengembangan

> **Posisi kematangan produk (jujur):** PulseRetain saat ini adalah **prototipe yang berfungsi penuh dan membuktikan closed loop bekerja** — deteksi, aksi, dan pengukuran berjalan end-to-end. Yang **belum** dia capai: menjadi prediktor churn yang tervalidasi secara statistik. Penting membedakan keduanya saat presentasi. Bagian ini memetakan batas nyata sekarang, dipasangkan dengan jalur pematangannya — supaya narasinya konkret, bukan utopia.

### A. Limitasi Sinyal & Data

| Limitasi saat ini | Dampak nyata | Potensi pengembangan |
|---|---|---|
| **Churn = proxy engagement email, bukan churn sungguhan** | Orang bisa rajin buka email tapi tetap berhenti; atau abai email tapi tetap loyal. Skor menangkap *disengagement*, bukan keputusan berhenti yang sebenarnya. | Integrasi sinyal tambahan: data transaksi/login produk, survei NPS, tiket support. Engagement email jadi *salah satu* fitur, bukan satu-satunya. |
| **Jendela data sempit — hanya 5 kampanye selesai terbaru** | Kontak yang tidak masuk kampanye terbaru ter-score lemah; tren jangka panjang tidak tertangkap. | Perluas jendela & beri bobot waktu (recency weighting); simpan riwayat engagement historis di DB, bukan fetch ulang tiap kali. |
| **Cold start: knowledge base kosong → insight generik** | Tanpa sumber knowledge, "angle" AI jatuh ke saran umum. | Sediakan starter knowledge pack per industri; deteksi & beri peringatan saat KB tipis. |

### B. Limitasi Metodologi

| Limitasi saat ini | Dampak nyata | Potensi pengembangan |
|---|---|---|
| **Bobot scoring hand-tuned, bukan dipelajari dari data** | Angka +35/+25/dst. adalah tebakan pakar yang masuk akal, tapi belum divalidasi terhadap outcome churn nyata. | Kalibrasi bobot dari data historis (logistic regression / gradient boosting) begitu label churn sungguhan tersedia. Pertahankan transparansi dengan model yang bisa dijelaskan. |
| **Atribusi re-engagement bersifat korelasional, bukan kausal** | "X dari Y kembali aktif" tidak membuktikan *email-nya* yang menyebabkan — bisa jadi musiman, atau touchpoint lain. | Tambah **holdout/control group** (kelompok at-risk yang sengaja tidak dikirim) untuk uplift measurement yang jujur. |
| **Jendela pengukuran feedback manual & tak terdefinisi** | Hasil bergantung kapan user kebetulan klik "Check". | Tetapkan jendela pengukuran standar (mis. T+14 hari) & ukur otomatis pada titik itu. |

### C. Limitasi Operasional

| Limitasi saat ini | Dampak nyata | Potensi pengembangan |
|---|---|---|
| **Tagging dibatasi 100 kontak, penerima 2000/kampanye** | Segment besar terpotong (ada flag `truncated`, tapi tetap batas nyata). | Pemrosesan batch/antrian (queue) untuk segment besar; hapus cap setelah keluar dari free tier. |
| **Belum ada automation/penjadwalan** | Analisis dipicu manual setiap kali. | Vercel cron / QStash untuk analisis terjadwal — tetap hormati aturan DRAFT (tidak pernah auto-kirim). *(Sudah direncanakan di M7.)* |
| **Tanpa auth / single-workspace** | Hanya untuk demo, belum multi-tenant. | Auth + isolasi data per workspace untuk produksi multi-pengguna. |
| **Tanpa A/B testing varian email** | Tidak tahu subject/copy mana yang paling efektif. | Generate beberapa varian, uji, dan umpankan pemenang ke loop berikutnya. |

### D. Limitasi Teknis

| Limitasi saat ini | Dampak nyata | Potensi pengembangan |
|---|---|---|
| **Crawler gagal di situs JS-berat / anti-bot** | Sebagian sumber URL tidak bisa di-ingest. | Headless browser (Playwright) untuk render; atau integrasi API resmi sumber. |
| **Ketergantungan satu vendor AI (Gemini)** | Risiko kuota/ketersediaan terpusat. | Abstraksi provider (sudah ada `@anthropic-ai/sdk` di dependency) untuk fallback multi-model. |
| **Polish copy campur ID/EN, belum ada rate-limit ingest & audit log** | Item kosmetik & higiene operasional (dari audit, kategori Low). | Konsistensi bahasa, rate-limit pada ingest, audit log pada delete. |

> **Ringkas:** yang ada sekarang **nyata dan jalan** — loop tertutupnya bukan mockup. Yang membedakannya dari produk matang adalah **validasi statistik, atribusi kausal, dan skala operasional** — dan ketiganya punya jalur jelas, bukan tembok buntu.

---

## 10. Pesan Inti untuk Pitch (Talking Points)

1. **Closed loop, bukan sekadar dashboard.** Deteksi → aksi → pembuktian, semua dalam satu sistem.
2. **Scoring transparan & dapat diaudit.** Bukan black box — penting untuk industri teregulasi.
3. **Tidak butuh data sensitif.** Hanya sinyal engagement email — aman untuk BFSI/compliance.
4. **Human-in-the-loop.** Email selalu DRAFT; manusia yang memutuskan kirim.
5. **RAG = saran kontekstual.** Strategi nyambung dengan knowledge bisnis spesifik, bukan template generik.
6. **Terukur antar waktu.** History membuktikan ROI retensi dengan angka, bukan asumsi.
7. **Biaya nol.** Berjalan penuh di free tier — mudah didemokan & di-scale.
