# Phase 3.6 — shadcn component reference

Status: **implemented untuk tiga pilot; native canvas sudah direview**.
Tanggal: 2 November 2026. Arah utama: shadcn Nova compact enterprise UI.
`ui-taste` dipakai untuk polish setelah referensi resmi ditetapkan.

## Referensi yang benar-benar digunakan

| Referensi resmi | Bukti yang diperiksa | Penggunaan |
|---|---|---|
| [dashboard-01 / Blocks](https://ui.shadcn.com/blocks) | Metadata dan kode lengkap melalui shadcn MCP; [render resmi 1440×1000](../designs/references/v3-dashboard-01-official-1440.png) | Inset shell, sidebar 288 px, header 48 px, summary metrics, hierarchy menuju tabel |
| [sidebar-07](https://ui.shadcn.com/blocks/sidebar) | Kode page, AppSidebar, NavMain, NavUser, TeamSwitcher melalui MCP; [render resmi](../designs/references/v3-sidebar-07-official-1440.png) | Menu groups, submenu rail, collapsed navigation, account footer |
| [Base Data Table](https://ui.shadcn.com/docs/components/base/data-table) | Dokumentasi composition; [preview](../designs/references/v3-data-table-official-1440.png) dan [row menu terbuka](../designs/references/v3-data-table-row-menu-official-1440.png) | Search/filter, bordered table, row actions, pagination |
| [Base Field](https://ui.shadcn.com/docs/components/base/field) | Kode `field-demo` melalui MCP, Base Field/Input/Button source; [preview Nova](../designs/references/v3-field-nova-official-1440.png) dan computed dimensions | Label di atas, control 32 px, field grouping dan helper/error |
| [Base Dialog](https://ui.shadcn.com/docs/components/base/dialog) | [Preview default LTR terbuka](../designs/references/v3-dialog-official-1440.png) | Title/description, compact padding, footer terpisah |
| [Alert](https://ui.shadcn.com/docs/components/base/alert), [Empty](https://ui.shadcn.com/docs/components/base/empty) | [Alert preview](../designs/references/v3-alert-official-1440.png), [Empty preview](../designs/references/v3-empty-official-1440.png) | Compact callout dan anatomy media/title/description/actions |
| [Combobox](https://ui.shadcn.com/docs/components/base/combobox), [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip) | [Combobox open](../designs/references/v3-combobox-official-1440.png), [Tooltip open](../designs/references/v3-tooltip-official-1440.png) | Popup sizing, typography, inverse tooltip; dibuka dengan mouse input CDP |
| [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton), [Sheet](https://ui.shadcn.com/docs/components/base/sheet) | [Skeleton preview](../designs/references/v3-skeleton-official-1440.png), [Sheet open](../designs/references/v3-sheet-official-1440.png) | Rounded placeholder dan edge panel/overlay anatomy |
| [Components](https://ui.shadcn.com/docs/components), [Theming](https://ui.shadcn.com/docs/theming) | Katalog dan semantic token model | Anatomy dan pasangan warna foreground/background |
| [Nova stylesheet resmi](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-nova.css) | Source rules untuk kontrol, field, card, sidebar, table, feedback dan overlays | Compact spacing, sizes, variants/states |

Registry MCP mengembalikan block dan contoh **new-york-v4**. Permintaan
`@shadcn/style-nova` menghasilkan NOT_FOUND, sehingga ukuran compact ditelusuri
ke stylesheet Nova dan render dokumentasi Base UI. Komposisi dashboard-01 tidak
diklaim sebagai render dashboard Nova. Screenshot di atas benar-benar dibuka dan
diinspeksi; riset sekarang tidak terbatas pada teks/kode.

Capture referensi memakai Chrome headless, Light, viewport CSS 1440×1000,
device scale 1, setelah font siap. Metadata URL, judul, control bounds, typography,
padding dan radius disimpan dalam JSON dengan basename yang sama dengan PNG.
Animasi menu/dialog diselesaikan sebelum capture final. Source upstream memakai
`main`/URL live; ini snapshot tanggal pengerjaan, bukan dependency yang dipin.

## Temuan ukuran Nova dari source dan render

Source Nova menetapkan kontrol default 32 px, Button besar 36 px, Badge 20 px,
Checkbox 16 px, Field gap 8 px, FieldGroup 20 px dan nested group 16 px.
Table memakai teks 14 px, header 40 px dan cell padding 8 px. Render Field
memastikan font Geist 14/20, Input/Select/Button tinggi 32 px, padding input
4×10 px, dan radius kontrol **10 px** pada theme preview. Karena itu draft
radius 8 px dan font Inter diganti. Nilai pixel ini bukan diturunkan hanya dari
kata `rounded-lg` atau nama Nova.

## Mapping visual dan composition yang dibuat

Color names di bawah mengacu pada [semantic tokens V3](design-system-v3.md).
Dimensi tanpa qualifier adalah dimensi native yang dibuat. Tidak ada klaim
seluruh komponen identik pixel dengan default warna hitam/putih shadcn.

| Komponen / visual anatomy | Dimensi dan spacing | Typography | Colors dan border | Radius | Variants / states | Ikon dan alignment | Composition / responsiveness |
|---|---|---|---|---|---|---|---|
| Sidebar / menu | Expanded 288, rail 64; menu 32; padding x16; submenu indentation dan rail1 | Geist14/20; group12/16 | sidebar, sidebar-accent aktif; icon muted | Menu10; mark8 | Workspace expanded; Produk expanded/collapsed; menu default/hover/active/focus | Native outline16, centered; label gap8 | Header + groups/submenu + footer; tablet rail; mobile Sheet288 |
| Header / Breadcrumb | Header48; list gap6; separator vertical16 | 14/20 | card, border bawah1; ancestors muted/current foreground | Inset12 | Current page dan ancestor | Trigger16; breadcrumb separator14 | Native auto-layout frames; ancestor disusun sesuai konteks screen |
| Tabs | Track36; active trigger30; gap4/padding3 | 14/20 medium; count12 | muted track/card selected | Track10/trigger8 | Produk aktif dipilih, nonaktif tersedia sebagai composition | Tanpa ikon; count sejajar baseline | Native frame composition pada M01, bukan atomic component set |
| Separator / Scroll Area | Separator1; table viewport tablet902×434; scrollbar4 | N/A | border; muted track/foreground thumb | Thumb2 | No overflow / horizontal overflow | N/A | Native clipping + overflow horizontal; scrollbar affordance native shapes |
| Button | 32; px10; gap6 | 14/20 medium | primary/on-primary; outline border; ghost; destructive-subtle | 10 | Primary default/hover/focus/disabled/loading; outline/ghost/destructive default/hover/focus/disabled | Icon target16; spinner visual pada loading | Auto layout; editable Label; fixed desktop actions, mobile widths menyesuaikan |
| Card / metric | Card padding16; metric132 tinggi; slot card352×144 | Title16/24; metric30/36; caption12/16 | card + hairline border1 | 12 | Content slot; metric text properties | Ikon opsional dalam slot | Generic Card dengan native slot; metric instances tiga kolom |
| Badge | 20 tinggi; px8; gap4 | 12/16 medium | Neutral, outline, success, warning, destructive memakai tokens masing-masing | Pill | Lima tone; editable Label | Tidak ada ikon wajib | Width disesuaikan label; status aktif memakai neutral |
| Avatar / Tooltip | Avatar32; tooltip112×28, px8 | Initial12/16; tooltip12/16 | Avatar muted; tooltip foreground/on-primary | Avatar circle; tooltip6 | Avatar fallback; tooltip body | Initial centered | Avatar adalah nested frame Sidebar; Tooltip main component terpisah; arrow tidak dimodelkan |
| Dropdown / row actions | Menu200; padding4; item32 | 14/20 | popover/border; destructive text hanya aksi nonaktif | Menu10/item6 | Read, Write, Delete permission variants | Row trigger16 dalam target32 | Manager: lihat/edit; delete variant hanya admin/capability delete |
| Skeleton | Title180×20; cell120×14 | N/A | muted | Pill | Dua skeleton slots | N/A | Reusable primitives; bukan runtime loading animation |
| Field | Gap8; normal60 tinggi, invalid84; lebar320 baseline | Label14/20 medium; error12/16 | foreground, destructive invalid | Wrapper tanpa border | Input default/invalid/disabled; Select default/invalid | Mengikuti nested control | Editable Label/Message; nested Input/Select diekspos; dipakai enam kali pada form desktop |
| Input | 32; px10 | Desktop14/20; mobile16/24 | card, input outline; ring/destructive states | 10 | Empty/filled/focus/invalid/disabled | Konten center vertically | Nested reusable instance; width mengikuti Field |
| Select | 32; px10 | 14/20 | card/input; muted value/placeholder pada baseline control | 10 | Default/focus/invalid/disabled | Chevron sejajar kanan | Default trigger digunakan filters, pagination dan form; lookup panjang punya Combobox composition |
| Combobox popover | Options320×180; short states320×80; padding8; search32; option32/gap8 | 14/20 | popover, input, accent highlighted | Popup10/item6 | Options/no-results/loading/denied | Search16; check16 di kanan | Lookup search di popup, adaptation untuk trigger Select; bukan salinan persis inline-input demo |
| Dialog | 464×168; header104; footer64; padding16 | Title16/24, body14/20 | popover; footer muted + border top1 | 12 | Deactivate confirmation; pending styling melalui Button | Tidak ada close-X; Batal tersedia | Native header/body/footer; Gallery delete-only, bukan aksi manager |
| Sheet | Overlay390×844; nav288 | Mengikuti Sidebar | Overlay black10%; sidebar tokens | Panel square | Mobile navigation open specimen | Mengikuti Sidebar | Native component; keyboard/focus trap belum diuji |
| Table / Data Table | Width1094; header40; body row48; cell x8 | Header/body14/20; code12/16 | card, border bawah1, header muted | Container10 | Delapan active rows; status/capability badges; toolbar dan pagination compositions | Row menu16 dalam target32 | Table adalah main component; tablet horizontal scroll; body density48 sengaja untuk target row-action32 |
| Pagination | Control32; prev/next32; gap12 | Label12/16; value14/20 | Outline/ghost, disabled | 10 | First/last disabled pada fixture 8 rows/page-size20 | Chevron/glyph centered | Native composition; angka mengikuti fixture/meta, bukan total pagination yang dijumlah |
| Alert | 520×62; padding8×10/gap8 | Title14/20; description14/20 | card; error/warning/success tone, border1 | 10 | Error, partial-data warning, success | Outline16, top aligned | Editable Title/Description; tidak mengubah error menjadi nol |
| Empty / AccessDenied panel | 520×188; padding24/gap12 | Title14/20; description14/20 | card; dashed outline variant; muted description | 12 | No data/no results/access denied | Media32 muted/radius8 dengan outline16 | CTA sesuai permission; denied punya label akses dan tidak menawarkan create |

Radio Group, Switch, Date Picker dan Chart **tidak dibuat** karena tidak
diperlukan tiga pilot ini. Capability flags memakai Checkbox, bukan Switch yang
menyiratkan penyimpanan langsung. Tidak ada time-series sah yang membutuhkan
Chart pada A02. Studi anatomy/variants penuh empat komponen tersebut ditunda;
library V3 ini tidak diklaim sebagai implementasi seluruh katalog shadcn.

## Native main components dan variants

Jumlah: 70 main components dalam 12 sets dan beberapa standalone components;
234 instances. ID berikut berasal dari dokumen final, bukan nama rencana.

| Family | Native mapping / variants |
|---|---|
| Button | `primary/default` → 36, `primary/hover` → 38, `primary/focus` → 40, `primary/disabled` → 42, `primary/loading` → 44, `outline/default` → 47, `outline/hover` → 49, `outline/focus` → 51, `outline/disabled` → 53, `ghost/default` → 55, `ghost/hover` → 57, `ghost/focus` → 59, `ghost/disabled` → 61, `destructive/default` → 63, `destructive/hover` → 65, `destructive/focus` → 67, `destructive/disabled` → 69 |
| Input | `empty` → 75, `filled` → 77, `focus` → 79, `invalid` → 81, `disabled` → 83 |
| Badge | `neutral` → 89, `outline` → 91, `success` → 93, `warning` → 95, `destructive` → 97 |
| Checkbox | `unchecked` → 103, `checked` → 104, `indeterminate` → 106, `focus` → 108, `disabled` → 109 |
| Select | `default` → 114, `focus` → 117, `invalid` → 120, `disabled` → 123 |
| SidebarMenuButton | `default` → 130, `hover` → 132, `active` → 134, `focus` → 136 |
| Sidebar | `expanded/workspace` → 468, `expanded/produk` → 562, `collapsed/produk` → 656 |
| Field | `input/default` → 1746, `input/invalid` → 1750, `input/disabled` → 1755, `select/default` → 1759, `select/invalid` → 1764 |
| Alert | `error` → 1802, `warning` → 1808, `success` → 1814 |
| Empty / AccessDenied | `nodata` → 1821, `noresults` → 1828, `denied` → 1835 |
| Row action menu | `read` → 1841, `write` → 1844, `delete` → 1849 |
| Combobox popover | `options` → 1857, `noresults` → 1870, `loading` → 1876, `denied` → 1882 |

Standalone: `skeleton/title` → 142, `skeleton/cell` → 143, `metric` → 699, `table/products` → 703, `card` → 1799, `dialog/deactivate` → 1889, `tooltip` → 1897, `separator` → 1899, `sheet/navigation` → 2824.


Header, Breadcrumb, Tabs, Avatar dan Pagination adalah native auto-layout
compositions, bukan standalone main components. Screen cards juga merupakan
compositions; reusable Card-slot dan metric tersedia tersendiri. Ini membedakan
apa yang benar-benar reusable dari frame biasa yang tetap editable.

Capture component sets tersedia pada `designs/screenshots/v3-components-*.png`;
[control overview](../designs/screenshots/v3-native-controls.png) dan
[state compositions](../designs/screenshots/v3-pilot-states.png) memperlihatkan
hasil pada background yang dapat dibaca. [Manifest](../designs/design-system-v3-manifest.json)
memetakan semua component, set, token, pilot dan hasil checks.

## Batas adaptasi ERP

- Team switcher, billing, visitor growth dan drag-reorder demo tidak diadopsi
  sebagai fitur ERP. Dashboard hanya memakai counts dan data sumber berizin.
- Produk diurutkan server menurut nama A–Z. Tidak dibuat sort toggle lintas
  halaman yang belum punya kontrak; label urutan tetap terlihat.
- Tidak ada bulk product mutation yang diperlukan, sehingga checkbox selection
  dan export tidak ditambahkan ke M01.
- Warna green brand adalah adaptasi eksplisit. Status aktif netral; success
  memakai success token tersendiri. Input outline dibuat lebih kuat untuk kontras.
- Native outline icons mengikuti ukuran/alignment referensi; bukan klaim bahwa
  setiap path identik dengan Tabler/Lucide pada demo resmi.
