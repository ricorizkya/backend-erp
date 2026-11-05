# Design System Frontend ERP — Industrial v1

Dokumen ini merupakan spesifikasi desain untuk implementasi frontend ERP v1.
Keputusan visual yang dipilih: **sidebar charcoal, area kerja putih, dan aksen amber**.
Dokumen ini tidak menyatakan bahwa komponen frontend sudah diimplementasikan.

## 1. Arah visual dan prinsip desain

Design system menggunakan sidebar charcoal, area kerja putih, dan aksen amber.
Karakternya tegas, rapi, dan berorientasi pada pekerjaan operasional manufaktur.

Fondasi penggunaannya:

- **Informasi mudah dipindai:** hierarki judul, angka, status, dan tindakan terlihat jelas.
- **Padat tetapi terbaca:** tabel dan formulir menampung banyak data tanpa mengecilkan seluruh antarmuka.
- **Amber menunjukkan tindakan utama:** dipakai secara terukur pada tombol utama, pilihan aktif, dan fokus navigasi.
- **Warna mempunyai makna konsisten:** keberhasilan, kesalahan, peringatan, dan proses berjalan dibedakan.
- **Pola berulang lintas modul:** Purchase Order, Sales Order, Work Order, dan invoice menggunakan struktur halaman yang seragam.

Default v1 adalah tampilan terang dengan navigasi gelap. Desktop menjadi acuan
utama; seluruh komponen tetap mempunyai aturan tablet dan mobile.

## 2. Color palette
### 2.1 Neutral — struktur dan keterbacaan

| Token | Warna | Penggunaan |
|---|---|---|
| `neutral.0` | `#FFFFFF` | Card, form, tabel, dialog |
| `neutral.50` | `#FAFAFA` | Latar aplikasi |
| `neutral.100` | `#F4F4F5` | Header tabel, hover ringan, disabled background |
| `neutral.200` | `#E4E4E7` | Divider dan border dekoratif |
| `neutral.300` | `#D4D4D8` | Teks navigasi sekunder pada sidebar |
| `neutral.400` | `#A1A1AA` | Teks pendukung pada sidebar, disabled text |
| `neutral.500` | `#71717A` | Placeholder, ikon sekunder, border input |
| `neutral.600` | `#52525B` | Teks sekunder pada area putih |
| `neutral.700` | `#3F3F46` | Border pada sidebar |
| `neutral.800` | `#27272A` | Hover item sidebar |
| `neutral.900` | `#18181B` | Sidebar, teks utama, foreground tombol amber |
| `neutral.950` | `#09090B` | Penekanan sangat kuat |

Border dekoratif boleh menggunakan `neutral.200`. Batas input yang diperlukan
untuk mengenali kontrol menggunakan `neutral.500`, sehingga tetap terlihat jelas.

### 2.2 Brand — industrial amber

| Token | Warna | Penggunaan |
|---|---|---|
| `brand.50` | `#FFFBEB` | Background pilihan ringan |
| `brand.100` | `#FEF3C7` | Highlight |
| `brand.200` | `#FDE68A` | Penekanan ringan |
| `brand.300` | `#FCD34D` | Teks dan indikator aktif pada sidebar |
| `brand.400` | `#FBBF24` | Tombol primary |
| `brand.500` | `#F59E0B` | Hover tombol primary |
| `brand.600` | `#D97706` | Pressed tombol primary |
| `brand.700` | `#B45309` | Focus ring pada area terang |
| `brand.800` | `#92400E` | Teks amber pada background terang |
| `brand.900` | `#78350F` | Penekanan brand yang gelap |

Tombol amber menggunakan **teks charcoal `#18181B`**. Hasil perhitungan kontras
pasangan default tersebut sekitar **10,61:1**.

Untuk teks link di area putih gunakan biru `info.foreground`; amber tetap
difokuskan pada tindakan dan pilihan aktif.

### 2.3 Semantic colors

| Makna | Foreground | Background | Penggunaan |
|---|---|---|---|
| Success | `#166534` | `#F0FDF4` | Completed, posted, paid, QC passed |
| Warning | `#9A3412` | `#FFF7ED` | Perlu perhatian, mendekati jatuh tempo |
| Danger | `#B91C1C` | `#FEF2F2` | Gagal, stok tidak cukup, QC rejected |
| Info | `#1D4ED8` | `#EFF6FF` | Running, informasi proses |
| Planning | `#6D28D9` | `#F5F3FF` | Proposed planned order dan perencanaan |
| Neutral | `#52525B` | `#F4F4F5` | Draft, queued, cancelled |

**Warning menggunakan orange**, sehingga berbeda dari amber yang menjadi
identitas tombol utama.

Setiap status wajib mempunyai label teks dan ikon yang sesuai. Warna tidak
menjadi satu-satunya pembeda.

### 2.4 Semantic tokens aplikasi

Komponen menggunakan token berdasarkan fungsi, bukan hex langsung.

| Token | Nilai |
|---|---|
| `background.canvas` | `neutral.50` |
| `background.surface` | `neutral.0` |
| `background.subtle` | `neutral.100` |
| `text.primary` | `neutral.900` |
| `text.secondary` | `neutral.600` |
| `text.muted` | `neutral.500` |
| `border.subtle` | `neutral.200` |
| `border.control` | `neutral.500` |
| `action.primary.background` | `brand.400` |
| `action.primary.foreground` | `neutral.900` |
| `focus.light` | `brand.700` |
| `focus.dark` | `brand.300` |
| `sidebar.background` | `neutral.900` |
| `sidebar.active.background` | `#3A2B12` |
| `sidebar.active.foreground` | `brand.300` |

## 3. Typography

### 3.1 Font family

**Font utama: IBM Plex Sans**

Digunakan untuk navigasi, judul, formulir, tabel, dan laporan. Karakter hurufnya
mendukung arah industrial dan teknis yang dipilih.

**Font pendamping: IBM Plex Mono**

Digunakan terbatas untuk nomor dokumen, SKU, batch, referensi, dan kode teknis.
Nilai keuangan tetap menggunakan Plex Sans dengan angka tabular agar kolom mudah
dibandingkan.

IBM menyediakan keluarga Sans dan Mono beserta lisensi OFL melalui sumber
resminya. Font akan di-host bersama aplikasi menggunakan WOFF2 dan
`font-display: swap`.
[IBM Design Language — Typeface](https://www.ibm.com/design/language/typography/typeface/)

Fallback:

```css
--font-sans: "IBM Plex Sans", system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
```

### 3.2 Type scale

Ukuran berikut adalah acuan visual; implementasi menggunakan `rem` dengan root
default `16px`.

| Token | Size / line height | Weight | Penggunaan |
|---|---|---|---|
| `display` | 36 / 44 px | 600 | Halaman ringkasan khusus |
| `kpi` | 32 / 40 px | 600 | Angka utama dashboard |
| `heading.page` | 28 / 36 px | 600 | Judul halaman |
| `heading.section` | 22 / 30 px | 600 | Bagian utama |
| `heading.card` | 18 / 26 px | 600 | Judul panel |
| `body.large` | 16 / 24 px | 400 | Penjelasan penting |
| `body.default` | 14 / 20 px | 400 | Isi aplikasi |
| `label` | 14 / 20 px | 500 | Label input dan tombol |
| `table.default` | 14 / 20 px | 400 | Tabel standar |
| `table.compact` | 13 / 20 px | 400 | Tabel compact |
| `caption` | 12 / 16 px | 400 | Helper text dan metadata |
| `code` | 13 / 20 px | 400 | Nomor dokumen dan SKU |

Aturan:

- Weight utama: `400`, `500`, dan `600`.
- Huruf kapital penuh hanya untuk label kelompok pendek; bukan judul halaman.
- Teks penting, error, nominal, dan data transaksi tidak menggunakan ukuran di bawah `12px`.
- Kolom numerik menggunakan `font-variant-numeric: tabular-nums`.
- Input pada mobile menggunakan font minimal `16px`.

## 4. Spacing, rounding, border, dan elevation

### 4.1 Spacing

Gunakan grid dasar **4px**.

| Token | Nilai | Penggunaan umum |
|---|---:|---|
| `space.0` | 0 px | Tanpa jarak |
| `space.1` | 4 px | Ikon dengan label kecil |
| `space.2` | 8 px | Elemen dalam satu kelompok |
| `space.3` | 12 px | Padding kontrol dan sel tabel |
| `space.4` | 16 px | Jarak field dan isi panel |
| `space.5` | 20 px | Variasi padding |
| `space.6` | 24 px | Padding card dan gap kolom |
| `space.8` | 32 px | Jarak antarseksi |
| `space.10` | 40 px | Pemisahan bagian besar |
| `space.12` | 48 px | Empty state |
| `space.16` | 64 px | Area halaman khusus |

Nilai `2px` dibolehkan untuk penyesuaian ikon dan indikator. Border menggunakan `1px`.

Default:

- Padding halaman desktop: `24px`.
- Padding halaman mobile: `16px`.
- Padding card: `24px`; versi compact `16px`.
- Gap field formulir: `16px`.
- Gap antarseksi: `32px`.
- Gap antartombol: `8px`.

### 4.2 Corner radius

| Token | Nilai | Penggunaan |
|---|---:|---|
| `radius.none` | 0 px | Struktur tabel |
| `radius.xs` | 2 px | Indikator kecil |
| `radius.sm` | 4 px | Badge, checkbox |
| `radius.md` | 6 px | Input, button, menu item |
| `radius.lg` | 8 px | Card, dropdown |
| `radius.xl` | 12 px | Dialog |
| `radius.full` | 9999 px | Avatar dan indikator bundar |

Karakter industrial dipertahankan melalui radius moderat. Tombol utama
menggunakan radius `6px`.

### 4.3 Border dan shadow

- Border default: `1px solid`.
- Card standar: border tipis tanpa shadow.
- Dropdown: shadow sedang.
- Dialog dan drawer: shadow lebih kuat.

```css
--shadow-sm: 0 1px 2px rgb(9 9 11 / 0.06);
--shadow-md: 0 4px 12px rgb(9 9 11 / 0.10);
--shadow-lg: 0 12px 32px rgb(9 9 11 / 0.16);
```

## 5. Layout dan responsive behavior

### 5.1 Application shell

- Sidebar desktop: `248px`.
- Sidebar collapsed: `72px`.
- Topbar: `56px`.
- Lebar konten maksimum: `1600px`.
- Formulir sederhana: maksimum `960px`.
- Halaman transaksi dengan line items memakai seluruh lebar konten.

Sidebar memuat kelompok:

1. Overview.
2. Master Data.
3. Inventory.
4. Procurement.
5. Sales.
6. Manufacturing.
7. Quality Control.
8. Finance.
9. Settings.

Menu yang terlihat mengikuti permission pengguna. Identitas tenant selalu
terlihat di application shell.

Item aktif menggunakan background charcoal kecokelatan, teks amber, dan
indikator kiri `3px`.

### 5.2 Breakpoints

| Lebar viewport | Perilaku |
|---|---|
| `< 768px` | Sidebar drawer, formulir satu kolom |
| `768–1023px` | Sidebar drawer, formulir hingga dua kolom |
| `1024–1279px` | Sidebar collapsed secara default |
| `≥ 1280px` | Sidebar penuh |
| `≥ 1600px` | Konten dibatasi maksimum `1600px` |

Pada mobile:

- Drawer navigasi `280px`, dibatasi lebar viewport.
- Toolbar dapat membungkus ke baris berikutnya.
- Tabel lebar mempunyai scroll horizontal dalam container.
- Kolom identitas dan aksi penting tetap mudah dijangkau.
- Dialog besar menjadi panel hampir memenuhi layar.
- Footer tindakan tetap dapat diakses tanpa menutupi field terakhir.

### 5.3 Struktur halaman transaksi

Urutan standar:

**Breadcrumb → judul dan nomor dokumen → status dan tindakan → informasi utama →
line items → ringkasan total → catatan dan riwayat.**

Detail dokumen memakai halaman penuh. Dialog digunakan untuk tindakan singkat;
drawer untuk preview dan pemeriksaan cepat.

## 6. Aturan komponen

### 6.1 Density dan ukuran kontrol

| Elemen | Standard | Compact | Touch |
|---|---:|---:|---:|
| Button/input/select | 40 px | 32 px | 44 px |
| Icon button | 40 × 40 px | 32 × 32 px | 44 × 44 px |
| Table row minimum | 48 px | 40 px | 56 px |
| Badge noninteraktif | 22 px | 22 px | 24 px |

Density default adalah **standard**. Compact tersedia untuk halaman tabel melalui
preferensi pengguna. Touch menggunakan ukuran kontrol yang lebih besar.

### 6.2 Buttons

| Variant | Tampilan | Contoh |
|---|---|---|
| Primary | Amber + teks charcoal | Simpan, Buat PO |
| Secondary | Putih + border abu | Ekspor, Filter |
| Ghost | Transparan | Aksi tambahan |
| Destructive | Merah + teks putih | Hapus, Batalkan dokumen |
| Link | Biru dengan indikator interaksi | Buka referensi |

Aturan:

- Maksimum satu primary action per kelompok tindakan.
- Ikon `16px`, gap ikon–label `8px`.
- Loading mempertahankan lebar tombol dan memblokir submit berulang.
- Aksi destructive memakai label spesifik, misalnya **Batalkan Work Order**.
- Konfirmasi menyebut nomor dokumen dan konsekuensi tindakan.

### 6.3 Form controls

Komponen wajib:

- Text input, textarea, password.
- Number, currency, quantity.
- Select dan searchable combobox.
- Date picker dan date range.
- Checkbox, radio, switch.
- File upload.
- Lookup relasi: produk, supplier, customer, gudang.

Aturan:

- Label permanen berada di atas field.
- Placeholder tidak menggantikan label.
- Required ditandai `*` dengan penjelasan pada formulir.
- Error tampil dekat field, disertai ikon dan pesan yang dapat ditindaklanjuti.
- Error submit juga dirangkum di bagian atas formulir.
- Nilai yang sudah diisi dipertahankan setelah kegagalan request.
- Perubahan yang belum disimpan mendapat konfirmasi sebelum pengguna meninggalkan halaman.
- Disabled dan read-only memiliki tampilan berbeda; data read-only tetap dapat disalin.

### 6.4 Data tables

Struktur standar:

**Judul → search/filter → active filter chips → tabel → pagination.**

Aturan:

- Header menggunakan `neutral.100`.
- Header tabel tetap terlihat saat container di-scroll.
- Kolom teks rata kiri; nilai, kuantitas, dan nominal rata kanan.
- Header kolom numerik mengikuti alignment datanya.
- Baris hover menggunakan `neutral.50`.
- Baris terpilih menggunakan `brand.50` dan checkbox aktif.
- Nominal, status, dan kode penting tidak dipotong diam-diam.
- Data panjang yang dipotong menyediakan cara membuka nilai lengkap.
- Sorting mempunyai indikator arah yang jelas.
- Pilihan page size: `25`, `50`, `100`; default `25`.
- Bulk action hanya muncul ketika ada pilihan.
- Empty state membedakan **belum ada data** dan **hasil filter kosong**.
- Loading menggunakan skeleton; error menyediakan tindakan coba lagi.

Tabel line items mendukung add/remove row, pencarian produk, quantity, satuan,
harga, diskon, pajak, dan subtotal sesuai modul.

### 6.5 Status badges

| Kelompok status | Tampilan |
|---|---|
| Draft, pending/queued | Neutral + ikon dokumen/jam |
| Proposed | Violet + ikon perencanaan |
| Running | Biru + indikator proses |
| Confirmed/approved | Biru atau hijau sesuai makna bisnis |
| Completed, posted, paid | Hijau + check |
| Partial | Biru + label “Sebagian” |
| Failed, failed permanent | Merah + ikon error |
| Cancelled | Neutral + ikon pembatalan |
| Overdue | Orange/merah + teks jatuh tempo |

Mapping ditetapkan per enum API. Status berbeda seperti `failed` dan
`failed_permanent` tetap mempunyai label yang berbeda.

### 6.6 Dialog, drawer, dan feedback

- Dialog kecil: `400px`.
- Dialog standar: `560px`.
- Dialog besar: `800px`.
- Drawer preview desktop: `480px`.
- Dialog memiliki judul, deskripsi, dan footer tindakan.
- Focus dikunci pada dialog aktif dan kembali ke pemicu setelah ditutup.
- Toast sukses menghilang setelah `5 detik`; error penting tersedia sebagai pesan persisten di halaman.
- Tooltip hanya untuk informasi tambahan; instruksi wajib tetap terlihat.
- Banner dipakai untuk kondisi yang memengaruhi halaman, seperti periode akuntansi tertutup.

### 6.7 Icons dan visualisasi data

- Gunakan satu keluarga ikon: **Lucide**, gaya outline.
- Ukuran: `16px` pada kontrol, `20px` pada navigasi, `24px` untuk penekanan.
- Icon-only button wajib mempunyai accessible name.
- Grafik mengutamakan bar dan line chart.
- Warna seri: biru, violet, hijau, orange, dan charcoal.
- Amber digunakan untuk highlight seri yang sedang dipilih.
- Grafik menyediakan label, unit, tooltip, dan alternatif tabel data.

## 7. Pola khusus ERP

### 7.1 Angka, tanggal, dan kode

- Locale default: `id-ID`.
- Currency default: IDR, contoh `Rp1.250.000,00`.
- Quantity ditampilkan hingga `4` desimal sesuai kebutuhan datanya.
- Nilai edit mempertahankan presisi yang dikirim API.
- Total resmi berasal dari backend; hasil kalkulasi frontend diberi fungsi sebagai preview.
- Kosong, nol, dan nilai tidak tersedia ditampilkan berbeda.
- Business date ditampilkan sebagai tanggal kalender tanpa pergeseran timezone.
- Timestamp ditampilkan dalam `Asia/Jakarta` dengan penanda WIB.
- Nomor dokumen dan SKU memakai Plex Mono serta menyediakan copy action.

### 7.2 Tindakan transaksi

- Confirm, post, payment, dan cancel menunggu konfirmasi server sebelum status UI berubah.
- Konflik `409` menampilkan penjelasan dan memuat ulang status dokumen.
- Form payment menampilkan outstanding sebelum input jumlah.
- Pembatalan menampilkan dampak terhadap stok, invoice, atau dokumen terkait sesuai informasi API.
- MRP run menampilkan status, waktu mulai, durasi, retry, dan alasan gagal.
- Tenant tidak dibedakan hanya melalui warna; nama dan kode tenant ditampilkan eksplisit.

### 7.3 Print

- Invoice dan dokumen operasional memakai layout A4.
- Margin default `12mm`.
- Sidebar, topbar, tooltip, dan tombol tidak dicetak.
- Header tabel diulang pada halaman berikutnya.
- Nominal dan total tidak terpotong.
- Ukuran teks cetak default `11pt`.
- Laporan lebar menyediakan layout landscape.

## 8. Aksesibilitas, motion, dan delivery

### 8.1 Aksesibilitas

Target implementasi adalah **WCAG 2.2 AA**.

- Kontras teks normal minimal `4,5:1`.
- Kontras indikator kontrol yang diperlukan minimal `3:1`.
- Navigasi keyboard, label field, focus management, dan pesan error diuji.
- Focus ring: `2px`, offset `2px`; amber gelap pada area putih dan amber terang pada sidebar.
- Target pointer desktop minimal `24 × 24px`; kontrol touch menggunakan `44 × 44px`.
- Zoom dan perubahan ukuran teks tidak menghilangkan tindakan utama.
- Tabel dua dimensi boleh scroll di containernya; shell halaman tetap responsif.

Acuan: [W3C — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum),
[Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
dan [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### 8.2 Motion dan layering

- Hover/focus: `120ms`.
- Dropdown: `180ms`.
- Dialog/drawer: `240ms`.
- Animasi menghormati `prefers-reduced-motion`.
- Skeleton tidak menggunakan efek berkedip.

Layer:

| Layer | Nilai |
|---|---:|
| Base | 0 |
| Sticky table/toolbar | 10 |
| Application navigation | 20 |
| Dropdown | 30 |
| Overlay | 40 |
| Dialog/drawer | 50 |
| Popover dalam dialog | 60 |
| Toast | 70 |
| Tooltip | 80 |

### 8.3 Struktur token dan komponen

Implementasi mengikuti stack yang sudah dipilih: React + Vite, TypeScript,
Tailwind, dan shadcn/ui.

Token dibagi menjadi:

1. **Primitive:** nilai warna, ukuran, spacing, radius.
2. **Semantic:** surface, text, border, action, status.
3. **Component:** ukuran dan variasi button, input, tabel, dan navigasi.

Komponen menyediakan variasi eksplisit seperti `variant`, `size`, `density`, dan
`state`. Status bisnis diterjemahkan melalui mapping tersendiri agar tidak
tercampur dengan state interaksi seperti hover atau disabled.

### 8.4 Acceptance criteria design system

Design system siap digunakan ketika:

- Token warna, typography, spacing, radius, shadow, motion, dan layer tersedia secara terpusat.
- Semua komponen memiliki contoh default, hover, focus, disabled, loading, dan error yang relevan.
- Tiga halaman referensi tersedia: **daftar inventory**, **editor PO/SO**, dan **detail MRP run**.
- Halaman referensi diperiksa pada lebar `375`, `768`, `1024`, dan `1440px`.
- Tabel tetap terbaca dalam standard dan compact density.
- Form dapat diselesaikan dengan keyboard.
- Print invoice tidak memotong line items maupun total.
- Komponen tidak menggunakan warna hex atau ukuran ad hoc di luar token.

Spesifikasi ini menjadi fondasi visual frontend ERP v1. Asumsi yang ditetapkan
adalah Bahasa Indonesia, IDR, timezone WIB, desktop sebagai acuan utama, dan satu
tema terang dengan sidebar charcoal.
