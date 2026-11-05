# Screen Inventory dan Struktur Navigasi — ERP v1

Status: rancangan UX tahap pertama berdasarkan inspeksi kode pada 29 Oktober 2026.
Pendamping: [UX specification](ux-specification.md) dan [design system](frontend-design-system.md).

**Belum ada UI atau prototype FigCraft yang dibuat.** Route frontend dan pengelompokan
screen di bawah adalah **ASUMSI AS07**, bukan API baru atau perubahan business rules.

## 1. Cara membaca inventory

- Satu ID adalah unit screen atau mode interaksi yang dapat direview: halaman, tab, dialog, atau drawer. Form create/edit yang sama dikelompokkan; bukan semuanya halaman terpisah.
- Route di tabel relatif terhadap `/app`, kecuali A01 `/login`, A05 `/403`, dan A06 `/404` yang merupakan route publik/system. `—` berarti embedded, tidak membutuhkan route mandiri.
- `:id`, `:variantId`, `:woId`, dan ID lain adalah ID opaque dari API, bukan angka yang diketik atau didecode frontend.
- Kolom informasi adalah data yang dibutuhkan pengguna; jika belum tersedia pada response, ditandai blocker/asumsi dan tidak boleh dibuat-buat.
- Semua screen memakai C01 shell dan C11 feedback dari UX specification, kecuali auth/system mempunyai shell sendiri. Kode Cxx lain merujuk katalog komponen dokumen tersebut.
- State **L/D/E/T/R/A/G** merujuk definisi lengkap loading, empty, success, error, validation, dan permission denied pada bagian 6 UX specification. `D+T` berarti detail dan transition mempunyai keenam state masing-masing. Catatan domain di kolom state melengkapi profil tersebut.
- Permission **R/W/D/A/X** mengikuti controller, bukan jabatan. Aktor setiap screen diturunkan dari matriks tujuh role pada UX specification. W tidak memberi hak approve atau delete secara otomatis.
- **P0:** fondasi/prasyarat; **P1:** MVP operasional; **P2:** kelengkapan berikutnya; **GAP:** endpoint belum tersedia. `Bxx` tetap blocker meskipun screen prioritas tinggi.
- Fitur yang tidak ada endpointnya tidak diberikan tombol submit aktif; contoh: lupa password, edit SO, invoice customer cancel, upload attachment, dan manual retry MRP.

### Singkatan permission

| Kode | Module | Kode | Module |
|---|---|---|---|
| MD | `master_data` | INV | `inventory` |
| PR | `purchase_request` | PO | `purchase_order` |
| GR | `goods_receipt` | VI | `vendor_invoice` |
| SQ | `sales_quotation` | SO | `sales_order` |
| DO | `delivery_order` | CI | `customer_invoice` |
| BOM | `bom` | MFG | `production` |
| MRP | `mrp` | QC | `quality_control` |
| ACC | `accounting` | BANK | `bank` |
| REP | `reporting` | AUTH | JWT/session, bukan permission module |

## 2. Struktur navigasi

```text
Login (A01)
Workspace (A02)
├── Master Data
│   ├── Produk dan Varian (M01–M04)
│   ├── Kategori (M05)
│   ├── Atribut (M06)
│   ├── Satuan dan Konversi (M07–M08)
│   └── Supplier / Customer (M09–M10: GAP, jangan tampilkan sebagai menu aktif)
├── Inventory
│   ├── Stok (I04–I06; batch I14 kontekstual)
│   ├── Reorder Alerts (I07)
│   ├── Pergerakan Stok (I08–I10)
│   ├── Stock Opname (I11–I13)
│   └── Cabang dan Gudang (I01–I03; lokasi dalam gudang)
├── Procurement
│   ├── Purchase Requests (P01–P03)
│   ├── RFQ dan Penawaran Supplier (P04–P06)
│   ├── Purchase Orders (P07–P09)
│   ├── Goods Receipts (P10–P12)
│   └── Vendor Invoices (P13–P15)
├── Sales
│   ├── Quotations (S01–S03)
│   ├── Sales Orders (S04–S06)
│   ├── Delivery Orders (S07–S09)
│   ├── Customer Invoices (S10–S12)
│   └── Payment Receipts (S13–S15)
├── Manufacturing
│   ├── Bill of Materials (B01–B05)
│   ├── Demands (N01)
│   ├── MRP Runs (N02–N04)
│   ├── Planned Orders (N05–N06)
│   └── Work Orders (W01–W06)
├── Quality Control
│   ├── Inspections: Incoming / Final (Q06–Q08)
│   ├── Defect Summary (Q09)
│   ├── Parameters (Q01)
│   ├── Checklists (Q02–Q04)
│   └── Defect Types (Q05)
├── Finance
│   ├── AP dan Pembayaran (F10–F13)
│   ├── AR dan Aging (F14–F15)
│   ├── Jurnal (F05–F07)
│   ├── General Ledger / Saldo (F08–F09)
│   ├── Chart of Accounts (F03–F04)
│   ├── Tahun dan Periode Fiskal (F01–F02)
│   ├── Rekening / Transaksi / Rekonsiliasi (F16–F20)
│   └── Tax Codes / Overhead (F21–F22)
├── Reports (F23–F26; reporting permission)
└── Akun Saya (A03–A04, logout/logout-all)
```

Parent menu disembunyikan bila seluruh child tidak berizin. Administration
user/role/tenant G01–G03 merupakan backlog, bukan menu yang dijanjikan berfungsi.

MVP menggunakan struktur yang sama; child P2 belum perlu ditampilkan sampai
diimplementasikan. Tidak ada global inbox, approval center lintas modul, tenant
switcher, global search atau dashboard agregat baru pada P0.

## 3. Inventory screen

### 3.1 Auth, workspace, dan system

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| A01 Login | `/login`, halaman | Kode perusahaan, email, password; C04, show password, feedback generic | Login dan refresh session sesuai auth API; tanpa role selector | A; invalid credential generic, login limit 15 menit, jaringan; tidak ada forgot-password API | P0 |
| A02 Workspace | `/`, halaman | TenantCode/email, menu/shortcut berizin; C01; counts hanya dari sumber berizin yang tersedia | Buka modul; AUTH; tidak memerlukan aggregate dashboard endpoint | A; zero-capability tampil hubungi admin; partial data gagal tidak dianggap nol | P0 |
| A03 Akun Saya | `/account`, halaman | Email, tenantCode, role labels, permission; fullName hanya bila tersedia; C03 | GET me; logout dan logout-all AUTH; bukan edit profile | A; logout-all berdampak semua perangkat; tidak ada session-device list | P0 |
| A04 Ganti Password | `/account/password`, form | Current/new password, aturan minimal 8 karakter dan upper/lower/number; C04 | Change password AUTH; hasil mengharuskan login ulang | E+A; current password salah, field mismatch kebijakan, sukses kembali login | P0 |
| A05 Permission Denied | `/403`, system | Penjelasan akses ditolak, konteks tenant, tindakan kembali; C11 | Kembali workspace/logout; tanpa request resource terlarang | A; 403 tidak refresh/login loop dan tidak menjadi empty | P0 |
| A06 Tidak Ditemukan | `/404`, system | Dokumen/route tak ditemukan, kembali ke daftar berizin; C11 | Navigasi kembali; tidak membocorkan tenant lain | A; 404 dibedakan network error; direct URL invalid tidak mengubah data | P0 |

### 3.2 Master data produk dan mitra

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| M01 Produk | `/master/products`, list | Code, nama, kategori, capabilities purchased/sold/manufactured, aktif; C02, filter DTO | List MD.R, create MD.W, deactivate MD.D | L; pencarian/filter sesuai ProductFilterDto | P0 |
| M02 Produk create/edit | `/master/products/new`, `/master/products/:id/edit` | Code saat create, nama/deskripsi, kategori, base/purchase/sales UoM, capability flags, variants awal; C04/C05/C06 | Create/update MD.W; update tidak mengubah code/hasVariant di luar DTO | E; UoM belum ada vs lookup ditolak (403), code duplicate, variant data tidak valid | P0 |
| M03 Detail Produk | `/master/products/:id`, detail | Header, variants SKU/cost/sale/min stock/atribut, linked stock dan batches berizin; C03/C07 | Read MD.R; edit MD.W; product deactivate MD.D; stock/batch tab INV.R | D+T; tab inventory ditolak (403) tidak menjatuhkan seluruh detail | P0 |
| M04 Variant editor | Drawer/modal M03 | SKU/create, nama, cost/sale price, min stock, attribute values; C04/C06 | Create/update MD.W; deactivate MD.D; update SKU/atribut tidak tersedia pada UpdateVariantDto | E+T; SKU duplicate, nilai invalid; perubahan cost perlu penjelasan dampak costing v1 | P0 |
| M05 Kategori | `/master/categories`, tree+modal | Nama, parent, hierarki; C14/C04 | List MD.R, create/update MD.W, delete MD.D | L+E+T; kategori terpakai/relasi invalid dari server | P0 |
| M06 Atribut dan Nilai | `/master/attributes`, list+panel | Nama atribut, daftar value; C02/C04 | List MD.R, create attribute/add value MD.W, delete value MD.D | L+E+T; tidak ada update/delete atribut induk endpoint | P0 |
| M07 Satuan | `/master/uom`, list+modal | Nama, simbol, data detail; C02/C04 | List/detail MD.R, create/update MD.W, delete MD.D | L+E+T; satuan dipakai referensi dapat ditolak saat delete | P0 |
| M08 Konversi Satuan | `/master/uom/conversions`, list+modal | From/to UoM, factor; C02/C04/C06 | List MD.R, create MD.W; bukan update/delete konversi | L+E; factor/relasi invalid, tidak ada satuan sebagai empty dependency | P0 |
| M09 Supplier | Rencana `/master/suppliers`; GAP | Kebutuhan dari schema: code, name, contact, payment term, active; C06 pada flow terkait | Tidak ada endpoint; permission owner perlu keputusan, bukan disimpulkan dari MD | G; tidak ada create/list success palsu; BL01 | Dependency P0, GAP |
| M10 Customer | Rencana `/master/customers`; GAP | Code, name, contact, payment term, credit limit dari schema; enforcement credit belum diasumsikan | Tidak ada endpoint; jangan menambah credit-limit blocking rule di UI | G; lookup belum tersedia BL01 | Dependency P0, GAP |

### 3.3 Inventory dan gudang

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| I01 Cabang | `/inventory/branches`, list+modal | Nama/alamat/kota/aktif, detail; C02/C04 | R INV.R; create/update INV.W; tidak ada delete | L+E; validasi alamat opsional dan nama wajib sesuai DTO | P0 |
| I02 Gudang | `/inventory/warehouses`, list+modal | Cabang, code/nama, type raw_material/wip/finished_goods, aktif; C02/C04/C06 | List/detail INV.R, create/update INV.W | L+E; branch lookup, code duplicate; update tidak mengubah branch/code | P0 |
| I03 Detail Gudang dan Lokasi | `/inventory/warehouses/:id`, detail+modal | Gudang dan daftar lokasi code/name; C03/C02/C04 | Read INV.R, create location INV.W, delete location INV.D | D+E+T; lokasi terpakai, tidak ada update location; stock lokasi I06 | P0 |
| I04 Stock on Hand | `/inventory/stock`, list | Produk/SKU/gudang/batch/expiry/UoM/on-hand; filter warehouse/variant/batch/onlyPositive; C02/C10 | INV.R; drilldown I05/I06, bukan edit angka stok | L; default onlyPositive; array tanpa total pagination server; available bukan field on-hand | P1 |
| I05 Stok Varian dan History | `/inventory/stock/variants/:variantId`, detail+tab | Total/per gudang/batch; history movement/date/quantity/direction; C03/C02/C07 | INV.R; GET per-varian dan GET history dengan variantId | D+L; tidak ada stok berbeda dari varian tidak ditemukan (404); saldo semua warehouse berbeda filter history | P1 |
| I06 Stok per Lokasi | `/inventory/stock/locations/:warehouseId`, list | Lokasi/gudang/SKU/batch/quantity sesuai response; C02 | INV.R; read-only | L; data tanpa lokasi bukan error; tidak mengasumsikan lokasi semua stok sudah terisi | P2 |
| I07 Reorder Alerts | `/inventory/reorder-alerts`, list | Varian, minimum/on hand/shortage sesuai API; filter gudang; C02/C10 | INV.R; handoff pengadaan hanya bila PR/PO permission dimiliki | L; tidak ada alert = kondisi valid; tidak ada auto-create PR endpoint | P2 |
| I08 Movements | `/inventory/movements`, list | Jenis, tanggal, status, source, gudang; C02/C08 | Read INV.R; create INV.W | L; filter type/status/date/warehouse sesuai DTO | P1 |
| I09 Create Movement | `/inventory/movements/new`, form | Typecode, date, item varian/batch/from/to warehouse/location/qty/UoM/unit cost/notes; C04/C05/C06 | INV.W; confirm terpisah di I10 memakai INV.A | E; arah in/out/transfer menentukan field; tidak ada movement-type lookup API, lihat bagian 5 | P1 |
| I10 Movement Detail | `/inventory/movements/:id`, detail | Item, source, status, audit metadata tersedia; C03/C07/C09 | INV.R; confirm/cancel INV.A; cancel membutuhkan reason | D+T; hanya draft; confirmed cancel ditolak, bukan otomatis reversal | P1 |
| I11 Stock Opname | `/inventory/opnames`, list | Gudang, tanggal, status; C02 | INV.R; create INV.W | L; filter gudang, bukan generic pagination yang belum ada | P1 |
| I12 Create Opname | `/inventory/opnames/new`, form | Gudang, date, notes; snapshot dibuat server; C04/C06 | INV.W | E; sukses langsung counting, snapshot hanya stock positif; gudang tanpa item dijelaskan | P1 |
| I13 Detail/Count Opname | `/inventory/opnames/:id`, detail+count panel | Snapshot per varian/batch, actual, selisih, notes; C03/C17/C09 | Read INV.R; complete/cancel INV.A; tidak ada count-save W | D+T; actual kosong bukan 0; confirm adjustment; BL06 handoff hasil staf belum didukung | P1·BL06 |
| I14 Create Batch | Modal dari M03/I05/P11 | Varian, batchNumber, manufacture/expiry, origin, notes; C04 | Batch list INV.R, create INV.W; MD.R jika perlu product lookup | E; unique variant+batch, bukan stock-in otomatis; tidak ada edit/delete batch | P1 |

### 3.4 Procurement — purchase-to-pay

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| P01 PR List | `/procurement/requests`, list | Nomor, warehouse, needed date, status, item ringkas; C02 | PR.R; create PR.W | L; filters sesuai PaginationDto | P1 |
| P02 Create PR | `/procurement/requests/new`, form | Warehouse, neededDate, notes; item variant/qty/UoM/estimatedPrice; C04/C05/C06 | PR.W; INV.R dan MD.R untuk lookup; BL02 | E; minimal item; tidak ada update PR setelah create | P1·BL02 |
| P03 PR Detail | `/procurement/requests/:id`, detail | Header/items/status/approval dan rejection notes; C03/C09 | Read PR.R; submit PR.W; approve/reject PR.A | D+T; submitdraft, decision submitted, reject reason required; tidak ada resubmit/reopen | P1 |
| P04 RFQ List | `/procurement/rfqs`, list | Nomor/deadline/status, summary quote bila tersedia; C02 | PO.R; create PO.W | L; tidak menjanjikan supplier response realtime | P2 |
| P05 Create RFQ | `/procurement/rfqs/new`, form | Deadline/notes, item qty/UoM dan PR item references; C04/C05/C06 | PO.W; PR.R jika mengambil PR, MD.R lookup | E; linkage dari PR approved sesuai proses; tanpa generic edit RFQ | P2·BL01 |
| P06 RFQ Detail dan Quotes | `/procurement/rfqs/:id`, detail+quoteeditor | Item, supplier quote peritem harga/qty/UoM/leadtime/validity; comparison C03/C05 | Read PO.R; mark sent dan input quote PO.W; select quote PO.A | D+E+T; supplier BL01; quote received/select; sent tidak berarti email terkirim | P2·BL01 |
| P07 PO List | `/procurement/orders`, list | Nomor, supplier, warehouse, expectedDate, status,total; C02/C10 | PO.R; create PO.W | L; receiving progress terpisah dari paid status | P1 |
| P08 PO Create/Edit | `/procurement/orders/new`, `/procurement/orders/:id/edit` | Supplier/warehouse/date/paymentTerm/shipping/terms/items price-discount-tax; quote refopsional; C04/C05/C06 | PO.W; source quote PO.R; MD.R/INV.R lookup | E; edit draft hanya header dan existing line fields DTO; supplier BL01/gudang BL02 | P1·BL01/BL02 |
| P09 PO Detail | `/procurement/orders/:id`, detail | Ordered/received/pending peritem, supplier, total, relasi GR; C03/C07/C09 | PO.R; confirm/cancel PO.A; create GR perlu GR.W dan PO.R; invoice perlu VI.W | D+T; cancel reason required, bukan cancel setelah receipt sembarang; draft dari MRP harus review harga | P1 |
| P10 GR List | `/procurement/receipts`, list | Nomor, PO, supplier DO, receiptDate, status; C02 | GR.R; create GR.W | L; sumber PO lookup BL02 untuk gudang | P1 |
| P11 Create GR | `/procurement/receipts/new`, form | PO eligible, sisa POitem, receivedQty, batch/location, date/supplier DO; C04/C05/C06 | GR.W; PO.R/INV.R/MD.R untuk lookup terkait | E; tidak melebihi sisa, matchingvariant/UoM; tidak ada editGR; BL02 | P1·BL02 |
| P12 GR Detail | `/procurement/receipts/:id`, detail | SourcePO, actualitems, status, movement/journal reference bila tersedia; C03/C07/C09 | GR.R; confirm GR.A; incoming QC create QC.W + GR.R; invoice VI.W | D+T; confirm stock dan journal; QC belum menjadi gate; tidak ada GRcancel endpoint | P1 |
| P13 Vendor Invoice List | `/procurement/vendor-invoices`, list+overduetab | Number/supplierInvoiceNo/supplier/dates/status/total/paid/outstanding; C02 | VI.R; create VI.W; overdueGET | L; status unpaid/partial/paid; supplier source BL01 | P1 |
| P14 Create Vendor Invoice | `/procurement/vendor-invoices/new`, form | PO, GR eligibles, supplier invoice number/date/due/notes, server-totalpreview; C04/C06 | VI.W; PO.R dan GR.R untuk source views | E; PO yang sama GR confirmed, GR terpakai (409); formula pajak backend11%, bukan tax-code selector | P1 |
| P15 Vendor Invoice Detail | `/procurement/vendor-invoices/:id`, detail | LinkedGRs/PO, subtotal/tax/total, paid/outstanding; C03/C07/C10 | Read VI.R; cancel VI.A; paymentF13 memerlukan ACC.W | D+T; paid/allocated cancel dibatasi service; akuntan hanya readVI, bukan create/cancel | P1 |

### 3.5 Sales — order-to-cash

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| S01 Quotation List | `/sales/quotations`, list | Nomor/customer/validity/status/total; C02 | SQ.R; create SQ.W | L; customer filter sesuai API | P2 |
| S02 Quotation Create/Edit | `/sales/quotations/new`, `/sales/quotations/:id/edit` | Customer/date/paymentTerm/address/notes/terms; item price/discount/tax saatcreate; C04/C05 | SQ.W, MD.R lookup; customer BL01 | E; edit hanya header yang didukung, tidak editline universal | P2·BL01 |
| S03 Quotation Detail | `/sales/quotations/:id`, detail | Header/items/totals/status, ref SO bila tersedia; C03/C09 | SQ.R; send/cancel SQ.W; accept/reject SQ.A; createSO SO.W | D+T; accepted cancel ditolak; send hanya status, bukan bukti email/customer portal | P2 |
| S04 Sales Order List | `/sales/orders`, list | Nomor/customer/warehouse/requestedDate/status/total; C02 | SO.R; create SO.W | L; invoiced bukan paid/fullydelivered | P1 |
| S05 Create SO | `/sales/orders/new`, form | Customer/warehouse/date/paymentTerm/address/items/quotation opsional; C04/C05/C06 | SO.W; SQ.R untuk source opsional; MD.R/INV.R lookups | E; source quotation accepted dan customer cocok; customer BL01; tidak ada updateSO | P1·BL01 |
| S06 SO Detail | `/sales/orders/:id`, detail | Ordered/delivered/pending, availability bila dikembalikan, financials/source; C03/C07 | SO.R; confirm/cancel SO.A; createDO DO.W; invoiceCI.W bilaeligible | D+T; confirm dapat membentuk demand, cancel reason; tanpa optimistic reservation | P1 |
| S07 DO List | `/sales/deliveries`, list | Number/source SO/customer/deliveryDate/status; C02 | DO.R; create DO.W | L; stock-out hanya setelah confirm, bukan create draft | P1 |
| S08 Create DO | `/sales/deliveries/new`, form | SO eligible, pendingQty, qty/batch/location, receiver/address/date; C04/C05 | DO.W; SO.R/INV.R/MD.R source; gudangtemplate BL02 | E; create dapat ditolak available stock; tidak ada updateDO | P1·BL02 |
| S09 DO Detail | `/sales/deliveries/:id`, detail | SourceSO/items/status/receiver, movement/COGSreference bila tersedia; C03/C07/C09 | DO.R; confirm/cancel DO.A; invoice CI.W | D+T; confirmstock/COGS; cancel draft, confirmed tidak dapat dibatalkan | P1 |
| S10 Customer Invoice List | `/sales/invoices`, list+overduetab | Nomor/customer/dates/status/total/paid/outstanding; C02/C10 | CI.R; create CI.W | L; overdue tidak sama dengan failed | P1 |
| S11 Create Customer Invoice | `/sales/invoices/new`, form | SO, pilihan DO confirmed eligible, qtyditagih, subtotal/discount/tax/totalpreview, date/due; C04/C06 | CI.W; SO.R dan DO.R source | E; invoice hanya DO terpilih, duplicate (409); tidak menagih seluruhSO | P1 |
| S12 Customer Invoice Detail | `/sales/invoices/:id`, detail | SO/DOlinked, total/paid/outstanding/date/status; C03/C07/C10 | CI.R; record payment CI.W | D; tidak ada edit/cancel/delete invoice customer endpoint | P1 |
| S13 Payment Receipt List | `/sales/receipts`, list | Nomor/customer/date/method/amount/reference; C02 | CI.R; create CI.W | L; akun/readCI bukan hak membuatreceipt | P1 |
| S14 Record Payment Receipt | `/sales/receipts/new`, form | Customer/date/method/reference/notes, invoice eligible/outstanding/allocation/total; C04/C16 | CI.W; CI.R source; customer BL01 bila belum di context | E+T; tidak boleh overpayment/alokasi duplikat; side effect finansial langsung, timeout tidak auto-resubmit | P1 |
| S15 Payment Receipt Detail | `/sales/receipts/:id`, detail | Receipt header dan alokasi invoice; C03/C16/C07 | CI.R; print proposal AS08; tidak ada edit/reverse/delete | D; refresh invoice/outstanding setelah sukses; histori hilang≠0 | P1 |

### 3.6 BOM

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| B01 BOM List | `/manufacturing/bom`, list | Output product/variant/name/active state/version summary; C02 | BOM.R; create BOM.W | L; pencarian/isActive sesuai DTO | P1 |
| B02 BOM Header Form | `/manufacturing/bom/new`, `/manufacturing/bom/:id/edit` | Variant/name/notes; update name/notes/isActive; C04/C06 | BOM.W; MD.R product lookup | E; header duplikat/variant tidak valid; bukan editor versi | P1 |
| B03 BOM Detail | `/manufacturing/bom/:id`, detail | Header/version list/status/effectivity/output quantity/UoM; C03/C07 | BOM.R; create version BOM.W | D+E; tanpa versi: CTA hanya W; active dibedakan obsolete | P1 |
| B04 BOM Version Editor | `/manufacturing/bom/:id/versions/new`, `/manufacturing/bom-versions/:id/edit` | Output quantity/UoM/effectivity; material tree qty/scrap/phantom; operation time/cost; by-product; C04/C14/C05 | Create/update/add BOM.W; remove material/operation/by-product BOM.D | E+T; active locked; manager W tanpa D tidak boleh remove; tidak ada update by-product | P1 |
| B05 BOM Version Detail/Explode | `/manufacturing/bom-versions/:id`, detail+tab | Material/operation/byproduct tree, quantity-input explosion, version status; C03/C14/C10 | Read/explode BOM.R; activate BOM.A; edit draft BOM.W | D+R+T; activate mengobsolete versi lama; material kosong, quantity invalid, atau error tree | P1 |

### 3.7 MRP dan planned orders

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| N01 Demand List/Create | `/manufacturing/demands`, list+modal | Variant/type/SOref/qty/UoM/neededDate/warehouse/status; C02/C04/C06 | MRP.R; create/cancel MRP.W; MD.R/INV.R source, SO.R untuk source SO | L+E+T; tidak ada membuat duplikat demand SO manual; cancel fulfilled ditolak; tidak ada detail endpoint | P1 |
| N02 MRP Run List | `/manufacturing/mrp-runs`, list | RunID/horizon/status/created/start/completed/retry jika tersedia; C02/C12 | MRP.R; trigger MRP.W | L; hanya satu active per tenant; tidak menampilkan persentase progress yang tidak disediakan API | P1 |
| N03 Trigger MRP | `/manufacturing/mrp-runs/new`, form | PlanFrom/PlanTo/notes; review tenant/horizon; C04/C09 | MRP.W; manager dapat trigger, produksi tidak | E+T; from≤to; pending pada sukses bukan completed; active conflict (409) | P1 |
| N04 MRP Run Detail | `/manufacturing/mrp-runs/:id`, detail | Status/horizon/retry/timestamps/duration/error/counts; link planned order; C03/C12/C09 | MRP.R; cancel/approve-all MRP.A | D+T; pending/running/failed polling; berhenti pada terminal; bulk results partial success; BL03 | P1·BL03 |
| N05 Planned Orders | `/manufacturing/planned-orders`, list | Run/type/variant/qty/start/finish/suggested supplier/status/resultWO/PO; C02/C07 | MRP.R; approve/cancel MRP.A | L+T; filter run/type/status; jangan menambah bulk selection API selain approve-all pada run | P1·BL03/BL09 |
| N06 Planned Order Detail | `/manufacturing/planned-orders/:id`, detail | Demand allocations, BOM/supplier/date/qty, WO/PO reference; C03/C07/C09 | MRP.R; approve/cancel MRP.A; tautan hasil perlu MFG.R/PO.R | D+T; supplier belum diisi/BOM/gudang, default MTS/gudang; tidak ada editor; review draft hasil | P1·BL03/BL09 |

### 3.8 Work orders dan pelaksanaan produksi

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| W01 Work Order List | `/manufacturing/work-orders`, list | Nomor/variant/type/quantity planned/produced/date/warehouse/status; C02 | MFG.R; create MFG.W | L; filter type/status/date/variant/search | P1 |
| W02 WO Create/Edit | `/manufacturing/work-orders/new`, `/manufacturing/work-orders/:id/edit` | Variant/BOM aktif/qty/UoM/output warehouse/start/finish/MTS-MTO/SOrefs; C04/C06 | MFG.W; BOM.R/MD.R/INV.R; SO.R bila referensi sumber | E; edit draft hanya dates/qty/notes; syarat versi aktif; lookup SO terblokir bagi produksi | P1 |
| W03 WO Detail | `/manufacturing/work-orders/:id`, detail | Qty/date/status/BOM/source, requirements, operations/results; C03/C07/C17 | MFG.R; confirm/cancel MFG.A; start/consume/result/operations MFG.W | D+T; state backend; completion berdasarkan quantity hasil, bukan tombol complete manual; BL05 | P1·BL05 |
| W04 Consume Materials | Panel W03 | woMaterialId, planned/consumed/remaining, stok/batch/gudang, quantity consumption; C04/C05/C06 | MFG.W; INV.R lookups | E+T; stock insufficient, quantity stale, outcome belum diketahui; risiko movement berulang BL05 | P1·BL05 |
| W05 Record Result | Panel W03 | Current/quantity target, qtyProduced, UoM/warehouse/batchNumber/notes; C04/C10 | MFG.W; INV.R source; final QC membutuhkan QC.W | E+T; WO aktif; hasil dapat membuat status completed+stock dan journal; BL05; jangan auto-resubmit | P1·BL05 |
| W06 Operation Execution | Tab/panel W03 | Sequence/name/work center/status/planned/actual timing, progress; C17 | MFG.R; start/complete operation MFG.W | D+T; pending→in_progress→completed; tidak ada skip atau edit operation endpoint | P1 |

### 3.9 Quality Control

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| Q01 Parameters | `/quality/parameters`, list+modal | Code/name/description/valueType/min/max/unit; C02/C04 | QC.R; create QC.W; deactivate QC.D | L+E+T; numeric range dan valueType; tidak ada parameter update | P0 |
| Q02 Checklists | `/quality/checklists`, list | Name/inspection type/category/active/items; C02 | QC.R; create QC.W | L; filter incoming/final | P0 |
| Q03 Create Checklist | `/quality/checklists/new`, form | Name/type/category/notes, parameter/sequence/isRequired; C04/C15/C06 | QC.W; QC.R parameter lookup, MD.R category lookup | E; minimal item/required; tidak ada checklist update atau patch items API | P0 |
| Q04 Checklist Detail | `/quality/checklists/:id`, detail | Required parameters/order/tolerances/type/category; C03/C15 | QC.R; deactivate QC.D | D+T; deactivated tidak eligible inspection baru | P0 |
| Q05 Defect Types | `/quality/defect-types`, list+modal | Code/name/severity critical/major/minor; C02/C04 | QC.R; create QC.W | L+E; tidak ada update/delete API; severity≠inspection result | P0 |
| Q06 Inspection List | `/quality/inspections`, list | Number/type/source/variant/batch/date/status/result; C02/C08 | QC.R; create QC.W | L; filter type/status/result/variant; result/disposition terpisah | P1 |
| Q07 Create Inspection | `/quality/inspections/new`, form | Checklist/type, GR confirmed untuk incoming atau productionResult untuk final, variant/batch/qty/UoM; C04/C06 | QC.W; GR.R/MFG.R/MD.R/INV.R sesuai lookup | E; source valid/checklist type; staf produksi tidak punya GR.R; BL02 | P1·BL02 |
| Q08 Inspection Detail/Complete | `/quality/inspections/:id`, detail+grid | Required checklist, pass/fail/numeric/text/tolerance, qtyInspected, defects, result/disposition/notes; C03/C15 | QC.R; complete QC.A; cancel draft QC.W | D+T; required item belum diisi; result/disposition diisi pengguna; save hasil hanya complete; BL06; QC tidak melakukan quarantine | P1·BL06 |
| Q09 Defect Summary | `/quality/defect-summary`, report | Type/date filters, defect code/name/severity/qty/count sesuai API; C13 | QC.R; bukan REP.R | R; tidak ada data valid, tanpa klaim biaya manufaktur | P2 |

### 3.10 Finance, accounting, dan reports

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| F01 Fiscal Years | `/finance/fiscal-years`, list+modal | Name/start/end/status; C02/C04 | ACC.R; create ACC.W | L+E; range valid, duplicate/overlap server; prasyarat operasional | P0 |
| F02 Fiscal Year/Periods | `/finance/fiscal-years/:id`, detail+panel periode | FY details, period number/name/range/status; C03/C02/C04/C09 | ACC.R; create period ACC.W; close FY/change period status ACC.A | D+E+T; FY closed, overlap, draft journal memblokir closing; tidak ada reopen locked | P0/P1 |
| F03 Chart of Accounts | `/finance/accounts`, tree/list | Code/name/type/group/parent/header/active/system refs jika tersedia; C14/C02 | ACC.R; create/update ACC.W | L; relasi parent/header, tidak ada delete API | P0 |
| F04 Account Form | `/finance/accounts/new`, `/finance/accounts/:id/edit` | Code/name/type/group/header/parent/notes; update name/notes/isActive; C04/C06 | ACC.W; ACC.R lookup | E; code/parent tidak valid, type tidak boleh diganti melalui update DTO | P0 |
| F05 Journal List | `/finance/journals`, list | Number/date/period/type/ref/status/debit-credit; C02 | ACC.R; create ACC.W | L; filter period/type/date/status/search | P1 |
| F06 Create Journal | `/finance/journals/new`, form | Period/date/type/description/folio/source, account line/debit/credit/cost center; C04/C05/C10 | ACC.W; ACC.R lookups | E; balanced, account non-header yang valid/open period; save=draft; tanpa edit journal generik | P1 |
| F07 Journal Detail | `/finance/journals/:id`, detail | Lines/totals/source/status/metadata; C03/C07/C09 | ACC.R; post/reverse ACC.A; reverse ke target period | D+T; draft post, posted reverse, closed period/duplicate (409), tidak ada delete | P1 |
| F08 General Ledger | `/finance/general-ledger`, report | Account/period/date filters, posted lines/debit/credit/balance; C13/C07 | ACC.R | R; tidak ada fallback permission periode; journal drilldown sama ACC.R | P1 |
| F09 Account Balances | `/finance/account-balances`, report | Period, account codes/names, opening/debit/credit/closing; C13 | ACC.R | R; periode wajib; nol hanya bila dikembalikan server | P1 |
| F10 AP Transactions | `/finance/payables`, list | Supplier/invoice number/due/amount/paid/outstanding/status; C02/C16 | ACC.R; pay ACC.W; invoice detail VI.R | L; supplier ID/invoice ID tidak lengkap pada list untuk create/drilldown; BL01/AS10 | P1·BL01 |
| F11 AP Aging | `/finance/payables/aging`, report | Supplier/group/aging buckets/outstanding dari API; C13 | ACC.R; filter supplier bila ID tersedia | R; basis tanggal aging mengikuti server; tidak ada filter as-of baru yang belum didukung | P1 |
| F12 AP Payments | `/finance/payments`, list | Number/date/supplier/method/amount/reference/notes; C02 | ACC.R; create ACC.W | L; tidak ada GET payment detail/allocation API; jangan buat detail historis palsu | P1 |
| F13 Create AP Payment | `/finance/payments/new`, form | Supplier/date/method/bank opsional/ref/notes/AP allocations/outstanding; C04/C16 | ACC.W; ACC.R target source, BANK.R bila pilih bank | E+T; target duplikat/overpay; BL01 supplier ID; sukses mempunyai dampak finansial, tidak ada posting kedua | P1·BL01 |
| F14 AR Transactions | `/finance/receivables`, list | Customer/invoice/date/due/amount/received/outstanding/status; C02 | ACC.R; invoice CI.R; aksi receipt CI.W terpisah | L; akuntan yang membaca AR tidak berhak membuat receipt | P1 |
| F15 AR Aging | `/finance/receivables/aging`, report | Customer/buckets/outstanding dari API; C13 | ACC.R | R; tidak menyamakan unpaid/overdue; customer filter BL01 | P1 |
| F16 Bank Accounts | `/finance/bank-accounts`, list+modal | Linked CoA/account name/bank name/number/branch; C02/C04 | BANK.R; create BANK.W; ACC.R account lookup | L+E; tidak ada update/delete; template manager tidak punya BANK | P2 |
| F17 Bank Account Transactions | `/finance/bank-accounts/:id`, list+tabs | Transactions/date/type/amount/reference/reconciled; reconciliations dari GET list; C02 | BANK.R; create BANK.W | L; tidak ada standalone GET detail bank account; konteks dari GET list, tidak ada field yang tidak tersedia | P2 |
| F18 Create Bank Transaction | Panel F17 | Bank/date/debit-credit/amount/reference/description; C04/C10 | BANK.W | E+T; debit/credit menurut API; tidak menjanjikan bank feed atau auto GL di luar service | P2 |
| F19 Create Reconciliation | Panel F17 | Bank/period/date/statementBalance/bookBalance/notes; C04/C10 | BANK.W; ACC.R periods | E; difference dihitung server; tidak ada selected transaction IDs payload | P2·BL07 |
| F20 Reconciliation Detail/Complete | Embedded dari F17 list | Balance/difference/date/status/notes/metadata tersedia; C03/C09 | BANK.R; complete BANK.A | D+T; tidak ada standalone GET detail, difference > 0,01 ditolak; complete menandai semua unreconciled; akuntan tanpa A | P2·BL07 |
| F21 Tax Codes | `/finance/tax-codes`, list+modal | Code/name/type ppn/pph/rate/account; C02/C04 | ACC.R; create ACC.W | L+E; konfigurasi tidak mengubah formula VI hardcoded 11%; tidak ada update/delete | P2 |
| F22 Overhead Rates | `/finance/overhead-rates`, list+modal | Period/name/rateType/rate/account; C02/C04 | ACC.R; create ACC.W | L+E; bukan costing engine/cost sheet; tidak ada update/delete | P2 |
| F23 Trial Balance | `/reports/trial-balance`, report | Period/account/debit/credit/totals server; C13 | REP.R; ACC.R period lookup BL04; X hanya proposal ekspor | R; imbalance ditampilkan apa adanya, tanpa angka nol fiktif; gate akurasi P1 | P1·BL04 |
| F24 Profit and Loss | `/reports/profit-loss`, report | Period/revenue/cost/expense/profit; C13 | REP.R; ACC.R period lookup BL04 | R; COGS v1 cost_price, tidak klaim HPP produksi penuh | P2·BL04 |
| F25 Balance Sheet | `/reports/balance-sheet`, report | Period/assets/liabilities/equity/totals; C13 | REP.R; ACC.R period lookup BL04 | R; scope tahun/periode jelas; tidak menghitung total pagination | P2·BL04 |
| F26 Cash Flow | `/reports/cash-flow`, report | Period/cash flow groups/totals sesuai API; C13 | REP.R; ACC.R period lookup BL04 | R; report dari server, bukan status rekonsiliasi bank | P2·BL04 |

### 3.11 Administration yang belum mempunyai API

| ID / screen | Route atau bentuk | Informasi dan komponen | Aksi / permission | State dan kondisi domain | Prioritas |
|---|---|---|---|---|---|
| G01 Users | Rencana `/settings/users`; tidak aktif | Kebutuhan user/role/status dan provisioning belum punya kontrak | Permission `user_management` ada, endpoint tidak ada | G; BL08; tidak ada invite/reset/edit user palsu | GAP |
| G02 Roles/Permissions | Rencana `/settings/roles`; tidak aktif | Matriks permission/capabilities; source tetap role JSONB | Permission `role_management` ada, endpoint tidak ada | G; BL08; tidak ada role builder yang menyimpan | GAP |
| G03 Tenant Settings | Rencana `/settings/tenant`; tidak aktif | Identitas tenant/config belum punya kontrak | Permission `tenant_settings` ada, endpoint tidak ada | G; BL08; bukan tenant switch/global admin | GAP |

## 4. Pengelompokan screen berdasarkan flow dan prioritas

| Flow | Screen inti dan urutan | Primary roles/handoff | MVP dan gate |
|---|---|---|---|
| F-ACCESS | A01 → A02 → A03/A04; A05/A06 exception | Semua tujuh role | P0; login/tenant/capabilities/denied harus tersedia sebelum modul |
| F-SETUP | M07/M08 → M05/M06 → M02/M03/M04 → I01/I02/I03 → F01/F02/F03 → Q01–Q05 | Admin; manager sesuai permission; akuntan pada accounting | P0; BL01 mitra, BL08 provisioning user, lookup permissions |
| F-PURCHASE | P01/P02/P03 → P07/P08/P09 → P10/P11/P12 → P13/P14/P15 → F10/F13/F12 | Pembelian → manager → gudang → akuntan | P1; PR optional, PO langsung didukung; BL01/BL02 |
| F-SOURCING | P04/P05/P06 → P08/P09 | Pembelian input quote → manager select | P2; supplier lookup BL01; tidak ada supplier portal eksternal |
| F-SALES | S04/S05/S06 → S07/S08/S09 → S10/S11/S12 → S13/S14/S15 → F14/F15 | Penjualan → manager → gudang → penjualan; akuntan read AR | P1; BL01/BL02, akurasi invoice parsial |
| F-QUOTATION | S01/S02/S03 → S05/S06 | Penjualan → manager accept | P2; source quotation bukan mandatory |
| F-STOCK | I04/I05 → I08/I09/I10; I11/I12/I13; I14 batch | Gudang → manager confirm/complete | P1; BL06 save hasil count; I06/I07 analitik P2 |
| F-PLAN | B01/B02/B03/B04/B05 → N01 → N02/N03/N04 → N05/N06 | Manager sebagai pengelola BOM/planner → admin untuk approval MRP | P1; BL03/BL09; staf produksi tidak memiliki MRP |
| F-PRODUCE | W01/W02/W03 → W04/W06 → W05 → W03; Q07/Q08 final | Manager confirm → produksi execute → manager complete QC | P1; BL05 gate kuat, BL06 QC, BL02 source lookup |
| F-QC | P12 atau W05 → Q06/Q07/Q08; Q09 summary | Gudang/produksi create → manager complete | P1; QC tidak mengquarantine stok; summary P2 |
| F-ACCOUNTING | F05/F06/F07 → F08/F09/F23 → F02 close | Akuntan/admin; manager read | P1; periode open, jurnal seimbang, tidak ada reopen locked |
| F-REPORT | F11/F15/F23; kemudian F24/F25/F26 | Akuntan, manager, staf tertentu sesuai REP/ACC | Aging/trial P1; lainnya P2; BL04 period lookup |
| F-BANK | F16/F17/F18/F19/F20 | Akuntan W → admin bank.A | P2 dan BL07; matching redesign tidak dalam scope |
| F-ADMIN | G01/G02/G03 dan M09/M10 | Admin/operator eksternal | GAP; keputusan backend terpisah, bukan UI aktif |

Urutan implementasi frontend yang disarankan sesudah review UX:

1. P0 shell/auth/states/lookup/components dan kebutuhan master minimum. Selesaikan keputusan BL01/BL02/BL04 sebelum menjanjikan workflow non-admin.
2. P1 vertical slice PO → GR → invoice/AP serta SO → DO → invoice/receipt. Verifikasi permission per-role, bukan hanya admin happy path.
3. P1 manufacture/QC dan stock adjustment: BOM → MRP → WO → hasil → QC; BL03/BL05/BL06/BL09 menjadi release gate, bukan diabaikan demi demo.
4. P1 journal/GL/aging/trial balance dan closing period; telusuri sumber transaksi.
5. P2 hanya setelah flow inti dapat diselesaikan. G01–G03 memerlukan backend scope baru; tidak otomatis ditambahkan di frontend sprint.

## 5. API traceability dan dependency lookup

Notasi: `G` GET, `P` POST, `H` PATCH, `D` DELETE. Semua path berikut diawali
`/api/v1`. Prefix module pada navigation berbeda dengan pathAPI root di sini.
Endpoint detail/aksi berbagi screen; tabel ini memetakan seluruh kelompok 204
endpoint tanpa membuat satu halaman per endpoint.

| Resource / endpoint group | Screen | Action yang tersedia |
|---|---|---|
| `auth/login`, `auth/refresh` | A01/A02 | P login, P refresh; autentikasi bukan modulpermission |
| `auth/me`, `auth/logout`, `auth/logout-all`, `auth/change-password` | A03/A04 | GET me; P logout/logout-all/change-password |
| `uom`, `uom/:id`, `uom/conversions` | M07/M08 | G/P uom; G/H/D uom:id; G/P conversions |
| `product-categories`, `product-categories/:id` | M05 | G/P list; H/D:id |
| `attributes`, `attributes/:id/values`, `attributes/values/:valueId` | M06 | G/P attributes; Pvalue; Dvalue |
| `products`, `products/:id` | M01/M02/M03 | G/P list; G/H/D:id |
| `products/:id/variants`, `products/variants/:variantId` | M03/M04 | G/P variants; H/Dvariant |
| `products/variants/:variantId/batches`, `batches` | M03/I14 | Gbatch list, POST batch |
| `branches`, `branches/:id` | I01 | G/P branches; G/H:id |
| `warehouses`, `warehouses/:id` | I02/I03 | G/P warehouses; G/H:id |
| `warehouses/:id/locations`, `warehouse-locations`, `warehouse-locations/:id` | I03 | Glist, Pcreate, D:id |
| `inventory-movements`, `inventory-movements/:id`, `:id/confirm`, `:id/cancel` | I08/I09/I10 | G/P list, GET detail, POST confirm/POST cancel |
| `stock`, `stock/variants/:variantId`, `stock/history`, `stock/locations/:warehouseId`, `stock/reorder-alerts` | I04/I05/I06/I07 | GET semua; `stock` tidak menerima generic page/limit |
| `stock-opnames`, `stock-opnames/:id`, `:id/complete`, `:id/cancel` | I11/I12/I13 | G/P list, GET detail, POST complete/POST cancel |
| `purchase-requests`, `purchase-requests/:id`, `:id/submit`, `:id/approve`, `:id/reject` | P01/P02/P03 | G/P list, GET detail, Psubmit/approve/reject |
| `rfqs`, `rfqs/:id`, `:id/send`, `:id/quotes`, `:id/quotes/:quoteId/select` | P04/P05/P06 | G/P list, GET detail, Psend/quotes/select |
| `purchase-orders`, `purchase-orders/:id`, `:id/confirm`, `:id/cancel` | P07/P08/P09 | G/P list, G/Hdetail, POST confirm/cancel |
| `goods-receipts`, `goods-receipts/:id`, `:id/confirm` | P10/P11/P12 | G/P list, GET detail, POST confirm |
| `vendor-invoices`, `vendor-invoices/overdue`, `vendor-invoices/:id`, `:id/cancel` | P13/P14/P15 | G/P list, GET overdue/GET detail, POST cancel |
| `sales-quotations`, `sales-quotations/:id`, `:id/send`, `:id/accept`, `:id/reject`, `:id/cancel` | S01/S02/S03 | G/P list, G/Hdetail, Psend/accept/reject/cancel |
| `sales-orders`, `sales-orders/:id`, `:id/confirm`, `:id/cancel` | S04/S05/S06 | G/P list, GET detail, POST confirm/cancel |
| `delivery-orders`, `delivery-orders/:id`, `:id/confirm`, `:id/cancel` | S07/S08/S09 | G/P list, GET detail, POST confirm/cancel |
| `customer-invoices`, `customer-invoices/overdue`, `customer-invoices/:id` | S10/S11/S12 | G/P list, GET overdue/GET detail |
| `payment-receipts`, `payment-receipts/:id` | S13/S14/S15 | G/P list, GET detail |
| `bom`, `bom/:id` | B01/B02/B03 | G/P list, G/Hdetail |
| `bom/:headerId/versions`, `bom-versions/:id`, `:id/activate`, `:id/explode` | B03/B04/B05 | Pversion, G/Hversion, Pactivate, Gexplode |
| `bom-versions/:versionId/items`, `bom-items/:id` | B04/B05 | Pitem, H/Ditem |
| `bom-versions/:versionId/operations`, `bom-operations/:id` | B04/B05 | Poperation, H/Doperation |
| `bom-versions/:versionId/by-products`, `bom-by-products/:id` | B04/B05 | Pbyproduct, Dbyproduct |
| `mrp-demands`, `mrp-demands/:id/cancel` | N01 | G/P list, POST cancel |
| `mrp-runs`, `mrp-runs/:id`, `:id/cancel`, `:id/approve-all` | N02/N03/N04 | G/P list, GET detail, POST cancel/approve-all |
| `planned-orders`, `planned-orders/:id`, `:id/approve`, `:id/cancel` | N05/N06 | Glist/GET detail, Papprove/cancel |
| `work-orders`, `work-orders/:id`, `:id/confirm`, `:id/start`, `:id/cancel` | W01/W02/W03 | G/P list, G/Hdetail, POST confirm/start/cancel |
| `work-orders/:id/consume-materials`, `:id/production-results` | W04/W05/W03 | Pconsume, Presult; result list dari GETWOdetail |
| `work-order-operations/:id/start`, `:id/complete` | W06/W03 | Pstart, POST complete |
| `qc-parameters`, `qc-parameters/:id` | Q01 | G/P list, Ddeactivate |
| `qc-checklists`, `qc-checklists/:id` | Q02/Q03/Q04 | G/P list, GET detail, Ddeactivate |
| `qc-defect-types` | Q05 | G/P list |
| `qc-inspections`, `qc-inspections/:id`, `:id/complete`, `:id/cancel`, `qc-inspections/defect-summary` | Q06/Q07/Q08/Q09 | G/P list, GET detail, POST complete/cancel, Gsummary |
| `fiscal-years`, `fiscal-years/:id`, `:id/close` | F01/F02 | G/P list, GET detail, Pclose |
| `accounting-periods`, `accounting-periods/:id/status` | F02 | G/P list, Hstatus |
| `accounts`, `accounts/:id` | F03/F04 | G/P list, G/Hdetail |
| `journal-entries`, `journal-entries/:id`, `:id/post`, `:id/reverse` | F05/F06/F07 | G/P list, GET detail, Ppost/reverse |
| `general-ledger`, `account-balances` | F08/F09 | G masing-masing |
| `ap-transactions`, `ap-transactions/aging`, `ap-payments` | F10/F11/F12/F13 | Gtransactions/Gaging, G/Ppayments |
| `ar-transactions`, `ar-transactions/aging` | F14/F15 | Gtransactions/Gaging |
| `bank-accounts`, `bank-accounts/:id/transactions`, `:id/reconciliations` | F16/F17 | G/P accounts, Gtransactions/Greconciliations |
| `bank-transactions`, `bank-reconciliations`, `bank-reconciliations/:id/complete` | F18/F19/F20 | Ptransaction/Preconciliation/POST complete |
| `tax-codes`, `overhead-rates` | F21/F22 | G/P masing-masing |
| `reports/trial-balance`, `reports/profit-loss`, `reports/balance-sheet`, `reports/cash-flow` | F23/F24/F25/F26 | G masing-masing |

### Dependency yang harus diperiksa per form

| Lookup | API/sumber yang ada | Permission | Keterbatasan |
|---|---|---|---|
| Produk/varian | Gproducts, Gproducts:id, Gproducts:id/variants | MD.R | Tidak ada globalvariants searchendpoint; lookup bertahap atau contextproduk |
| UoM/conversion/kategori/atribut | API master terkait di atas | MD.R | Jangan copy master di frontend atau mengubah konversi sendiri |
| Gudang/cabang/lokasi | Gbranches/Gwarehouses/Gwarehouses:id/locations | INV.R | Tidak diberikan semua create-role; BL02 |
| Batch | Gproducts/variants:variantId/batches | INV.R | Identifier variant harus dari context/API, bukan ketikan ID |
| Supplier/customer | Tidak ada controller | Belum ada kontrak | BL01; nama/code pada list transaksi tidak selalu menyertakan supplier/customer ID |
| PO/SO sumber | Gpurchase-orders:id / Gsales-orders:id dan list | PO.R / SO.R | Staf gudang tidak punya akses default; handoff nomor saja tidak menyelesaikan lookup |
| GR untuk vendor invoice/QC | Ggoods-receipts dan detail | GR.R | Production-role tidak mempunyaiGR.R |
| DO untuk invoice | Gdelivery-orders dan detail | DO.R | Staffpenjualan punyaR; SO yang sama/confirmed/unused divalidasi server |
| Production result untuk final QC | Gwork-orders:id.results | MFG.R | Tidak ada globalproductionresults/listdetailendpoint; mulai dari WO |
| BOM active | Gbom, Gbom:id, Gbom-versions:id | BOM.R | Pilihan valid perlu status dari server |
| Periode/CoA | Gaccounting-periods/Gaccounts | ACC.R | REP.R saja belum cukup untuk periodpicker BL04 |
| Bank account | Gbank-accounts | BANK.R | Manager tidak memilikiBANK.R; paymentreceipt DTO tidak mempunyai bankAccountId |
| Movement type | Seed migration003, sembilan code | INV.W untuk create; tidak ada GETtype | Mapping UI harus mengikuti seed; jangan membangun typeadministration palsu |
| Approver/user label | Actor metadata yang sudah dikembalikan dokumen | Permission dokumen | Tidak ada usersdirectory; jangan mengarang nama dari ID |

Movement type seed: `PURCHASE_RECEIPT`, `PRODUCTION_IN`, `RETURN_CUSTOMER`,
`ADJUSTMENT_IN`, `SALES_DELIVERY`, `PRODUCTION_OUT`, `RETURN_SUPPLIER`,
`ADJUSTMENT_OUT`, `TRANSFER`. Keberadaan code tidak berarti ada return-document
flow, credit note, atau reverseinvoice. **ASUMSI AS11:** daftar jenis yang boleh
dipilih manual perlu review domain agar tidak menggandakan jalur otomatis.

## 6. Review checklist sebelum wireframe

- Seluruh 115 ID inventory di atas mencakup halaman dan mode embedded; jumlah ini bukan 115 halaman terpisah yang wajib diimplementasikan sekaligus.
- Semua unit memakai state profile yang mendefinisikan keenam state dan mempunyai permission/aksi atau GAP eksplisit.
- Cross-role journeys J01–J07 pada UX specification menunjuk ID yang konsisten dengan inventory.
- P0/P1 dependency blocked harus terlihat pada perencanaan; jangan menyebut workflow selesai hanya karena admin dapat menjalankannya.
- Semua input mengikuti DTO; read-only output tidak diperlakukan sebagai field editable otomatis.
- Aksi confirm/post/pay/result tidak memakai optimistic success atau retry mutation otomatis.
- Tidak ada UI FigCraft, role/permission baru, businessrule, migration, atau endpoint yang dibuat oleh dokumen ini.
- Status backend ditinjau statis; hasil ini bukan laporan uji runtime 204 endpoint atau user research lapangan.
