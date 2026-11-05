# Phase 3 — High-fidelity pilot UI

Status: 5 pilot screen selesai sebagai desain statis; menunggu review pengguna.
Scope pada bagian awal dipilih dan didokumentasikan sebelum pembuatan UI.
Tanggal: 29 Oktober 2026. Artifact: `designs/app-ui.figcraft`.
Backup sebelum perubahan: `designs/backups/app-ui.before-phase3.figcraft`.

## Scope dan alasan pemilihan

Pilot memilih **5 unit inventory P1**, membentuk alur baca stok → riwayat →
daftar movement → buat draft transfer → review/confirm oleh pengguna berizin.
Stock on Hand menjadi overview operasional; tidak ditambahkan dashboard agregat.
Flow ini tidak membutuhkan supplier/customer, PO/SO lookup, MRP approval,
persistensi draft QC/opname, atau movement Work Order.

| ID | Screen | Role relevan | Permission dan dependency | Alasan |
|---|---|---|---|---|
| I04 | Stock on Hand | admin, manager, staff_gudang, staff_produksi, staff_penjualan | inventory.read; warehouse/batch lookup inventory.read; product lookup master_data.read | Overview stok aktual tanpa menyamakan on-hand dengan available |
| I05 | Stok Varian dan History | Role dengan inventory.read | Variant dari I04, GET stock per variant dan history; warehouse filter | Detail kuantitas, batch, dan history confirmed; pagination API tersedia |
| I08 | Movements | Role dengan inventory.read; create hanya inventory.write | MovementFilterDto, paginated movement list | Tabel transaksi, status, date/type/warehouse filter dan pagination |
| I09 | Create Movement | admin, manager, staff_gudang | inventory.write + inventory.read/master_data.read untuk lookup | Form dengan validasi quantity dan warehouse transfer berbeda |
| I10 | Movement Detail | inventory.read; manager/admin confirm/cancel | inventory.approve untuk confirm/cancel; reason wajib saat cancel | Workflow dan handoff staff_gudang ke approver tanpa menambah permission |

Total inventory awal 115 unit; setelah 5 pilot tersedia, **110 unit belum
dirancang dalam batch ini**. Varian state/responsive bukan unit inventory baru.

## Konteks dan aturan yang dipertahankan

- Sumber: `ux-specification.md`, `screen-inventory.md`, `frontend-design-system.md`,
  `designs/README.md`, arsitektur dan inventory pada `project_documentation.md`,
  `project_analysis.md`, auth constants, controller/DTO/service inventory.
- Tidak ditemukan PRD terpisah dalam workspace; scope produk mengikuti UX dan
  inventory. Dokumen teknis lama diperlakukan sebagai konteks; kontrak source
  aktual lebih diutamakan jika berbeda.
- Tujuh role template: admin, manager, staff_gudang, staff_produksi,
  staff_pembelian, staff_penjualan, akuntan. Capability berasal dari union
  permissions `/auth/me`, bukan nama jabatan. Akuntan/staff_pembelian tidak
  diberi akses inventory baru.
- I04 mengembalikan array: tidak dibuat pagination server, KPI total perusahaan,
  available stock, stock editing, export, atau sorting arbitrer.
- I08 mempunyai pagination dan filter type/status/date/warehouse, tetapi **tidak
  mempunyai search nomor movement**. Pencarian pada pilot ada dalam lookup
  produk/master; bukan global search atau filter fiktif di movement API.
- Movement tidak mempunyai document number di response. Identitas detail memakai
  ID opaque contoh `k7R2nP`; bukan nomor INV/MOV yang direka atau raw integer.
- List movement tidak mengembalikan nama gudang/header item. Gudang digunakan
  sebagai filter; kolom nama gudang per movement tidak ditebak dari response list.
- History hanya menampilkan movement confirmed. Balance ringkasan varian mencakup
  semua warehouse; filter history tidak diam-diam mengubah scope ringkasan.
- Response history tidak mengembalikan UoM per item: kuantitas history ditampilkan
  tanpa suffix satuan yang ditebak. Satuan ringkasan varian berasal dari context
  I04 atau GET stock dengan variantId, bukan diasumsikan ada pada response aggregate.
  Gap unit history perlu review kontrak backend sebelum analisis lintas UoM.
- Create menghasilkan draft; stok belum berubah. Tidak ada edit movement API.
  Confirm/cancel hanya draft; confirmed tidak menawarkan cancel/reversal palsu.
- Action timeout bukan sukses/gagal definitif. Tidak ada auto-resubmit mutation.
  Konflik status meminta GET ulang; nama actor tidak dibuat dari opaque user ID.

## Asumsi, blocker, dan platform

- AS04: desktop utama 1440 px; tablet gudang 1024 px; bahasa Indonesia, IDR,
  business date tanpa pergeseran timezone. Validasi perangkat nyata belum dilakukan.
- AS11: contoh create menggunakan `TRANSFER` dari seed. Subset movement manual
  yang boleh digunakan operator masih perlu review pemilik proses; mock ini
  bukan keputusan final untuk membuka semua jenis movement otomatis.
- Warehouse/produk/UoM/batch sudah diprovision dan user pilot mempunyai permission
  lookup. Missing/denied lookup akan ditampilkan sebagai dependency terpisah.
- BL01 supplier/customer, BL02 cross-role PO/SO/GR lookup, BL03/BL09 MRP approval,
  BL04 report period lookup, BL05 WO consume/result movement, BL06 QC/opname
  draft handoff, BL07 bank matching, BL08 administration tetap di luar pilot.
  Tidak ada blocker tersebut yang dinyatakan selesai oleh desain ini.
- Breakpoints memakai DS: sidebar 248 px ≥1280, 72 px pada 1024–1279, drawer di
  bawah 1024; mobile form satu kolom, tabel scroll dalam viewport. Tidak ada
  perubahan design tokens atau main components lama.

## Rencana state dan QA

Setiap default akan direview melalui screenshot dan inspect_document sebelum
screen berikutnya. State relevan meliputi loading/empty/error pada list/history,
validation/submitting pada form, confirmed success/conflict/permission handoff
pada detail. Resource permission denied tidak diganti empty atau login loop.

Status, node ID, komponen, hasil QA, screenshot, dan sisa pekerjaan dicatat
pada hasil akhir di bawah. UI ini bersifat statis; tidak ada interactive prototype,
source aplikasi, API, business rule, atau provisioning role yang diubah.


## Hasil akhir pilot

**Selesai sebagai desain statis dan siap direview pengguna.** Lima screen inventory
terwakili oleh **29 frame**: 24 desktop/state dan 5 tablet. Tidak ada screen modul
lain atau interactive prototype yang dibuat.

| Screen | Node default | State/frame yang dibuat | Status visual QA |
|---|---:|---|---|
| I04 Stock on Hand | 2355 | Default, Loading, Empty, Error, Tablet 1024 | Lulus review visual statis; tersimpan dan dibuka kembali |
| I05 Stok Varian dan History | 2532 | Default, History Empty, History Error, Tablet 1024 | Lulus review visual statis; tersimpan dan dibuka kembali |
| I08 Movements | 2688 | Default, Loading, Empty, Error, Permission Denied, Tablet 1024 | Lulus review visual statis; tersimpan dan dibuka kembali |
| I09 Create Movement | 2880 | Default, Validation Error, Submitting, Outcome Unknown, Lookup Permission Denied, Tablet 1024, Product Lookup Open | Lulus review visual statis; tersimpan dan dibuka kembali |
| I10 Movement Detail | 3049 | Default, Confirmed Success, Permission Handoff, Status Conflict, Confirm Dialog, Cancel Dialog, Tablet 1024 | Lulus review visual statis; tersimpan dan dibuka kembali |

Create success diarahkan pada rancangan detail draft I10; tidak dibuat halaman
sukses terpisah. Confirmed Success merupakan state setelah konfirmasi dan refresh
stok. Validation/disabled/loading/empty/error/denied diperlihatkan pada konteks
yang relevan, bukan dipaksakan identik pada setiap screen. History Empty/Error
menjaga ringkasan stok tetap terlihat; hasil mutation yang tidak diketahui tidak
menawarkan kirim ulang otomatis.

### Komponen dan token yang digunakan

| Komponen lama | Main/set ID | Pemakaian |
|---|---|---|
| Sidebar Full / Collapsed | 1170 / 1244 | Shell desktop 248 px / tablet 72 px; override visibility berdasarkan capability |
| Topbar | 1296 | Breadcrumb Indonesia, tenantCode, identitas akun |
| Button variants | 559 | Primary/secondary/ghost, disabled/loading; ukuran tablet Touch 44 px |
| Field variants | 816 | Text/search/select/quantity/currency; default/error/disabled; helper kontekstual |
| Choice variants | 890 | onlyPositive checkbox di stok |
| Card variants | 973 | Ringkasan hasil stok dan saldo per gudang; Content slot tetap terhubung |
| Badge variants | 953 | Draft, dikonfirmasi, dibatalkan; label instance eksplisit |
| Tab variants | 1313 | Konteks inventory dan history; label memakai fill constraint |
| Document Header | 1322 | Identitas detail movement, ID opaque dan judul |
| Feedback variants | 1139 | Loading, empty, error, permission denied |
| Dialog variants / Modal Overlay | 1051 / 1055 | Konfirmasi transfer dan pembatalan dengan reason |
| Lookup Results | 1939 | Pencarian produk sebelum memilih varian; bukan global variant search |

Empat main components tambahan adalah **komposisi row khusus pilot**, bukan
pengganti design system. Semuanya ditempatkan pada page terpisah, memakai text
properties C0–Cn sesuai urutan kolom, typography/style dan color tokens lama:

| Nama | Main ID | Struktur |
|---|---:|---|
| Pilot / Stock row | 2326 | Produk/SKU, warehouse, batch, expiry, on-hand, UoM |
| Pilot / History row | 2333 | Tanggal, jenis, asal, tujuan, batch, quantity |
| Pilot / Movement row | 2340 | ID opaque, tanggal, jenis, source, notes, nested status badge instance |
| Pilot / Transfer row | 2349 | Produk/SKU, batch, asal→tujuan, quantity, unit cost |

Semua row pada screen adalah instance dari main tersebut. Controls, badges,
sidebar, dialog, dan card juga tetap berupa instance. Layout halaman/header/filter
adalah auto-layout frames, bukan bitmap UI. Terdapat **1.036 instance** termasuk
nested instances pada tiga page pilot; tidak ditemukan instance tanpa main.

**106 variables dan 48 styles lama dipertahankan.** Tidak ada token atau style
baru. Override responsif mengubah ukuran instance dan kolom tanpa detach.
Membandingkan 2.227 node pada enam page design system sebelum dan sesudah pekerjaan
serta sesudah reopen menghasilkan **0 perubahan node design system lama**.

### Platform dan layout hasil

- Desktop: 1440 px, sidebar 248 px, topbar 56 px, content padding 24 px.
- Tablet: 1024 px, sidebar 72 px, fields membungkus menjadi dua kolom, kontrol
  Touch 44 px, input 16 px. Lebar kolom keempat tabel dioptimalkan agar field utama
  termasuk on-hand/quantity/status terlihat tanpa clipping horizontal.
- Artboard menunjukkan isi halaman penuh; tinggi menyesuaikan konten dan bukan
  klaim bahwa seluruh isi muat dalam viewport perangkat tanpa vertical scrolling.
- Full mobile pilot tidak dibuat: AS04 memprioritaskan desktop dan tablet gudang.
  Pola mobile DS lama tetap dipertahankan. Viewport <1024 dan perangkat nyata
  perlu batch validasi tersendiri; belum dinyatakan selesai.

### Hasil QA dan masalah yang diperbaiki

1. Setiap default diperiksa dengan screenshot MCP dan inspect_document sebelum
   default berikutnya. State dan tablet kemudian direview kembali melalui screenshot.
2. Frame stok yang awalnya memotong baris terakhir diperpanjang sesuai konten.
3. Label tab yang melewati batas instance dibuat fill; field search diperbaiki
   jarak ikon/teksnya, dan field validasi disejajarkan dari atas.
4. Pagination tablet awalnya ikut terpotong. Kolom tabel diringkas, ukuran tombol
   Touch disesuaikan kembali, dan pagination dipastikan seluruhnya terlihat.
5. Modal instance awalnya mempunyai backdrop opaque dari DS. Override instance
   mengembalikan backdrop 40%; main DS tidak diubah.
6. Status conflict kini menandai Draft sebagai **status terakhir**, sehingga data
   stale tidak disajikan sebagai status terkini. Unknown outcome tidak menyebut
   dokumen pasti belum tersimpan.
7. Label dan visibility sidebar tablet disesuaikan untuk role contoh. Staff gudang
   tidak mendapatkan action confirm/cancel; akses resource yang ditolak tidak
   diperlihatkan sebagai empty atau login failure.
8. Bounds check terakhir, termasuk descendants instance yang terlihat: **0 overflow
   tak disengaja**, **0 missing main**, **0 interaction prototype**. Focus ring
   absolute di luar control diperlakukan sebagai perilaku yang disengaja.
9. File disimpan, tab ditutup, lalu dibuka ulang melalui attached MCP: 9 pages,
   29 pilot frames, **repairs: []**, missing fonts: **[]**. Pembacaan file dari
   disk dengan FigCraft CLI info juga berhasil.
10. Satu command ditolak karena description hanya berlaku untuk component.
    Dokumen diperiksa sebelum retry; tidak ada node duplikat yang dibuat sebagai
    recovery. Nama/properti frame kemudian diatur dengan parameter yang didukung.

Review ini memverifikasi visual dan struktur canvas. Ini bukan uji API, otorisasi
runtime, keyboard, screen reader, focus trap, touch hardware, atau perhitungan
stok terhadap database development. Tidak ada source code aplikasi atau business
rules yang diubah. Data dan actor IDs adalah mock, bukan hasil query runtime.

### Screenshot dan node manifest

Seluruh PNG berikut diekspor dari canvas melalui FigCraft MCP pada resolusi 1×.
Node ID tetap terverifikasi setelah reopen. Naming mengikuti Module / Screen / State.

| Screen ID | State | Node ID | Screenshot |
|---|---|---:|---|
| I04 | Default | 2355 | [PNG](../designs/screenshots/I04-stock-on-hand-default.png) |
| I05 | Default | 2532 | [PNG](../designs/screenshots/I05-stok-varian-dan-history-default.png) |
| I08 | Default | 2688 | [PNG](../designs/screenshots/I08-movements-default.png) |
| I09 | Default | 2880 | [PNG](../designs/screenshots/I09-create-movement-default.png) |
| I10 | Default | 3049 | [PNG](../designs/screenshots/I10-movement-detail-default.png) |
| I04 | Loading | 3179 | [PNG](../designs/screenshots/I04-stock-on-hand-loading.png) |
| I04 | Empty | 3364 | [PNG](../designs/screenshots/I04-stock-on-hand-empty.png) |
| I04 | Error | 3471 | [PNG](../designs/screenshots/I04-stock-on-hand-error.png) |
| I08 | Loading | 3578 | [PNG](../designs/screenshots/I08-movements-loading.png) |
| I08 | Empty | 3778 | [PNG](../designs/screenshots/I08-movements-empty.png) |
| I08 | Error | 3976 | [PNG](../designs/screenshots/I08-movements-error.png) |
| I08 | Permission Denied | 4174 | [PNG](../designs/screenshots/I08-movements-permission-denied.png) |
| I05 | History Empty | 4372 | [PNG](../designs/screenshots/I05-stok-varian-dan-history-history-empty.png) |
| I09 | Validation Error | 4534 | [PNG](../designs/screenshots/I09-create-movement-validation-error.png) |
| I09 | Submitting | 4703 | [PNG](../designs/screenshots/I09-create-movement-submitting.png) |
| I09 | Outcome Unknown | 4873 | [PNG](../designs/screenshots/I09-create-movement-outcome-unknown.png) |
| I10 | Confirmed Success | 5045 | [PNG](../designs/screenshots/I10-movement-detail-confirmed-success.png) |
| I10 | Permission Handoff | 5178 | [PNG](../designs/screenshots/I10-movement-detail-permission-handoff.png) |
| I10 | Status Conflict | 5311 | [PNG](../designs/screenshots/I10-movement-detail-status-conflict.png) |
| I10 | Confirm Dialog | 5446 | [PNG](../designs/screenshots/I10-movement-detail-confirm-dialog.png) |
| I10 | Cancel Dialog | 5589 | [PNG](../designs/screenshots/I10-movement-detail-cancel-dialog.png) |
| I09 | Lookup Permission Denied | 5740 | [PNG](../designs/screenshots/I09-create-movement-lookup-permission-denied.png) |
| I05 | History Error | 5912 | [PNG](../designs/screenshots/I05-stok-varian-dan-history-history-error.png) |
| I04 | Tablet 1024 | 6028 | [PNG](../designs/screenshots/I04-stock-on-hand-tablet-1024.png) |
| I05 | Tablet 1024 | 6239 | [PNG](../designs/screenshots/I05-stok-varian-dan-history-tablet-1024.png) |
| I08 | Tablet 1024 | 6429 | [PNG](../designs/screenshots/I08-movements-tablet-1024.png) |
| I09 | Tablet 1024 | 6655 | [PNG](../designs/screenshots/I09-create-movement-tablet-1024.png) |
| I10 | Tablet 1024 | 6858 | [PNG](../designs/screenshots/I10-movement-detail-tablet-1024.png) |
| I09 | Product Lookup Open | 7026 | [PNG](../designs/screenshots/I09-create-movement-product-lookup-open.png) |

### Blocker, asumsi, dan batch berikutnya

- AS11 masih memerlukan keputusan product owner/domain owner tentang subset jenis
  movement manual. Pemakaian TRANSFER di mock bukan persetujuan membuka jenis
  movement otomatis dari GR/DO/WO kepada operator.
- Product lookup mengikuti urutan product → variants; stok/filter menerima opaque
  ID yang dipilih, bukan pencarian bebas nomor movement atau input ID manual.
- Handoff staf→approver memakai ID draft yang sudah tersimpan. Tidak ditambahkan
  inbox, assignment, notification, atau persetujuan bertingkat.
- BL05 movement WO, BL06 QC/opname draft handoff, dan blocker lain pada bagian awal
  tetap terbuka di luar pilot. Desain ini tidak menjadi bukti backend flow siap.
- Temuan tambahan pilot: GET stock/history belum menyertakan UoM per item. UI
  mempertahankan quantity mentah dengan catatan satuan belum tersedia; tidak
  menganggap seluruh history otomatis dalam base UoM atau menambah running balance.
- Masih **110 unit screen/mode inventory** di luar 5 ID pilot. Dua puluh sembilan
  frame state/responsive tidak mengurangi backlog sebagai 29 screen terpisah.
- Rekomendasi batch berikut setelah review pengguna: **A01 Login, A02 Workspace,
  A03 Akun Saya, A04 Ganti Password, M01 Produk** untuk fondasi akses dan lookup
  yang mendukung flow inventory ini. Manufacture/WO ditunda sampai BL05 diverifikasi.
- Pekerjaan dihentikan pada batch pilot ini untuk review; batch berikut belum dibuat.

