# Phase 3.5 — Contemporary Product UI / Soft Green

Tanggal: 30 Oktober 2026. Status: 3 screen selesai sebagai desain statis; menunggu review visual pengguna.
Skill yang dibaca: `.agents/skills/ui-taste/SKILL.md`,
`references/uizze-image-to-ui.md`, `reference/new-work.md`, `operate.md`,
`craft.md`, `polish.md`, dan `audit.md`.

## Direction contract

- Authority: **Replace**, sesuai persetujuan eksplisit untuk major visual redesign.
  Satu arah final: Contemporary Product UI, soft green. Tidak ada eksplorasi alternatif.
- Target yang disuplai pengguna: [referensi](../designs/references/contemporary-product-ui-supplied.png),
  **1846 × 1310 px**, sudah dilihat langsung. Referensi dipakai untuk proporsi,
  soft surfaces, navigasi terang dan hierarchy; bukan sumber fitur ERP.
- Target ini adalah referensi aplikasi finansial. Grafik cash flow, wallet,
  notification inbox, share, upgrade dan global search tidak dipindahkan ke ERP.
  Tidak diklaim sebagai salinan pixel-perfect referensi atau implementasi API.
- Thesis: ruang kerja inventory yang tenang dengan satu prioritas visual, informasi
  pendukung yang lebih ringan, tabel padat, dan aksi dokumen yang jelas.
- First viewport: sidebar terang 248 px, topbar ringan, judul tegas dan satu primary
  action; overview asimetris hanya pada I04. List mempertahankan tabel sebagai
  pusat kerja. Detail mengelompokkan fakta dokumen dan review aksi dalam proporsi
  yang berbeda, tanpa menambah langkah approval.
- Scope: **I04 Stock on Hand, I08 Movements, I10 Movement Detail**, memakai data
  mock yang sama dari pilot v1. Desktop 1440 px dan tablet 1024 px.
- File kerja: `designs/app-ui-v2.figcraft`, dibuat dengan Save As melalui attached
  FigCraft MCP. `designs/app-ui.figcraft` tidak diubah.
- Finish: native editable components/instances, auto layout, variable mappings,
  screenshot before/after pada viewport sama, inspect_document, contrast checks,
  save dan reopen. Tidak membuat interactive prototype.

## Konteks produk yang tetap

Sumber: `ux-specification.md`, `screen-inventory.md`, `designs/README.md`,
`ui-design-progress.md`, arsitektur/business rules inventory dalam
`project_documentation.md`, dan source inventory/auth yang dirujuk dokumen UX.
Tidak ditemukan PRD terpisah; dokumen UX/inventory menjadi scope produk.

- Role/permissions tetap union capability dari auth/me. Contoh default memakai
  manager; tidak memberi inventory.approve pada staf gudang.
- I04: 8 baris stok positif dari dua gudang; mixed units tidak dijumlahkan.
  Hasil berupa array, bukan pagination server atau total perusahaan.
- I08: 28 hasil, 8 per halaman; type/status/warehouse/date filters. Tidak ada
  search nomor movement, bulk action, atau export baru.
- I10: draft k7R2nP, transfer 20,0000 kg WH-RM→WH-WIP; unit cost Rp90.000,00.
  Pratinjau 120→100 dan 20→40, bukan hasil konfirmasi yang sudah terjadi.
  Confirm/cancel hanya jika status dan inventory.approve mengizinkan.
- Tidak ada edit movement, reversal confirmed, auto-resubmit timeout, actor name
  yang direka dari ID, atau source document link yang tidak dikembalikan API.
- AS11 subset movement manual, BL05 WO movement, BL06 QC/opname draft handoff,
  dan blocker lain tetap terbuka. Redesign ini tidak menyelesaikan backend gap.

## Audit visual v1

Audit ini berdasarkan render FigCraft v1 dan layer inspection; penilaian visual
dipisahkan dari bug fungsional. Tidak ada klaim audit DOM/browser atau WCAG penuh.

| Area | Masalah yang diamati | Dampak | Koreksi v2 |
|---|---|---|---|
| Composition I04 | Tiga kartu identik, angka 8/2 dan label Stok Positif berbobot sama | Fokus informasi lemah; terasa template | Satu scope utama dan ringkasan gudang pendukung berproporsi berbeda |
| Navigation | Sidebar charcoal sangat dominan, daftar modul rata tanpa pengelompokan | Shell bersaing dengan data | Sidebar putih, kelompok operasional, current location dan selected surface soft green |
| Hierarchy | Banyak heading/panel memakai treatment serupa; jarak vertikal seragam | Tidak ada ritme antara overview dan area kerja | Heading/page/section/caption dibedakan; gap berdasarkan relasi informasi |
| Filters I08 | Panel filter besar terpisah dari tabel | Baris transaksi terdorong ke bawah | Filter kompak terintegrasi dengan resource list, tetap semua field tersedia |
| Surfaces | Border mengelilingi hampir setiap blok dan card | Terasa seperti kumpulan HTML fieldsets | Grouping lewat whitespace, tinted surfaces dan separator terpilih |
| Table | Identitas produk/SKU dan supporting data kurang dibedakan | Pemindaian lambat meski data lengkap | Primary text/SKU muted, angka tabular, row rhythm dan badges lebih halus |
| Detail I10 | Semua section ditumpuk selebar halaman | Jalur baca panjang dan aksi review terpisah dari konteks | Konten utama + review rail; stacked pada tablet bila diperlukan |
| Color | Amber hanya mengganti aksen pada struktur yang kaku | Perubahan warna saja tidak meningkatkan kualitas | Semantic primary dipetakan ulang ke deep green, selected/ground memakai green tint |

Audit awal di atas menjadi dasar koreksi. Hasil render dan QA final dicatat di bawah.

## Hasil redesign

**Selesai sebagai desain editable untuk review visual pengguna.** Tiga unit screen
(I04, I08, I10), bukan seluruh 115 unit. Tersedia 12 frame: tiga desktop default,
tiga tablet, tiga list states, serta tiga workflow/permission states. File v2
memuat empat page baru; sembilan page lama diberi label **V1 archive** di salinan
v2 untuk referensi. File v1 di disk tetap tidak berubah.

### Color tokens dan pemetaan

Koleksi **ERP V2 / Semantic** mempunyai 28 variables: 24 colors dan empat radius.
Ekspor native: [design-tokens-v2.json](../designs/design-tokens-v2.json).
Token v1 tidak di-replace secara global. Pilot v2 memakai bindings ke koleksi
baru sesuai fungsi; archive v1 mempertahankan warna sebelumnya.

| Fungsi | Mapping v1 | Token v2 / nilai |
|---|---|---|
| Primary action | action/primary, amber #FBBF24 | color/primary · #2F7657 |
| Hover | action/primary-hover, amber | color/hover · #245E45 |
| Pressed | action/primary-pressed, amber | color/pressed · #1E503B |
| Foreground primary | teks gelap pada amber | color/onPrimary · #F8FAF8 |
| Accent | brand amber highlight | color/accent · #A8D9BD |
| Selected surface | sidebar active charcoal/amber | color/selected · #E8F4ED |
| App background | neutral canvas | color/canvas · #F8FAF8 |
| Working surface | white | color/surface · #FFFFFF |
| Primary text | neutral/900 | color/ink · #1E2A24 |
| Secondary text | neutral/600 | color/muted · #65746B |
| Surface divider | neutral/200 | color/border · #DFE7E1 |
| Control border | neutral/500 | color/control · #7B8D81 |
| Inactive surface/text | neutral disabled | #EDF1ED / #748379 |
| Success | semantic v1 dipertahankan | #166534 / #F0FDF4 |
| Warning | semantic v1 dipertahankan | #9A3412 / #FFF7ED |
| Danger | semantic v1 dipertahankan | #B91C1C / #FEF2F2 |
| Information | semantic v1 dipertahankan | #1D4ED8 / #EFF6FF |

Near-white foreground #F8FAF8 dipakai konsisten pada primary surfaces dan tetap
memenuhi kontras. Accent soft green dipakai terpilih pada icon/highlight; bukan
semua komponen. Draft/cancelled memakai teks netral gelap, icon dan label; status
tidak bergantung pada warna.

### Typography, layout, dan components

- **Inter Regular / SemiBold**, terverifikasi tersedia pada FigCraft Desktop.
  Tidak menggunakan paid Uizze materials atau mengklaim koneksi Uizze MCP.
- Page heading 32/38, tracking −1 px; section 18–22, body/control 14/20,
  primary table 13, supporting/SKU 11–12. Angka kuantitas memakai tabular numerals.
- Desktop: sidebar 248, topbar 72, page padding 32, major gap 24.
  Tablet: rail 72, padding 24; filter membungkus, field tetap 44 px.
- Radius control 10, panel 16, hero 20. Table row 60, badge 28.
  Permanent cards tidak diberi shadow; modal memakai satu restrained shadow.
- I04: scope utama 676 px dan warehouse context 428 px, gap 24. Tidak membuat
  chart/metric baru; 8 baris dan dua gudang berasal dari hasil yang sama.
- I08: filter terintegrasi dengan list. Semua jenis/status/gudang/date fields
  tetap tersedia; tidak menambahkan pencarian movement, selection atau bulk action.
- I10: facts 744 px, review rail 360 px. Pada tablet menjadi 520/360; tidak
  mengubah tahapan bisnis. Preview tetap dilabeli dan tidak dianggap stock final.
- Tablet columns disesuaikan agar on-hand, quantity, status dan pagination terlihat.
  Tidak menggunakan clipped table sebagai bukti bahwa responsive selesai.
- Full mobile v2 tidak termasuk scope AS04. Belum diuji sebagai mobile UI.

**39 main components v2** dibuat hanya untuk kebutuhan pilot: 11 button variants,
12 field variants, tiga badges, dua nav item variants, dua resource rows,
checked checkbox, tiga sidebar variants, topbar, tiga feedback variants,
dan satu dialog. Enam component sets: Button, Field, Badge, Nav, Sidebar,
Feedback. Ini bukan rebuild 249 komponen lama.

Button/field states mencakup default, hover, pressed, focus, disabled, loading,
dan error sesuai komponen yang digunakan. Foundation menunjukkan state visual;
tidak ada interaksi prototype yang dihubungkan. Existing vector icons dipakai
kembali dengan styling yang sesuai. Surface, text dan data tetap native editable
layers; file v2 mempunyai **0 embedded screenshot images**.

[Foundation screenshot](../designs/screenshots/v2-foundation.png).

### Before / after pada viewport yang sama

Screenshot sebelum berasal dari salinan native frame v1 dalam v2. Hanya tinggi
frame dinormalisasi menjadi 1280 px; konten visual v1 tidak diubah.
Ketiga pasangan telah diperiksa berukuran **1440 × 1280 px**.

| Screen | Before | After | Perbedaan struktural |
|---|---|---|---|
| I04 Stock on Hand | [PNG](../designs/screenshots/v2-I04-before-1440.png) | [PNG](../designs/screenshots/v2-I04-after-1440.png) | Tiga kartu identik menjadi overview asimetris; filter menyatu dengan tabel |
| I08 Movements | [PNG](../designs/screenshots/v2-I08-before-1440.png) | [PNG](../designs/screenshots/v2-I08-after-1440.png) | Navigation terang, density dan hierarchy tabel lebih tegas, filter/list satu workspace |
| I10 Movement Detail | [PNG](../designs/screenshots/v2-I10-before-1440.png) | [PNG](../designs/screenshots/v2-I10-after-1440.png) | Stack penuh menjadi facts + review rail; warehouse route dan preview dibedakan |

Referensi pengguna mempunyai ukuran 1846×1310 dan produk berbeda. Perbandingan
dengan referensi bersifat struktural/visual, bukan pixel-perfect reproduction.
Tidak menyalin merek, wallet, grafik atau fitur finansial dari referensi.

### Manifest frame v2

| Screen | State | FigCraft node | Screenshot |
|---|---|---:|---|
| I04 | Default | 7854 | [PNG](../designs/screenshots/v2-I04-after-1440.png) |
| I08 | Default | 8093 | [PNG](../designs/screenshots/v2-I08-after-1440.png) |
| I10 | Default | 8309 | [PNG](../designs/screenshots/v2-I10-after-1440.png) |
| I04 | Tablet 1024 | 8819 | [PNG](../designs/screenshots/v2-I04-tablet-1024.png) |
| I08 | Tablet 1024 | 9050 | [PNG](../designs/screenshots/v2-I08-tablet-1024.png) |
| I10 | Tablet 1024 | 9258 | [PNG](../designs/screenshots/v2-I10-tablet-1024.png) |
| I08 | Loading | 9448 | [PNG](../designs/screenshots/v2-I08-loading.png) |
| I08 | Empty | 9661 | [PNG](../designs/screenshots/v2-I08-empty.png) |
| I08 | Error | 9875 | [PNG](../designs/screenshots/v2-I08-error.png) |
| I10 | Permission Handoff | 10089 | [PNG](../designs/screenshots/v2-I10-permission-handoff.png) |
| I10 | Confirmed Success | 10261 | [PNG](../designs/screenshots/v2-I10-confirmed-success.png) |
| I10 | Confirm Dialog | 10445 | [PNG](../designs/screenshots/v2-I10-confirm-dialog.png) |

### UI Taste visual QA

- Semua 12 frame diperiksa dengan screenshot MCP dan get_node. Struktur global
  diperiksa dengan inspect_document; pemeriksaan mendalam dilakukan per frame.
- Checks: hierarchy, alignment, spacing rhythm, typography, color harmony,
  readability, data density, controls, states, dan responsive desktop/tablet.
- Audit terakhir memeriksa **863 text nodes aktif** pada opaque surfaces:
  tidak ada pasangan yang berada di bawah ambang AA relevan (4,5:1 normal,
  3:1 large). Disabled text dikecualikan. Ini bukan sertifikasi WCAG seluruh app,
  audit screen reader atau evaluasi compositing semua layer di bawah modal.
- Primary near-white/green **5,20:1**; body/canvas **14,18:1**;
  muted/white **4,93:1**; control border/white **3,52:1**;
  dark green label/selected tint **6,73:1**; hero supporting/green **4,60:1**.
- Masalah kontras muted/selected tint (4,36:1) diperbaiki dengan dark-green
  foreground. Badge netral juga menggunakan dark ink agar kontras label cukup.
- **0 unexpected bounds overflow**, **0 missing main component**,
  **0 prototype interactions**, dan **395 native instances** pada 12 frame.
- Stock fixture I04 dibandingkan field-per-field: seluruh delapan row sama
  dengan v1, termasuk produk/SKU, gudang, batch, expiry, quantity dan satuan.
  Delapan opaque movement IDs I08 juga cocok dengan fixture semula.
- Konfirmasi, disabled confirmed state, modal, dan handoff staff_gudang direview.
  Finance/Reports/Manufacturing serta parent keuangan kosong disembunyikan pada
  handoff staff; tidak memberi permission tambahan atau membuat assignment API.
- Native file berhasil disimpan dan dibuka ulang melalui attached MCP tanpa
  repair atau missing font. File bisa dibaca dari disk oleh FigCraft CLI.
- Source aplikasi, database, API, role dan business rules tidak diubah.

### Kondisi MCP yang ditangani

Tiga node.create menolak fontStyle yang salah tipe; kondisi dokumen diperiksa
sebelum resume dan helper diperbaiki. Tidak dilakukan blind retry yang membuat
screen duplikat. Satu read command style.get tidak tersedia, sehingga effect
diinspeksi dari node aktual. Pengambilan seluruh document depth 24 tertahan dan
dihentikan sebagai operasi read-only; QA final memakai inspect_document depth 2
dan get_node depth 14 per frame, yang berhasil.

Satu label tombol ada pada layer inspection tetapi tidak muncul di render.
Foreground dipetakan ulang melalui token onPrimary ke near-white dan screenshot
diambil kembali; label terlihat pada hasil akhir. Penyebab internal renderer
tidak disimpulkan hanya dari gejala itu.

### Batas dan hal yang masih terbuka

- Tidak ada masalah visual kritis tersisa pada frame yang diperiksa. Pemeriksaan
  ini tetap berupa native canvas review, bukan browser/runtime usability test.
- Keyboard, screen reader, focus trap, reduced motion, input hardware, browser
  responsive di luar 1024/1440, dan integrasi API belum diverifikasi.
- Focus/hover/loading adalah rancangan state visual. Tidak dibuat animasi,
  interaksi prototype atau klaim bahwa tombol telah memanggil backend.
- AS11 subset movement manual, BL05 WO movement, BL06 draft handoff dan API
  gaps lain tetap terbuka. Data bersifat mock; tidak ada database query/mutation.
- Font Inter tersedia dalam sesi yang diuji. Perangkat lain perlu font yang sama
  atau verifikasi missing-font sebelum handoff implementasi.
- Sisa dua pilot v1, 249 komponen lama, dan unit screen lain belum di-redesign.
  Seluruh phase 3.5 berhenti pada tiga screen ini untuk review visual pengguna.

### Preservation check

File lama tetap pada path semula dan SHA-256 sesudah pekerjaan sama dengan awal:

`0ed77b74702240dbc8656587eabc642d7942b99d41a8fe516603a283122224dd`.

File kerja final: [app-ui-v2.figcraft](../designs/app-ui-v2.figcraft).

