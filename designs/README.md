# ERP Industrial — Design System v1

Phase 3 menambahkan lima pilot screen inventory pada page 06–08 tanpa mengubah
enam page design system awal. Terdapat 29 frame default/state/tablet dan empat
komposisi row tambahan. Lihat [progress dan screenshot manifest](../docs/ui-design-progress.md)
untuk status, node ID, asumsi, serta hasil QA. Backup sebelum Phase 3 tersedia di
[backups/app-ui.before-phase3.figcraft](backups/app-ui.before-phase3.figcraft).

Artifact utama: [app-ui.figcraft](app-ui.figcraft), dibuat langsung pada canvas
FigCraft Desktop melalui MCP attached mode menggunakan workflow `design_system`.

Sumber: [UX specification](../docs/ux-specification.md),
[screen inventory](../docs/screen-inventory.md), dan
[frontend design system](../docs/frontend-design-system.md).

## Isi canvas

| Page | Isi |
|---|---|
| 00 · Foundations | Palette charcoal–white–amber, semantic colors, typography, spacing, radius, elevation, layout grid |
| 01 · Controls | Button, field, select, textarea, search, currency, quantity, checkbox, radio, switch |
| 02 · Feedback & Overlays | Badge, card dengan content slot, toast, dialog, modal, spinner, skeleton, enam feedback states |
| 03 · Navigation | Sidebar penuh/collapsed, navigation item, icon, topbar, tabs |
| 04 · ERP Domain | Document header, line items, allocation, invoice totals, journal balance, MRP states, bulk approval, operation tracker, QC, stock count, BOM, lookup states |
| 05 · Responsive QA | Harness komponen pada 375, 768, 1024, 1440 px; dialog dan toast pada ponsel |

Komponen menggunakan auto layout, native components/instances, variants,
text/boolean/instance-swap properties, serta variable bindings. Koleksi semantic
mempunyai mode Light dan Sidebar; ini bukan rancangan seluruh aplikasi dark mode.
Ekspor [design-tokens.json](design-tokens.json) berasal dari variable native canvas.

## Font

IBM Plex Sans Regular/Medium/SemiBold dan IBM Plex Mono Regular tersedia di
[fonts](fonts), bersama lisensi OFL. Font sudah dimuat pada sesi Desktop saat
review. Jika sesi baru melaporkan missing fonts, muat berkas TTF tersebut melalui
FigCraft (`text.loadFont` dengan path absolut) atau pasang font pada sistem.

## Review dan batas verifikasi

Review menggunakan screenshot dan `inspect_document` setelah perbaikan layout.
Hasil akhir: 6 pages, 249 main components, 19 component sets, 149 instances,
dan 48 styles. Pemeriksaan bounds tidak menemukan overflow tak disengaja;
focus ring dan clipping tabel pada viewport diperlakukan sebagai perilaku sengaja.
FigCraft melaporkan tidak ada missing font pada sesi review.

Data transaksi adalah ilustrasi. Permission dan state mengikuti dokumen UX;
supplier/customer lookup yang belum memiliki API ditampilkan sebagai dependency.
Tidak dibuat seluruh halaman aplikasi atau perubahan business rules.

Canvas ini belum memverifikasi keyboard navigation, screen reader, focus trap,
animasi, integrasi API, atau responsivitas dalam browser. Implementasi frontend
harus menguji perilaku tersebut, termasuk horizontal scroll tabel dan validasi
server sebelum menampilkan keberhasilan transaksi.
