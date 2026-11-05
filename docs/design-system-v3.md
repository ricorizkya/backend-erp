# Phase 3.6 — ERP design system V3

Status: **tiga pilot selesai sebagai desain statis; menunggu review visual pengguna**.
Tanggal: 2 November 2026. Stop pada A02, M01 dan M02; belum ada persetujuan rollout ERP.

## Scope dan sumber kebenaran

Redesign visual terpisah dari aplikasi. Hanya tiga screen inventory:

| ID | Pilot dan route | Permission / dependency |
|---|---|---|
| A02 | Workspace / ERP Dashboard, `/` | Auth; setiap section tambahan memerlukan read permission sumbernya |
| M01 | Daftar Produk, `/master/products` | master_data.read; create/edit master_data.write; deactivate master_data.delete |
| M02 | Produk create/edit, `/master/products/new`, `/master/products/:id/edit` | master_data.write dan read untuk lookup produk/kategori/UoM |

Baseline visual: [dashboard-01](https://ui.shadcn.com/blocks),
[sidebar-07](https://ui.shadcn.com/blocks/sidebar),
[Base Data Table](https://ui.shadcn.com/docs/components/base/data-table),
[Field](https://ui.shadcn.com/docs/components/base/field), dan
[semantic theming](https://ui.shadcn.com/docs/theming). Nova menjadi baseline
kontrol compact; komposisi block new-york-v4 bukan bukti Nova sudah dirender.
Detail bukti dan mapping ada di [component reference](shadcn-component-reference.md).

Requirements tetap bersumber dari [UX](ux-specification.md),
[inventory](screen-inventory.md), dokumentasi arsitektur/business rules
`project_documentation.md` dan `project_analysis.md`. Kontrak aktual mengungguli
dokumentasi teknis lama bila berbeda. DTO/service produk diperiksa read-only.

Tujuh template role tetap: admin, manager, staff_gudang, staff_produksi,
staff_pembelian, staff_penjualan, akuntan. Capability mengikuti union permissions
auth/me, bukan nama role. Tidak ada perubahan tenant isolation, auth, navigation
tree, workflow pengadaan/penjualan/manufaktur/QC/accounting, status dokumen,
database, API, maupun kode aplikasi. G01–G03 tetap GAP. BL01–BL09 tidak dianggap
selesai oleh redesign.

## Semantic tokens — native Light

Token berikut sudah dibuat sebagai native variables. Nilai dari brief dipertahankan;
nilai tambahan adalah proposal ERP, bukan salinan palette default shadcn.

| Token | Nilai | Pemakaian |
|---|---|---|
| background / foreground | #F8FAF8 / #1E2A24 | Canvas dan teks utama |
| card / card-foreground | #FFFFFF / #1E2A24 | Data surface |
| popover / popover-foreground | #FFFFFF / #1E2A24 | Menu dan overlay |
| primary / primary-foreground | #2F7657 / #FFFFFF | Aksi utama |
| primary-hover | #245E45 | Override ERP untuk hover |
| secondary / secondary-foreground | #EFF2F0 / #1E2A24 | Aksi pendamping netral |
| muted / muted-foreground | #EFF2F0 / #65746B | Surface sekunder dan helper |
| accent / accent-foreground | #E8F4ED / #1E2A24 | Selection/hover terbatas |
| soft-green | #A8D9BD | Accent terbatas; bukan teks putih kecil |
| border | #DCE3DE | Separator dekoratif; jangan menjadi satu-satunya batas kontrol |
| input | #7C8C82 | Batas kontrol lebih jelas, sudah diperiksa pada render |
| ring | #2F7657 | Focus; cek komposit opacity pada background aktual |
| destructive / destructive-foreground | #B42318 / #FFFFFF | Error dan aksi destruktif |
| destructive-subtle | #FEF3F2 | Background error |
| success / success-subtle | #166534 / #DCFCE7 | Success tersendiri, tetap memakai label/ikon |
| warning / warning-subtle | #92400E / #FFFBEB | Warning bila status domain memerlukannya |
| sidebar / sidebar-foreground | #F1F5F2 / #1E2A24 | Navigasi |
| sidebar-primary / sidebar-primary-foreground | #2F7657 / #FFFFFF | Aksi utama sidebar |
| sidebar-accent / sidebar-accent-foreground | #E8F4ED / #1E2A24 | Item aktif |
| sidebar-border / sidebar-ring | #DCE3DE / #2F7657 | Separator / focus |

Status produk aktif/nonaktif memakai badge netral dengan label, bukan semua
status dicat primary green. Tidak ada chart tokens aktif sampai chart diperlukan.
Radius final: control10, card/dialog12, checkbox4, badge pill. Font Geist
14/20 untuk body dan 24/32 semibold untuk page heading. Ukuran berasal dari
render/reference dan review native; detail ada di component reference.

## Komposisi tiga pilot

**A02 Workspace.** Gunakan inset shell, header/breadcrumb, heading dan aksi
kontekstual dari dashboard-01; sidebar dapat collapse mengikuti sidebar-07.
Identitas memakai tenantCode/email yang tersedia, tanpa nama perusahaan fiktif
sebagai data auth atau tenant switcher. Susun shortcut berizin dan tabel data
operasional dari sumber berizin. Tidak ada activity stream baru yang berpura-pura
memiliki audit endpoint. Ringkasan jumlah produk aktif dapat menggunakan meta.total
dari query produk dengan isActive=true; label dan scope harus jelas. Jangan
menjumlah pagination atau menampilkan global revenue/growth. Tidak ada chart
karena inventory A02 tidak mensyaratkannya. Denied/error bukan angka nol.

**M01 Produk.** Heading “Produk”, CTA “Tambah produk” bila write. Toolbar search
kode/nama, kategori, status aktif dan capability filters sesuai ProductFilterDto.
Kolom kode, nama, kategori, UoM dasar, capability dibeli/dijual/diproduksi, status,
row actions. Server pagination default20; tampilkan meta aktual. Urutan nama A–Z
tetap karena service tidak menerima sort parameter. Tidak ada bulk selection,
export atau drag reorder. Detail/edit/nonaktif mengikuti permission endpoint.
Desain row menu nonaktif memerlukan konfirmasi, bukan hard delete.

**M02 Produk.** Kelompok identitas (kode, nama, kategori), satuan
(base/purchase/sales), capability flags, dan variants awal bila hasVariant=true.
Kode required max100, nama required max255, tiga UoM required. Kode/hasVariant
tidak editable pada update. Category opsional. Create tanpa variant memakai
default variant server; jangan menggambar input harga yang akan diabaikan oleh
jalur tersebut. Variant eksplisit mengikuti SKU required dan harga/minStock
nonnegative. Create defaults dibeli=true, dijual=true, diproduksi=false,
hasVariant=false. Submit “Simpan produk”, secondary “Batal”; pending cegah
duplikasi. Tidak ada tombol “Simpan draft” karena produk bukan dokumen draft.

Deskripsi adalah gap existing: property bertipe string tetapi memakai @IsInt
pada CreateProductDto dan UpdateProductDto. Rancangan perlu menandai field ini
belum dapat dijanjikan bekerja untuk teks, mempertahankan informasi existing
secara read-only bila ada. Gap harus tetap terlihat dalam handoff; bukan alasan
menghilangkan requirement atau memperbaiki backend di fase visual ini.

Fixture ilustratif yang dipakai: tenantCode DEMO, email manager@example.test; produk
RM-PLT-001 “Pelat Baja SPCC 1 mm”, kategori Bahan Baku, satuan kg,
dibeli=true/dijual=false/diproduksi=false; produk FG-BRK-001 “Bracket L 40 mm”,
kategori Barang Jadi, satuan pcs, dibeli=false/dijual=true/diproduksi=true.
Semua merupakan fixture ilustratif, bukan hasil query database. Fixture daftar berisi delapan produk aktif, lima dapat dibeli, tiga dapat
diproduksi; pagination20, satu halaman. Form create memakai kode baru
RM-PLT-002; validation specimen memakai RM-PLT-001 yang sudah ada.

## State dan ukuran review

- Desktop1440×1000 menjadi target utama; tablet1024 dan mobile390 untuk review
  reflow pada tiga screen yang sama, bukan screen inventory tambahan.
- A02: loading, no capability, partial data error, default.
- M01: loading, no data, no filter result, default, error, resource denied,
  row menu. Deactivate confirmation hanya bila aksi digambar.
- M02: default create/edit, lookup loading/empty/denied/error, validation summary
  dan inline error, submitting, duplicate409, timeout outcome unknown.
- Error response yang tidak aman dipetakan ke field tetap di summary. Input
  dipertahankan pada gagal; tidak ada automatic mutation retry.
- Ponsel: form satu kolom, nav Sheet, toolbar wrap, tabel scroll internal. State
  visual tidak membuktikan keyboard, screen reader atau integrasi API bekerja.

## Artifact dan preservation

V1 dibaca sebagai archive: 9 pages, 6.289 nodes. V2: 13 pages, 9.273 nodes,
termasuk page V1 archive dan V2 foundations/pilots/states. Ini inspeksi struktur
JSON archive, bukan inspeksi renderer atau verifikasi semua instances.

| File | SHA-256 awal |
|---|---|
| designs/app-ui.figcraft | 0ed77b74702240dbc8656587eabc642d7942b99d41a8fe516603a283122224dd |
| designs/app-ui-v2.figcraft | dc4d57f9dbcc549e2538e46cd76ab07976b3a0818884acb3e3a19a84e151ed13 |

Target [app-ui-shadcn-v3.figcraft](../designs/app-ui-shadcn-v3.figcraft)
**sudah dibuat melalui FigCraft MCP attached mode**, disimpan dan dibuka ulang.
V1/V2 mempertahankan hash di atas. Tidak ada screenshot/image layer dalam
dokumen V3; text, vectors, auto layout, components dan instances tetap native.

| Page | Isi |
|---|---|
| 00 · Foundations & controls | Semantic variables, controls/variants, Sidebar, Field, Card slot, metric, table, feedback dan overlays |
| 01 · Pilot screens / Desktop | A02 Workspace, M01 Produk, M02 Tambah produk, 1440×1000 |
| 02 · States & responsive QA | Validation, lookup, feedback, permission variants, initial variants branch, tiga tablet1024 dan form mobile390 |

70 main components, 12 component sets, 234 instances dan 42 variables. Native
variant switching dan nested Field editing berhasil diperiksa. Bounds check
tidak menemukan overflow tak disengaja pada tujuh frame; Scroll Area horizontal
merupakan clipping sengaja. Capture desktop identik sebelum/sesudah reopen;
ini bukti persistensi, bukan klaim pixel-identical dengan shadcn.

[Manifest ID/verification](../designs/design-system-v3-manifest.json) dan
[token export](../designs/design-tokens-v3.json) berasal dari artifact native.

## Hasil visual comparison dan screenshot

Referensi resmi dirender lewat Chrome pada 1440×1000, Light, setelah font siap.
Screenshot native diperiksa side-by-side terhadap block/layout dan component
previews. Perbaikan mencakup Inter → Geist, radius8 → 10, compact32 controls,
breadcrumb gap6, submenu rail, active collapsed navigation, jarak pagination dan
action bar, clipping panel varian tablet, scroll affordance, icon bounds, serta
Dialog footer. [Visual QA](visual-qa-v3.md) mencatat bukti dan perbedaan disengaja.

- [A02 Workspace final](../designs/screenshots/v3-A02-workspace-1440.png)
- [M01 Produk final](../designs/screenshots/v3-M01-products-1440.png)
- [M02 Tambah produk final](../designs/screenshots/v3-M02-product-form-1440.png)

## Font dan batas handoff

[Geist variable TTF](../designs/fonts/Geist-Variable.ttf) disertakan bersama
[lisensi OFL](../designs/fonts/Geist-OFL.txt), dari repository Google Fonts.
Font dimuat ke sesi FigCraft; font report menunjukkan missing=0. Font tidak
embedded dalam file native. Di sesi/perangkat baru, bila missing font muncul,
muat TTF lewat `text.loadFont` atau pasang font tersebut sebelum memeriksa layout.

Ini desain statis, bukan aplikasi atau prototype interaktif lengkap. Hover,
focus, loading, validation dan permission adalah rancangan state yang dapat
diedit. Belum diuji keyboard/screen reader/focus trap, browser interaction,
integrasi API, atau hardware nyata. Mobile penuh baru direview untuk M02;
A02/M01 direview pada desktop dan tablet. Unknown outcome/409 dijaga dalam
kontrak UX, bukan telah disimulasikan lewat runtime.

Sorting server tetap A–Z dan gap validator deskripsi tetap ada. Tidak ada
business rule, role/permission, source aplikasi, API atau database yang diubah.
Stop setelah tiga pilot; 115 unit inventory dan library lama tidak direbuild.
