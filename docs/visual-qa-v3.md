# Phase 3.6 — Visual QA V3

Status: **tiga pilot selesai sebagai native editable design; siap review visual**.
Tanggal: 2 November 2026. Bukan laporan runtime application/API testing.

## Artifact dan scope

[Dokumen final](../designs/app-ui-shadcn-v3.figcraft): tiga pages, 70 main
components, 12 component sets, 234 instances, 42 variables. Tidak ada image layer
atau screenshot sebagai pengganti UI. Scope tetap A02 Workspace, M01 Produk,
M02 Produk create/edit (pilot yang digambar: create). Mode responsive dan gallery
state adalah mode tiga unit yang sama, bukan penambahan inventory screen.

SHA-256 dokumen final: `d15049dc7963980892a41e977f4b62f2636a74e80b870b1846239d9adba501c3`.

## Environment dan referensi visual

- FigCraft 0.6.0, MCP stdio `mcp --attach 7979`, terhubung ke aplikasi Desktop.
  Tool tidak diekspos langsung ke sesi awal; koneksi attached berhasil dijalankan
  lewat executable MCP terkonfigurasi setelah control server aktif. Tidak ada
  manipulasi archive JSON untuk membuat desain.
- Chrome headless pada macOS, viewport1440×1000, deviceScaleFactor1, Light,
  font-ready dan animasi overlay selesai sebelum capture final.
- shadcn MCP membaca block dashboard-01/sidebar-07 dan contoh field-demo.
  Registry memberi new-york-v4; Nova ditelusuri melalui source stylesheet dan
  preview Base UI. `style-nova` NOT_FOUND dicatat sebagai keterbatasan lookup,
  bukan alasan mengganti arah visual.
- Font native: Geist, sama dengan computed font preview resmi. TTF dan OFL
  disertakan; report missing=0 pada sesi pemeriksaan, embeddedFontFiles=0.

| Referensi resmi | Capture yang benar-benar diperiksa |
|---|---|
| [dashboard-01](https://ui.shadcn.com/view/new-york-v4/dashboard-01) | [Light 1440×1000](../designs/references/v3-dashboard-01-official-1440.png) |
| [sidebar-07](https://ui.shadcn.com/view/new-york-v4/sidebar-07) | [Expanded navigation](../designs/references/v3-sidebar-07-official-1440.png) |
| [Base Data Table](https://ui.shadcn.com/docs/components/base/data-table) | [Default](../designs/references/v3-data-table-official-1440.png), [row menu open](../designs/references/v3-data-table-row-menu-official-1440.png) |
| [Base Field](https://ui.shadcn.com/docs/components/base/field) | [Rendered Nova controls](../designs/references/v3-field-nova-official-1440.png) |
| [Base Dialog](https://ui.shadcn.com/docs/components/base/dialog) | [Default LTR open](../designs/references/v3-dialog-official-1440.png) |
| [Alert](https://ui.shadcn.com/docs/components/base/alert) / [Empty](https://ui.shadcn.com/docs/components/base/empty) | [Alert](../designs/references/v3-alert-official-1440.png), [Empty](../designs/references/v3-empty-official-1440.png) |
| [Combobox](https://ui.shadcn.com/docs/components/base/combobox) / [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip) | [Open Combobox](../designs/references/v3-combobox-official-1440.png), [open Tooltip](../designs/references/v3-tooltip-official-1440.png) |
| [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton) / [Sheet](https://ui.shadcn.com/docs/components/base/sheet) | [Skeleton](../designs/references/v3-skeleton-official-1440.png), [open Sheet](../designs/references/v3-sheet-official-1440.png) |

JSON dengan basename yang sama menyimpan URL dan computed measurements. Source
code saja tidak dihitung sebagai visual comparison. Baseline Alert/Empty,
Combobox terbuka, Tooltip hover, Skeleton dan Sheet terbuka juga diperiksa dan
dipakai untuk koreksi terakhir. Exact matching setiap state seluruh katalog
tetap tidak diklaim; variasi brand/permission bukan konten demo resmi. Screenshot
V1/V2 tidak dipakai sebagai bukti V3.

## Metode comparison dan hasil tiga pilot

Referensi dan native ditampilkan pada viewport sebanding. Pemeriksaan manual
memisahkan shell/proportions, typography, control geometry, spacing, color
balance, borders/radius, hierarchy dan readability. Konten ERP berbeda dari demo,
sehingga ini comparison side-by-side dan pengukuran, bukan image-diff langsung
antara dua halaman yang kontennya berbeda.

| Pilot | Hasil comparison | Perbedaan disengaja | Capture final |
|---|---|---|---|
| A02 Workspace, node894 | Inset shell288, header48, main padding24; heading → tiga metric cards → akses cepat → operational table; Geist dan border/radius konsisten; footer tidak lagi terpotong | Tiga counts produk berizin, compact metric132; tidak menyalin revenue/growth/chart demo; soft green mengganti black primary | [Desktop](../designs/screenshots/v3-A02-workspace-1440.png), [tablet](../designs/screenshots/v3-A02-tablet-1024.png) |
| M01 Produk, node1220 | Toolbar32, tabs, table header40/body48, badge20, row action32, pagination dekat tabel; scrollbar tablet terlihat | Delapan fixture aktif; selection/export tidak diperlukan; urutan server A–Z tetap, tanpa arbitrary sort toggle | [Desktop](../designs/screenshots/v3-M01-products-1440.png), [tablet](../designs/screenshots/v3-M01-tablet-1024.png) |
| M02 Tambah produk, node1554 | Label di atas/control32, field gap8/group20; identitas/satuan/capabilities/variants dipisah jelas; primary-secondary actions dekat form; required/optional dan validation specimens | Domain product flags memakai checkbox; description read-only karena gap validator; mobile menjadi satu kolom | [Desktop](../designs/screenshots/v3-M02-product-form-1440.png), [tablet](../designs/screenshots/v3-M02-tablet-1024.png), [mobile](../designs/screenshots/v3-M02-mobile-390.png) |

Tidak ditemukan masalah visual kritis tersisa pada frame final yang diperiksa.
Ini bukan klaim pixel-perfect dengan shadcn: palette ERP, content, jumlah cards,
row density dan native icon paths diadaptasi secara eksplisit.

## Perbedaan tak disengaja dan koreksi yang dilakukan

| Temuan | Koreksi | Bukti setelah koreksi |
|---|---|---|
| Draft memakai Inter dan radius8 | Font Geist dimuat; radius control10 mengikuti rendered Field, height32 tetap | Control overview, form desktop/mobile, font report |
| Lookup berdasarkan nama registry saja tidak memastikan Nova | Pisahkan block new-york-v4 dari source/render Nova | Source/preview mapping terdokumentasi |
| Breadcrumb terlalu longgar | Native Breadcrumb list gap6 dan separator14 | Header semua pilot |
| Submenu tanpa hierarchy rail; rail tablet tanpa active context | Tambahkan rail1; Master Data aktif pada collapsed Produk | Desktop Sidebar dan tiga tablet captures |
| Footer dashboard melewati viewport | Kurangi section height/gap yang tidak perlu | Footer data contoh terlihat di desktop/tablet |
| Pagination dan form actions terlalu jauh dari konten | Sesuaikan tinggi content group menurut isi | M01/M02 final captures |
| Panel varian tablet terpotong saat helper wrap | Right column memakai hug height | M02 tablet, panel lengkap |
| Tabel tablet terpotong tanpa affordance | Native Scroll Area + horizontal overflow dan scrollbar4 | A02/M01 tablet; status/actions berada di area scroll |
| Vector icon bounding boxes melewati slot | Normalisasi aspect ratio dan center dalam slot16/14 | Bounds audit tujuh frame:0 violations |
| Slot account footer 4 px terlalu lebar | Kurangi identity column agar menu icon tetap di footer | Sidebar final, bounds audit |
| Invalid Select menampilkan satuan terpilih | Ganti placeholder menjadi “Pilih satuan” pada invalid specimen | Field/state gallery |
| Dialog mempunyai ruang kosong dan footer tanpa grouping | Header/body104 + muted footer64 dengan border top | Gallery confirmation final |
| Ghost focus shadow mengikuti silhouette teks | Beri surface pada ghost focus specimen | Button focus screenshot final |
| Capture component set transparan sulit dinilai | Background card pada set, capture ulang | Component set PNGs final |
| Capture row menu pertama masih dalam fade; Dialog pertama memilih RTL demo | Tunggu/selesaikan animasi; ambil kembali default LTR | Official menu/Dialog PNG final |
| Alert terlalu tinggi untuk satu baris description | Padding8×10 dan content44; total62 | Alert gallery final |
| Empty memakai ikon24 tanpa media slot | Media32 muted/radius8 dengan outline16 | Empty gallery final |
| Lookup kosong/loading/denied menyisakan ruang besar | Popup pendek80; option-list tetap180 | Combobox gallery final |
| Skeleton terlalu bersudut | Radius mengikuti setengah tinggi placeholder | Control overview final |

Koreksi layout dilakukan sebelum capture ulang. Capture awal disimpan dengan
suffix `initial`; capture final bernama sesuai tabel di atas. Screenshot berhasil
dibuat bukan kriteria lulus: setiap final pilot, tablet dan mobile juga dilihat.

## Component/state QA

[Control overview](../designs/screenshots/v3-native-controls.png),
[state gallery](../designs/screenshots/v3-pilot-states.png), dan
[mobile navigation Sheet](../designs/screenshots/v3-mobile-navigation-sheet.png).

| Group | Native capture |
|---|---|
| Button / variants dan focus | [PNG](../designs/screenshots/v3-components-button.png) |
| Input / empty-filled-invalid-disabled | [PNG](../designs/screenshots/v3-components-input.png) |
| Badge / neutral-success-warning-destructive | [PNG](../designs/screenshots/v3-components-badge.png) |
| Checkbox / checked-indeterminate-focus | [PNG](../designs/screenshots/v3-components-checkbox.png) |
| Select | [PNG](../designs/screenshots/v3-components-select.png) |
| Sidebar / expanded-collapsed | [PNG](../designs/screenshots/v3-components-sidebar.png) |
| SidebarMenuButton | [PNG](../designs/screenshots/v3-components-sidebarmenubutton.png) |
| Field / default-invalid-disabled | [PNG](../designs/screenshots/v3-components-field.png) |
| Alert / error-partial-success | [PNG](../designs/screenshots/v3-components-alert.png) |
| Empty / no-data-no-results-access-denied | [PNG](../designs/screenshots/v3-components-empty.png) |
| Row actions / Read-Write-Delete permissions | [PNG](../designs/screenshots/v3-components-row-action-menu.png) |
| Lookup / options-no-results-loading-denied | [PNG](../designs/screenshots/v3-components-combobox-popover.png) |

Gallery juga memuat initial variants branch `hasVariant=true`, dengan SKU,
nama, harga pokok, harga jual dan stok minimum. Default create memakai false dan
SKU otomatis server; tidak ada harga yang berpura-pura tersimpan di jalur default.

## Kontras

Rasio relative luminance sRGB untuk pasangan warna solid native. Ini bukan klaim
audit WCAG menyeluruh; opacity/focus composites dan target keyboard tetap perlu
uji implementasi. Status dibedakan dengan label, tidak hanya warna.

| Foreground / background | Rasio |
|---|---:|
| #FFFFFF / #2F7657 | 5,45:1 |
| #FFFFFF / #245E45 | 7,60:1 |
| #1E2A24 / #F8FAF8 | 14,18:1 |
| #65746B / #FFFFFF | 4,93:1 |
| #65746B / #F8FAF8 | 4,70:1 |
| #1E2A24 / #E8F4ED | 13,17:1 |
| #166534 / #DCFCE7 | 6,49:1 |
| #B42318 / #FEF3F2 | 6,05:1 |

Candidate input outline #8B9A91 ditolak pada tahap token: 2,95:1 di putih dan
2,81:1 di canvas. Final memakai #7C8C82; border lebih kuat daripada default
shadcn adalah adaptasi kontras yang disengaja. Decorative border #DCE3DE bukan
satu-satunya batas input. Soft green #A8D9BD tidak dipakai untuk teks putih kecil.

## Editability, persistensi dan integrity checks

- Primary instance dipindah Default → Hover → Default: fill berubah dari
  #2F7657 ke #245E45 dan kembali; editable Label tetap terjaga.
- Field outer Label dan exposed nested Input Label berhasil diubah pada
  temporary test instances. Test instances dihapus sesudah assertion lulus.
- Main components, sets, nested instances, Card content slot dan color/size
  variable bindings diperiksa melalui MCP get_node/inspect_document dan archive
  read-only setelah save. Tidak dibuat raster UI layer.
- Document path diperiksa, disimpan tanpa dirty changes, ditutup tanpa force,
  dibuka ulang melalui attached MCP, lalu screenshot diambil kembali.
- Pixel RGBA ketiga desktop sama sebelum/sesudah reopen. **Ini membuktikan
  persistensi V3, bukan kesamaan pixel dengan halaman shadcn.**
- Bounds audit tujuh frame:0 overflow tak disengaja. Children Scroll Area yang
  melampaui viewport dikecualikan sebagai perilaku horizontal scrolling sengaja.
- V1 hash tetap `0ed77b74702240dbc8656587eabc642d7942b99d41a8fe516603a283122224dd`.
- V2 hash tetap `dc4d57f9dbcc549e2538e46cd76ab07976b3a0818884acb3e3a19a84e151ed13`.
- Kode aplikasi, arsitektur, database, API dan business rules tidak diubah.
  shadcn audit checklist juga dibaca; TS/import/dependency checks tidak berlaku
  karena tidak ada React/application code yang digenerate.

ID, counts, capture paths dan hasil checks ada pada
[manifest](../designs/design-system-v3-manifest.json). Semua file deliverable
tersimpan di workspace; FigCraft ditinggalkan pada page Desktop dengan A02
terpilih dan zoom ke frame tersebut.

## Masalah dan batasan yang masih ada

1. Kontrak existing sorting produk fixed A–Z; belum ada arbitrary server sort.
   Deskripsi string masih memakai validator @IsInt, sehingga pengubahan teks
   tidak dijanjikan pada pilot. Tidak ada backend fix di fase visual.
2. UI statis: belum diuji keyboard, screen reader, focus trap, actual tab/menu
   interaction, API integration, timeout/409 runtime, hardware atau reduced motion.
3. Mobile penuh hanya M02; A02/M01 direview desktop1440 dan tablet1024. Tidak
   diklaim bahwa seluruh breakpoint/browser telah lulus.
4. Font tersedia pada sesi QA tetapi tidak embedded. TTF dan OFL disertakan;
   load font kembali bila perangkat baru melaporkan missing Geist.
5. Exact visual comparison per-state seluruh katalog belum dilakukan; sumber
   visual resmi yang digunakan tercantum eksplisit di atas. Tooltip hanya body,
   dan backdrop blur overlay tidak direproduksi sebagai klaim fidelity.
6. BL01–BL09, API gaps, role provisioning dan unit inventory lain tetap terbuka.
   Tidak ada design approval rollout untuk semua 115 unit atau 249 komponen lama.

Pekerjaan berhenti setelah tiga pilot ini. Tidak ada publishing atau perubahan
aplikasi utama.
