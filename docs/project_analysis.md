# Backend ERP — Analisis Proyek Lengkap

> **Terakhir diperbarui:** Juli 2026
> **Versi:** NestJS v11 + Fastify + PostgreSQL + Kysely
> **Arsitektur:** Multi-Tenant, Modular, REST API

---

## Daftar Isi

1. [Ikhtisar Proyek](#1-ikhtisar-proyek)
2. [Tech Stack](#2-tech-stack)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Modul yang Sudah Dikerjakan](#4-modul-yang-sudah-dikerjakan)
5. [Flow Data Per Modul](#5-flow-data-per-modul)
6. [Relasi Antar Modul](#6-relasi-antar-modul)
7. [Skema Database (Semua Tabel)](#7-skema-database-semua-tabel)
8. [Rules dan Constraint Bisnis](#8-rules-dan-constraint-bisnis)
9. [Common Services dan Infrastructure](#9-common-services-dan-infrastructure)
10. [Status Pengembangan dan Roadmap](#10-status-pengembangan-dan-roadmap)

---

## 1. Ikhtisar Proyek

Sistem backend ERP (Enterprise Resource Planning) **multi-tenant** yang dirancang untuk industri **manufaktur dan distribusi** (khususnya tekstil/garmen berdasarkan seed data QC). Sistem ini menggunakan arsitektur modular yang memungkinkan pengembangan bertahap per domain bisnis.

### Karakteristik Utama

| Aspek | Detail |
|---|---|
| **Pola Arsitektur** | Multi-tenant schema isolation (satu schema PostgreSQL per tenant) |
| **Database** | PostgreSQL dengan Kysely (type-safe query builder) |
| **Auth** | JWT access token (15 menit) + refresh token rotation (7 hari) |
| **Keamanan ID** | HashID — semua ID di-encode Sqids sebelum keluar ke client |
| **Penomoran Dokumen** | Atomic counter per tipe dokumen per tahun (PR-2026-00001) |
| **RBAC** | 19 modul x 5 aksi (read, write, delete, approve, export) |

---

## 2. Tech Stack

### Dependensi Utama

| Kategori | Library | Versi | Kegunaan |
|---|---|---|---|
| Framework | NestJS | v11 | Modular backend framework |
| HTTP Adapter | Fastify | — | 2–3x lebih cepat dari Express |
| Database ORM | Kysely | v0.28 | Type-safe SQL query builder |
| Database | PostgreSQL | — | Relational database |
| Auth | @nestjs/jwt + passport-jwt | — | JWT management |
| Cache | ioredis | — | Rate limiting, token blacklist, session |
| Validation | class-validator + class-transformer | — | Validasi DTO otomatis |
| Security | @fastify/helmet, @fastify/cors, @fastify/rate-limit | — | Security headers, CORS, rate limit |
| Hashing | bcrypt | — | Password hashing |
| ID Encoding | sqids | — | Obfuscate ID dari client |
| Scheduler | @nestjs/schedule | — | Cron job (token cleanup) |

### Environment Variables

```
PORT=3000
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD   (PostgreSQL)
REDIS_URL                                              (Redis)
JWT_ACCESS_SECRET                                      (Min 64 chars)
JWT_REFRESH_SECRET                                     (Berbeda dari access)
ALLOWED_ORIGINS                                        (CORS whitelist)
NODE_ENV                                               (development / production)
```

---

## 3. Arsitektur Sistem

### Multi-Tenant Schema Isolation

```
PostgreSQL Database
├── schema: public                  ← Data sistem (tenants, users, roles, refresh_tokens)
│   ├── tenants
│   ├── users
│   ├── roles
│   ├── user_roles
│   ├── tenant_secrets
│   ├── refresh_tokens
│   └── migration_history
│
├── schema: tenant_abc              ← Data tenant "abc"
│   ├── (semua tabel domain bisnis)
│   └── ...
│
└── schema: tenant_xyz              ← Data tenant "xyz"
    └── ...
```

### Request Lifecycle

```
HTTP Request
  │
  ├─► [Fastify Rate Limit]         ← 300 req/menit per IP (app level)
  ├─► [Helmet]                     ← Security headers
  ├─► [CORS]                       ← Whitelist origin
  │
  ├─► [TenantInterceptor]          ← Extract tenant_code dari JWT → set ke request context
  ├─► [HashIdDecodeInterceptor]    ← Decode HashID di request body/params
  │
  ├─► [JwtAuthGuard]               ← Verifikasi JWT access token + cek blacklist Redis
  ├─► [PermissionGuard]            ← Cek module.action permission dari JWT payload
  │
  ├─► [Controller]
  │     └─► @TenantDb()            ← Inject Kysely instance dengan search_path tenant
  │         └─► [Service]          ← Business logic
  │               └─► [DatabaseService.withTenantTransaction()]
  │                     └─► PostgreSQL (schema tenant)
  │
  ├─► [HashIdInterceptor]          ← Encode semua ID integer di response → HashID
  └─► [GlobalExceptionFilter]      ← Format error response konsisten
```

### Struktur Direktori

```
src/
├── main.ts                              ← Bootstrap (Fastify, guards, pipes, filters)
├── app.module.ts                        ← Root module
├── types/                               ← TypeScript types (database.types.ts)
├── common/
│   ├── document-number.service.ts       ← Atomic document numbering
│   ├── decorators/tenant-db.decorator.ts ← @TenantDb() custom decorator
│   ├── filters/global-exception.filter.ts
│   ├── hashid/                          ← ID obfuscation layer
│   │   ├── hashid.service.ts
│   │   ├── hashid.interceptor.ts        ← Encode ID di response
│   │   ├── hashid-decode.interceptor.ts ← Decode ID di request
│   │   └── hashid.pipe.ts              ← HashIdPipe untuk @Param()
│   └── interceptors/tenant.interceptor.ts
├── database/
│   ├── database.service.ts              ← Pool, getTenantDb(), withTenantTransaction()
│   ├── migration.service.ts             ← Auto-migration on startup dengan checksum
│   └── migrations/
│       ├── public/                      ← Schema publik (users, tenants, dll)
│       └── tenant/                      ← Schema per tenant (001–011)
└── modules/
    ├── auth/
    ├── product/
    ├── inventory/
    ├── purchase-order/
    ├── sales-order/
    ├── bom/                             ← Bill of Materials module
    ├── production/                      ← Production & MRP module
    ├── quality-control/                 ← Quality Control module
    └── accounting/                      ← Accounting & Finance module
```

---

## 4. Modul yang Sudah Dikerjakan

### Modul Aktif (Terdaftar di AppModule)

| No | Modul | Status | Keterangan |
|---|---|---|---|
| 1 | **Auth** | AKTIF | Login, logout, refresh token, RBAC |
| 2 | **Product** | AKTIF | Master produk, varian, atribut, batch, supplier, customer, UoM |
| 3 | **Inventory** | AKTIF | Pergerakan stok, stock opname, warehouse, query stok |
| 4 | **Purchase Order** | AKTIF | PR → RFQ → PO → GR → Vendor Invoice |
| 5 | **Sales Order** | AKTIF | Quotation → SO → DO → Customer Invoice → Payment |
| 6 | **BOM** | AKTIF | BOM Header, Versioning, Tree Items, Operations, By-Products, Explode BOM |
| 7 | **Production** | AKTIF | Work Orders, MRP Demands, Material Consumption (`PRODUCTION_OUT`), Production Results (`PRODUCTION_IN`), Operations Tracking, Auto MTO Demand dari SO |
| 8 | **Quality Control** | AKTIF | QC Parameters, Checklists, Defect Types, Inspections (Incoming, In-Process, Final), QC Confirmation |
| 9 | **Accounting** | AKTIF | Chart of Accounts, Fiscal Year & Periods, Journal Entries, GL, AP/AR + Auto-Posting SO/PO, Bank & Reconciliation, Tax, Overhead Rates |

### Skema DB Ada, Modul NestJS Belum Aktif (Commented Out di app.module.ts)

| No | Modul | Migration SQL | NestJS Module |
|---|---|---|---|
| 8 | **Quality Control** | 008_create_quality_control.sql | QualityControlModule (belum dibuat) |
| 9 | **Accounting** | 009_create_accounting.sql | AccountingModule (belum dibuat) |

---

## 5. Flow Data Per Modul

### 5.1 Auth Module

**Login Flow:**
```
POST /api/v1/auth/login { email, password, tenantCode }
  1. Cek rate limit (Redis: ratelimit:login:{ip}, max 5x / 15 menit)
  2. Query tenant aktif dari public.tenants
  3. Query user aktif dari public.users (email + tenant_id)
  4. bcrypt.compare(password, password_hash)
  5. Ambil roles & permissions dari public.user_roles JOIN public.roles
  6. Update last_login_at
  7. Generate JWT access token (15 menit)
     Payload: sub, email, tenantId, tenantCode, roles, permissions, jti
  8. Generate refresh token (random 64 bytes) → hash SHA-256
  9. Simpan token_hash ke public.refresh_tokens + cache ke Redis
 10. Encode userId dengan HashID (salt dari public.tenant_secrets)

Response: { accessToken, refreshToken, expiresIn, user: {...} }
```

**Refresh Token Flow:**
```
POST /api/v1/auth/refresh { refreshToken }
  1. Verify JWT signature refresh token
  2. Cek tokenHash di Redis (fast path) / fallback ke DB
  3. Revoke token lama (rotation — 1 token hanya boleh dipakai 1x)
  4. Generate token pair baru
```

**Logout Flow:**
```
POST /api/v1/auth/logout
  1. Blacklist JTI di Redis sampai access token expired (15 menit)
  2. Revoke semua refresh token user di DB
  3. Hapus session dari Redis
```

**Token Cleanup:** `TokenCleanupService` — cron job otomatis menghapus refresh_tokens expired dari database.

---

### 5.2 Product Module

**Hierarki Data:**
```
UoM (Unit of Measure)
└── UoM Conversions               ← Konversi antar satuan

Product Categories (tree/hierarchy self-referencing)

Attributes → Attribute Values     ← Warna, Ukuran, Material, dll

Products (master)
├── has_variant = false → 1 ProductVariant otomatis
└── has_variant = true  → banyak ProductVariant
    └── ProductVariantAttributes  ← Mapping variant <-> attribute value

Batches (Lot tracking)            ← Nomor batch, tgl produksi, expired
Suppliers                         ← Master data supplier
Customers                         ← Master data customer (credit_limit, payment_term)
```

**API Endpoints Product:**

| Method | Path | Permission |
|---|---|---|
| GET | /products | master_data.read |
| GET | /products/:id | master_data.read |
| POST | /products | master_data.write |
| PATCH | /products/:id | master_data.write |
| GET | /products/:id/variants | master_data.read |
| POST | /products/:id/variants | master_data.write |
| GET/POST | /uom, /uom-conversions | master_data.read/write |
| GET/POST | /product-categories | master_data.read/write |
| GET/POST | /attributes, /attribute-values | master_data.read/write |
| GET/POST | /suppliers, /customers | master_data.read/write |
| GET/POST | /batches | master_data.read/write |

---

### 5.3 Inventory Module

**Transaction Flow:**
```
InventoryMovementTypes (seed data, 9 tipe):
  PURCHASE_RECEIPT  (in)    ← dari Goods Receipt
  PRODUCTION_IN     (in)    ← dari Production Result
  RETURN_CUSTOMER   (in)    ← retur dari customer
  ADJUSTMENT_IN     (in)    ← koreksi opname
  SALES_DELIVERY    (out)   ← dari Delivery Order
  PRODUCTION_OUT    (out)   ← bahan baku ke produksi
  RETURN_SUPPLIER   (out)   ← retur ke supplier
  ADJUSTMENT_OUT    (out)   ← koreksi opname
  TRANSFER          (transfer) ← antar gudang

InventoryMovement (header: draft → confirmed / cancelled)
└── InventoryMovementItems (variant, batch, from/to warehouse, qty, unit_cost)

[Saat confirm]:
  → REFRESH MATERIALIZED VIEW stock_summary
    stock_summary = SUM(qty_in) - SUM(qty_out) per (variant, warehouse, batch)

available_stock (MATERIALIZED VIEW)
  = stock_summary - quantity_pending dari confirmed Sales Orders
```

**API Endpoints Inventory:**

| Method | Path | Permission |
|---|---|---|
| GET/POST | /inventory-movements | inventory.read/write |
| POST | /inventory-movements/:id/confirm | inventory.approve |
| POST | /inventory-movements/:id/cancel | inventory.approve |
| GET | /stock-summary | inventory.read |
| GET | /available-stock | inventory.read |
| GET/POST | /stock-opnames | inventory.read/write |
| POST | /stock-opnames/:id/start-counting | inventory.write |
| POST | /stock-opnames/:id/complete | inventory.approve |
| GET/POST/PATCH | /warehouses, /warehouse-locations | master_data.read/write |

---

### 5.4 Purchase Order Module

**Alur Lengkap Pembelian:**

```
[1. Purchase Request (PR)]
  draft → submitted → approved / rejected → closed
  - Dibuat oleh staff pembelian / gudang
  - Approval oleh manager
  - Nomor: PR-YYYY-NNNNN

[2. Request for Quotation (RFQ)]
  draft → sent → closed / cancelled
  - Satu RFQ bisa menggabungkan beberapa PR items (rfq_item_pr_items)
  - Kirim ke beberapa supplier
  - Nomor: RFQ-YYYY-NNNNN

[3. Supplier Quotes]
  pending → received → selected / rejected
  - Per supplier per RFQ (rfq_supplier_quotes)
  - Detail harga per item (rfq_supplier_quote_items)
  - Pilih 1 quote → status = 'selected'

[4. Purchase Order (PO)]
  draft → confirmed → partial / received → cancelled
  - Bisa dari RFQ quote yang dipilih (rfq_supplier_quote_id)
  - Bisa dibuat manual (direct PO)
  - quantity_pending = quantity - quantity_received (GENERATED COLUMN)
  - Nomor: PO-YYYY-NNNNN

[5. Goods Receipt (GR)]
  draft → confirmed / cancelled
  - Satu PO bisa punya banyak GR (partial delivery)
  - Saat confirm: buat InventoryMovement PURCHASE_RECEIPT
                  update quantity_received di PO items
                  update status PO: partial / received
  - Nomor: GR-YYYY-NNNNN

[6. Vendor Invoice]
  unpaid → partial → paid / cancelled
  - Satu invoice bisa link ke beberapa GR (vendor_invoice_receipts)
  - outstanding_amount = total_amount - paid_amount (GENERATED COLUMN)
  - Nomor: VI-YYYY-NNNNN
```

---

### 5.5 Sales Order Module

**Alur Lengkap Penjualan:**

```
[1. Sales Quotation (SQ)]
  draft → sent → accepted / rejected / expired / cancelled
  - Dibuat untuk customer, ada valid_until
  - Nomor: SQ-YYYY-NNNNN

[2. Sales Order (SO)]
  draft → confirmed → partial → delivered → invoiced / cancelled
  - Bisa dari quotation (quotation_id) atau direct SO
  - quantity_pending = quantity - quantity_delivered (GENERATED COLUMN)
  - Saat confirmed: otomatis masuk ke available_stock reservation
  - Nomor: SO-YYYY-NNNNN

[3. Delivery Order (DO)]
  draft → confirmed / cancelled
  - Satu SO bisa punya banyak DO (partial delivery)
  - Saat confirm: buat InventoryMovement SALES_DELIVERY
                  update quantity_delivered di SO items
                  update status SO: partial / delivered
  - Nomor: DO-YYYY-NNNNN

[4. Customer Invoice]
  unpaid → partial → paid / cancelled
  - Satu invoice bisa link ke beberapa DO (customer_invoice_deliveries)
  - outstanding_amount = total_amount - paid_amount (GENERATED COLUMN)
  - Nomor: INV-YYYY-NNNNN

[5. Payment Receipt]
  - Satu payment bisa dialokasikan ke beberapa invoice (payment_receipt_allocations)
  - payment_method: cash / transfer / cheque / giro / other
  - Nomor: PAY-YYYY-NNNNN
```

---

### 5.6 BOM Module (Bill of Materials)

**Struktur & Konsep BOM:**
```
BomHeader (1 per product variant, UNIQUE)
└── BomVersions (versioning: draft → active → obsolete)
    ├── BomItems (komponen, multi-level tree dengan parent_item_id, scrap %, phantom BOM)
    ├── BomOperations (urutan proses, work center, duration_minutes, cost_per_minute)
    └── BomByProducts (by_product, scrap, co_product, cost_share_pct)
```

**Fitur Utama & Flow:**
1. **Multi-level Tree Components**: `bom_items` memiliki `parent_item_id` (self-referencing) untuk menyusun struktur produk berjenjang.
2. **Version Management**: Pengaktifan versi (`POST /bom-versions/:id/activate`) secara otomatis mengubah status versi aktif sebelumnya menjadi `obsolete` (hanya 1 versi aktif per BOM Header di DB).
3. **Scrap Calculation**: Auto-calculate `quantity_with_scrap = quantity * (1 + scrap_pct / 100)`.
4. **BOM Explosion**: Endpoint `GET /bom-versions/:id/explode?quantity=N` menggunakan PostgreSQL **Recursive CTE** (`WITH RECURSIVE bom_tree`) untuk meratakan (*flatten*) seluruh hirarki komponen beserta perhitungan rasio kuantitas yang dibutuhkan.
5. **Integrasi**: Method `getActiveVersionForVariant()` disediakan di `BomService` untuk digunakan oleh `ProductionModule` / `MRP`.

**API Endpoints BOM:**

| Method | Path | Permission | Deskripsi |
|---|---|---|---|
| GET | /bom | bom.read | List BOM Header (pagination, search, filter) |
| GET | /bom/:id | bom.read | Detail BOM Header + list versions |
| POST | /bom | bom.write | Buat BOM Header baru untuk variant |
| PATCH | /bom/:id | bom.write | Update BOM Header |
| GET | /bom-versions/:id | bom.read | Detail BOM Version + tree items, operations, by-products |
| POST | /bom/:headerId/versions | bom.write | Buat versi BOM baru |
| PATCH | /bom-versions/:id | bom.write | Update versi BOM |
| POST | /bom-versions/:id/activate | bom.approve | Aktifkan versi BOM |
| POST | /bom-versions/:versionId/items | bom.write | Tambah komponen ke versi BOM |
| PATCH | /bom-items/:id | bom.write | Update komponen BOM |
| DELETE | /bom-items/:id | bom.delete | Hapus komponen BOM |
| POST | /bom-versions/:versionId/operations | bom.write | Tambah operasi produksi |
| PATCH | /bom-operations/:id | bom.write | Update operasi produksi |
| DELETE | /bom-operations/:id | bom.delete | Hapus operasi produksi |
| POST | /bom-versions/:versionId/by-products | bom.write | Tambah by-product / scrap |
| DELETE | /bom-by-products/:id | bom.delete | Hapus by-product |
| GET | /bom-versions/:id/explode | bom.read | Explode multi-level BOM berdasarkan quantity |

---

---

### 5.7 Production Module (Work Orders & MRP Demands)

**Struktur & Konsep Production:**

```
[MRP Demands]
  MrpDemands (kebutuhan dari SO confirmed MTO / forecast / safety stock)
  └── status: open → planned → fulfilled / cancelled

[Work Orders]
  WorkOrder (draft → confirmed → in_progress → completed / partially_done → cancelled)
  ├── WorkOrderMaterials (di-generate otomatis dari BOM explosion saat WO confirmed)
  │   └── WorkOrderMaterialLots (realisasi konsumsi per batch, memicu movement PRODUCTION_OUT)
  ├── WorkOrderOperations (di-generate dari BOM operations, tracking actual vs planned duration)
  └── ProductionResults (memicu movement PRODUCTION_IN dan update quantity_produced)
      └── ProductionResultByProducts (produk sampingan aktual)
```

**Alur Kerja & Aturan Bisnis Production:**
1. **Auto MTO Demand dari Sales Order**: Saat Sales Order di-confirm (`POST /sales-orders/:id/confirm`), sistem otomatis mendeteksi produk yang memiliki `can_be_manufactured = true` dan secara otomatis membuat record `mrp_demands` (`demand_type = 'sales_order'`).
2. **Work Order Confirmation**: Saat WO di-confirm (`POST /work-orders/:id/confirm`), `WorkOrderService` memanggil `BomService.explodeBom()` untuk mengkalkulasi kebutuhan bahan baku dan menyimpannya di `work_order_materials`, serta meng-copy operasi BOM ke `work_order_operations`.
3. **Material Consumption**: Penggunaan material (`POST /work-orders/:id/consume-materials`) mencatat lot/batch yang digunakan, memperbarui `quantity_consumed`, dan membuat pergerakan inventaris `PRODUCTION_OUT`.
4. **Production Results**: Pencatatan hasil jadi (`POST /work-orders/:id/production-results`) menambah stok di gudang output via pergerakan inventaris `PRODUCTION_IN`, dan memperbarui status WO menjadi `completed` atau `partially_done`.

**API Endpoints Production:**

| Method | Endpoint | Permission | Keterangan |
|---|---|---|---|
| GET | `/mrp-demands` | mrp.read | List semua MRP Demands |
| POST | `/mrp-demands` | mrp.write | Buat MRP Demand manual |
| POST | `/mrp-demands/:id/cancel` | mrp.write | Batalkan MRP Demand |
| GET | `/work-orders` | production.read | List Work Orders dengan filter |
| GET | `/work-orders/:id` | production.read | Detail WO + materials + operations + results |
| POST | `/work-orders` | production.write | Buat Work Order baru (draft) |
| PATCH | `/work-orders/:id` | production.write | Update Work Order (draft only) |
| POST | `/work-orders/:id/confirm` | production.approve | Confirm WO (auto-generate materials & ops dari BOM) |
| POST | `/work-orders/:id/start` | production.write | Mulai produksi (status: in_progress) |
| POST | `/work-orders/:id/cancel` | production.approve | Batalkan Work Order |
| POST | `/work-orders/:id/consume-materials` | production.write | Catat konsumsi material (trigger movement PRODUCTION_OUT) |
| POST | `/work-orders/:id/production-results` | production.write | Catat hasil produksi (trigger movement PRODUCTION_IN) |
| POST | `/work-order-operations/:id/start` | production.write | Mulai tahap operasi |
| POST | `/work-order-operations/:id/complete` | production.write | Selesaikan tahap operasi |

---

### 5.8 Quality Control (Skema Siap, Module Belum Aktif)

```
[Quality Control]
  QcParameters → QcChecklists → QcChecklistItems (template inspeksi)
  QcInspections (per GR = incoming / per ProductionResult = final)
  ├── QcInspectionItems (hasil per parameter: pass/fail, numeric, text)
  └── QcDefects (cacat yang ditemukan per tipe defect)
```

---

### 5.8 Accounting (Skema Siap, Module Belum Aktif)

```
[Fiscal Year & Periods]
  FiscalYears → AccountingPeriods (monthly, status: open/closed/locked)

[Chart of Accounts — Double Entry Bookkeeping]
  Accounts (hierarchical CoA, 6 tipe: asset/liability/equity/revenue/expense/cost_of_goods)
  system_account = referensi akun untuk auto-posting

[Journal Entries]
  JournalEntries (draft → posted → reversed)
  ├── Harus balanced: total_debit = total_credit (CHECK CONSTRAINT di DB)
  └── JournalEntryLines (debit XOR credit per baris)

[General Ledger & Balances]
  GeneralLedger (flattened ledger, running balance)
  AccountBalances (ringkasan per akun per periode)

[AP — Accounts Payable]
  ApTransactions (link dari VendorInvoice) → ApPayments → ApPaymentAllocations

[AR — Accounts Receivable]
  ArTransactions (link dari CustomerInvoice) → ArReceiptAllocations

[Cash & Bank]
  BankAccounts → BankTransactions → BankReconciliations

[Tax]
  TaxCodes (PPN / PPh) → TaxLines (per dokumen)

[Cost Accounting / HPP]
  OverheadRates → ProductionCostSheets (per WorkOrder) → ProductionCostDetails
```

---

## 6. Relasi Antar Modul

### Dependency Graph (dari bawah ke atas)

```
 ┌───────────────────────────────────────────────────────────────┐
 │                        FOUNDATION                              │
 │  branches → warehouses                                         │
 │  uom <-> uom_conversions                                       │
 └──────────────────────────┬────────────────────────────────────┘
                            │ (semua modul bergantung ke sini)
 ┌──────────────────────────▼────────────────────────────────────┐
 │                     PRODUCT MASTER                             │
 │  product_categories → products → product_variants             │
 │  attributes → attribute_values → product_variant_attributes   │
 │  batches (per variant)                                         │
 │  suppliers, customers                                          │
 └──────┬──────────────────┬────────────────────────────────────┘
        │                  │
 ┌──────▼──────┐    ┌──────▼──────────────────────────────────────┐
 │  INVENTORY  │    │            PURCHASE ORDER                    │
 │  movements  │    │  PR → RFQ → Quotes → PO → GR → Inventory   │
 │  stock_sum  │◄───│  GR.confirm() → PURCHASE_RECEIPT movement   │
 │  opname     │    │  PO → VendorInvoice                         │
 └──────┬──────┘    └────────────────────────────────────────────┘
        │
 ┌──────▼────────────────────────────────────────────────────────┐
 │                      SALES ORDER                               │
 │  Quotation → SO → (reserved di available_stock)               │
 │  SO → DO → Inventory (SALES_DELIVERY movement)                │
 │  SO → CustomerInvoice → PaymentReceipt                        │
 └──────────────────────────┬────────────────────────────────────┘
                            │
 ┌──────────────────────────▼────────────────────────────────────┐
 │                BOM + PRODUCTION                               │
 │  BomHeader → BomVersions → BomItems (tree)                    │
 │  MrpDemands (dari SO MTO) → WorkOrders                        │
 │  WorkOrders → Materials → inventory (PRODUCTION_OUT)          │
 │  WorkOrders → ProductionResults → inventory (PRODUCTION_IN)   │
 └──────────────────────────┬────────────────────────────────────┘
                            │
 ┌──────────────────────────▼────────────────────────────────────┐
 │               QUALITY CONTROL [planned]                        │
 │  GoodsReceipt → QcInspection (incoming)                       │
 │  ProductionResult → QcInspection (final)                      │
 └──────────────────────────┬────────────────────────────────────┘
                            │
 ┌──────────────────────────▼────────────────────────────────────┐
 │                  ACCOUNTING [planned]                          │
 │  VendorInvoice → AP Transaction → Journal Entry               │
 │  CustomerInvoice → AR Transaction → Journal Entry             │
 │  GoodsReceipt.confirm() → Inventory Journal Entry             │
 │  ProductionCostSheet → COGS Journal Entry                     │
 │  PaymentReceipt → Bank Transaction → Journal Entry            │
 └───────────────────────────────────────────────────────────────┘
```

### Cross-Module Data Flow (Kritis)

| Source Event | Target | Data yang Dibawa |
|---|---|---|
| GoodsReceipt.confirm() | inventory_movements | Movement PURCHASE_RECEIPT, update PO qty_received |
| DeliveryOrder.confirm() | inventory_movements | Movement SALES_DELIVERY, update SO qty_delivered |
| SalesOrder.confirm() | available_stock & mrp_demands | SO masuk ke reserved stock & otomatis buat mrp_demands untuk item MTO |
| WorkOrder material consume | inventory_movements | Movement PRODUCTION_OUT |
| ProductionResult.create() | inventory_movements | Movement PRODUCTION_IN |
| StockOpname.complete() | inventory_movements | ADJUSTMENT_IN atau ADJUSTMENT_OUT |

---

## 7. Skema Database (Semua Tabel)

### 7.0 Public Schema (Shared — semua tenant)

| Tabel | Deskripsi |
|---|---|
| `tenants` | Data tenant (perusahaan) |
| `users` | User per tenant |
| `roles` | Role dengan permissions JSONB |
| `user_roles` | Junction user <-> role |
| `tenant_secrets` | Salt untuk HashID per tenant |
| `refresh_tokens` | Refresh token store |
| `migration_history` | Track migrasi SQL per schema |

---

### 7.1 Foundation (Migration 001)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `branches` | id, name, address, city, is_active | — |
| `warehouses` | id, branch_id, name, code, type | type IN (raw_material, wip, finished_goods) |
| `uom` | id, name, symbol | — |
| `uom_conversions` | id, from_uom_id, to_uom_id, factor | UNIQUE(from, to) |

---

### 7.2 Product Master (Migration 002)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `product_categories` | id, name, parent_id | Self-referencing tree |
| `attributes` | id, name | — |
| `attribute_values` | id, attribute_id, value | — |
| `products` | id, code, name, base_uom_id, purchase_uom_id, sales_uom_id, can_be_purchased, can_be_sold, can_be_manufactured, has_variant | code UNIQUE |
| `product_variants` | id, product_id, sku, cost_price, sale_price, min_stock | sku UNIQUE |
| `product_variant_attributes` | variant_id, attribute_value_id | PK composite |
| `batches` | id, variant_id, batch_number, manufacture_date, expiry_date | UNIQUE(variant_id, batch_number) |
| `suppliers` | id, code, name, npwp, payment_term | code UNIQUE |
| `customers` | id, code, name, npwp, credit_limit, payment_term | code UNIQUE |

---

### 7.3 Inventory (Migration 003)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `warehouse_locations` | id, warehouse_id, code, name | UNIQUE(warehouse_id, code) |
| `inventory_movement_types` | id, code, name, direction | direction IN (in, out, transfer) |
| `inventory_movements` | id, movement_type_id, reference_type, reference_id, movement_date, status | status IN (draft, confirmed, cancelled) |
| `inventory_movement_items` | id, movement_id, variant_id, batch_id, from/to_warehouse_id, quantity, unit_cost | quantity > 0 |
| `stock_opnames` | id, warehouse_id, opname_date, status | status IN (draft, counting, completed, cancelled) |
| `stock_opname_items` | id, opname_id, variant_id, system_quantity, actual_quantity, difference | difference GENERATED ALWAYS AS (actual - system) |

**Materialized Views:**
- `stock_summary` — qty on hand per (variant, warehouse, batch)
- `available_stock` — stock_summary dikurangi quantity_pending dari SO confirmed

---

### 7.4 Purchase Order (Migration 004)

| Tabel | Status Flow | Kolom Penting |
|---|---|---|
| `purchase_requests` | draft→submitted→approved/rejected→closed | number PR-YYYY-NNNNN, warehouse_id |
| `purchase_request_items` | — | pr_id, variant_id, quantity, estimated_price |
| `rfqs` | draft→sent→closed/cancelled | number RFQ-YYYY-NNNNN |
| `rfq_items` | — | rfq_id, variant_id, quantity |
| `rfq_item_pr_items` | junction | rfq_item_id <-> pr_item_id |
| `rfq_supplier_quotes` | pending→received→selected/rejected | rfq_id, supplier_id; UNIQUE(rfq_id, supplier_id) |
| `rfq_supplier_quote_items` | — | quote_id, rfq_item_id, unit_price, lead_time_days |
| `purchase_orders` | draft→confirmed→partial/received→cancelled | number PO-YYYY-NNNNN, subtotal, tax, discount, total |
| `purchase_order_items` | — | quantity_received, quantity_pending (GENERATED) |
| `goods_receipts` | draft→confirmed/cancelled | number GR-YYYY-NNNNN, inventory_movement_id |
| `goods_receipt_items` | — | po_item_id, quantity_received, batch_id, location_id |
| `vendor_invoices` | unpaid→partial→paid/cancelled | number VI-YYYY-NNNNN, outstanding_amount (GENERATED) |
| `vendor_invoice_receipts` | junction | invoice_id <-> gr_id |

---

### 7.5 Sales Order (Migration 005)

| Tabel | Status Flow | Kolom Penting |
|---|---|---|
| `sales_quotations` | draft→sent→accepted/rejected/expired/cancelled | number SQ-YYYY-NNNNN, valid_until |
| `sales_quotation_items` | — | quotation_id, variant_id, unit_price, discount_pct, tax_pct |
| `sales_orders` | draft→confirmed→partial→delivered→invoiced/cancelled | number SO-YYYY-NNNNN |
| `sales_order_items` | — | quantity_delivered, quantity_pending (GENERATED) |
| `delivery_orders` | draft→confirmed/cancelled | number DO-YYYY-NNNNN, inventory_movement_id |
| `delivery_order_items` | — | so_item_id, quantity_delivered, batch_id, location_id |
| `customer_invoices` | unpaid→partial→paid/cancelled | number INV-YYYY-NNNNN, outstanding_amount (GENERATED) |
| `customer_invoice_deliveries` | junction | invoice_id <-> do_id |
| `payment_receipts` | — | number PAY-YYYY-NNNNN, payment_method, amount |
| `payment_receipt_allocations` | — | payment_id, invoice_id, amount |

---

### 7.6 BOM (Migration 006)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `bom_headers` | id, variant_id, name | UNIQUE(variant_id) — satu produk satu BOM |
| `bom_versions` | id, bom_header_id, version_number, status, output_quantity, effective_from | status IN (draft, active, obsolete) |
| `bom_items` | id, bom_version_id, parent_item_id, variant_id, is_phantom, quantity, scrap_pct, level, sequence | Self-referencing tree |
| `bom_operations` | id, bom_version_id, sequence, name, work_center, duration_minutes, cost_per_minute | — |
| `bom_by_products` | id, bom_version_id, variant_id, type, cost_share_pct | type IN (by_product, scrap, co_product) |

**Constraint DB penting:** UNIQUE INDEX WHERE status = 'active' memastikan hanya 1 versi aktif per BOM.

---

### 7.7 Production Planning (Migration 007)

| Tabel | Status Flow | Kolom Penting |
|---|---|---|
| `mrp_demands` | open→planned→fulfilled/cancelled | demand_type IN (sales_order, forecast, safety_stock) |
| `mrp_runs` | running→completed/failed | plan_from, plan_to, total_planned |
| `planned_orders` | proposed→approved/cancelled | order_type IN (production, purchase) |
| `planned_order_demands` | junction | planned_order_id <-> demand_id |
| `work_orders` | draft→confirmed→in_progress→completed/partially_done/cancelled | production_type IN (mts, mto) |
| `work_order_materials` | pending→partial→consumed/cancelled | bom_item_id, quantity_planned, quantity_consumed |
| `work_order_material_lots` | — | batch_id, quantity_consumed (audit trail) |
| `work_order_operations` | pending→in_progress→completed/skipped | actual_duration_minutes GENERATED dari (actual_finish - actual_start) |
| `production_results` | — | quantity_produced, inventory_movement_id |
| `production_result_by_products` | — | type IN (by_product, scrap, co_product) |

---

### 7.8 Quality Control (Migration 008)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `qc_parameters` | id, code, name, value_type, min_value, max_value, unit | value_type IN (pass_fail, numeric, text) |
| `qc_checklists` | id, name, inspection_type, product_category_id | inspection_type IN (incoming, final) |
| `qc_checklist_items` | id, checklist_id, parameter_id, sequence, is_required | UNIQUE(checklist_id, parameter_id) |
| `qc_inspections` | id, number, checklist_id, inspection_type, goods_receipt_id, production_result_id, result, disposition | CHECK: incoming→gr_id NOT NULL; final→production_result_id NOT NULL |
| `qc_inspection_items` | id, inspection_id, pass_fail_value, numeric_value, text_value, is_within_spec | — |
| `qc_defect_types` | id, code, name, severity | severity IN (critical, major, minor) |
| `qc_defects` | id, inspection_id, defect_type_id, quantity_defective, disposition | disposition IN (pending, rework, reject, accept_as_is) |

**Seed data QC tekstil/garmen:** 10 parameter + 11 tipe defect sudah tersedia.

---

### 7.9 Accounting (Migration 009)

| Tabel | Kolom Penting | Constraint |
|---|---|---|
| `fiscal_years` | id, name, start_date, end_date, status | end_date > start_date |
| `accounting_periods` | id, fiscal_year_id, period_number, start_date, end_date, status | UNIQUE(fiscal_year_id, period_number); status IN (open, closed, locked) |
| `accounts` | id, code, name, account_type, account_group, is_header, system_account | code UNIQUE; 6 tipe akun |
| `journal_entries` | id, number, period_id, entry_type, status, total_debit, total_credit | CHECK: jika posted → debit = credit |
| `journal_entry_lines` | id, journal_entry_id, account_id, debit, credit | CHECK: debit > 0 XOR credit > 0 |
| `general_ledger` | id, account_id, period_id, journal_entry_id, debit, credit, balance | — |
| `account_balances` | id, account_id, period_id, opening, total_debit, total_credit, closing | UNIQUE(account_id, period_id) |
| `ap_transactions` | id, vendor_invoice_id, outstanding_amount (GENERATED) | UNIQUE(vendor_invoice_id) |
| `ap_payments` | id, number, supplier_id, payment_method, amount | — |
| `ap_payment_allocations` | id, ap_payment_id, ap_transaction_id, amount | UNIQUE(payment, transaction) |
| `ar_transactions` | id, customer_invoice_id, outstanding_amount (GENERATED) | UNIQUE(customer_invoice_id) |
| `ar_receipt_allocations` | id, payment_receipt_id, ar_transaction_id, amount | — |
| `bank_accounts` | id, account_id, bank_name, account_number, currency | account_number UNIQUE |
| `bank_transactions` | id, bank_account_id, transaction_type, amount, is_reconciled | — |
| `bank_reconciliations` | id, bank_account_id, period_id, difference (GENERATED) | UNIQUE(bank_account, period) |
| `tax_codes` | id, code, name, tax_type, rate, account_id | tax_type IN (ppn, pph) |
| `tax_lines` | id, tax_code_id, reference_type, reference_id, taxable_amount, tax_amount | — |
| `overhead_rates` | id, period_id, rate_type, rate | UNIQUE(period_id, name) |
| `production_cost_sheets` | id, work_order_id, raw_material_cost, labor_cost, overhead_cost, cost_per_unit | UNIQUE(work_order_id) |
| `production_cost_details` | id, cost_sheet_id, cost_type, total_cost | cost_type IN (raw_material, labor, overhead, by_product) |

**Seed data CoA:** 40+ akun (Kas s/d Beban Lain-lain), 12 system_account untuk auto-posting.

---

### 7.10 Document Counters (Migration 010)

| Tabel | Kolom | Keterangan |
|---|---|---|
| `document_counters` | doc_type, year, counter | PK: (doc_type, year) |

Tipe dokumen: PR, RFQ, PO, GR, VI, APV, SQ, SO, DO, INV, PAY

---

### 7.11 Available Stock View (Migration 011)

| View | Deskripsi |
|---|---|
| `available_stock` | MATERIALIZED VIEW = stock_summary - quantity_reserved dari SO confirmed |

---

## 8. Rules dan Constraint Bisnis

### 8.1 Status Transition Rules

| Dokumen | Transisi yang Diizinkan |
|---|---|
| Purchase Request | draft → submitted → approved/rejected; approved → closed |
| RFQ | draft → sent → closed/cancelled |
| Supplier Quote | pending → received → selected/rejected |
| Purchase Order | draft → confirmed → partial/received/cancelled |
| Goods Receipt | draft → confirmed/cancelled |
| Vendor Invoice | unpaid → partial → paid/cancelled |
| Sales Quotation | draft → sent → accepted/rejected/expired/cancelled |
| Sales Order | draft → confirmed → partial → delivered → invoiced/cancelled |
| Delivery Order | draft → confirmed/cancelled |
| Customer Invoice | unpaid → partial → paid/cancelled |
| Inventory Movement | draft → confirmed/cancelled |
| Stock Opname | draft → counting → completed/cancelled |
| Work Order | draft → confirmed → in_progress → completed/partially_done/cancelled |
| BOM Version | draft → active → obsolete |
| Journal Entry | draft → posted → reversed |
| QC Inspection | draft → completed/cancelled |

### 8.2 Business Rules Penting

1. **Atomic Document Numbering** — DocumentNumberService menggunakan UPDATE...RETURNING dalam transaksi untuk counter yang race-condition safe. Format: TYPE-YYYY-NNNNN.

2. **Stock Tidak Boleh Negatif** — available_stock materialized view diperbaharui setelah setiap InventoryMovement confirmed. DO tidak boleh dibuat jika qty melebihi available stock.

3. **GR hanya bisa dari PO confirmed** — goods_receipts.po_id → PO harus status confirmed/partial.

4. **Satu BOM aktif per produk** — UNIQUE INDEX WHERE status = 'active' di level database.

5. **Journal Entries harus balanced** — CHECK (status != 'posted' OR total_debit = total_credit) di level database.

6. **Journal Lines: debit XOR credit** — CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)).

7. **QC Inspection Source Constraint** — CHECK: incoming → goods_receipt_id NOT NULL; final → production_result_id NOT NULL.

8. **HashID per Tenant** — Salt unik per tenant di tenant_secrets.hash_salt, ID tidak bisa di-decode lintas tenant.

9. **Refresh Token Rotation** — Setiap refresh token hanya boleh dipakai sekali. Langsung direvoke setelah dipakai, token baru digenerate.

10. **Rate Limiting Login** — Max 5 percobaan dalam 15 menit per IP. Counter direset setelah login sukses.

11. **GR Partial Delivery** — Satu PO bisa punya banyak GR. quantity_received di PO items diupdate setiap GR confirmed. Status PO otomatis berubah ke partial atau received.

12. **DO Partial Delivery** — Satu SO bisa punya banyak DO. quantity_delivered diupdate, status SO berubah ke partial atau delivered.

13. **Invoice Multi-Source** — Satu Vendor Invoice bisa mencakup beberapa GR. Satu Customer Invoice bisa mencakup beberapa DO.

14. **Payment Allocation** — Satu payment bisa dialokasikan ke beberapa invoice (partial payment support).

### 8.3 Audit Trail

Semua dokumen penting memiliki kolom audit:
- `created_by`, `created_at`
- `confirmed_by`, `confirmed_at`
- `approved_by`, `approved_at`
- `cancelled_by`, `cancelled_at`
- `submitted_by`, `submitted_at`

---

## 9. Common Services dan Infrastructure

### 9.1 DatabaseService

```typescript
db.getPublicDb()                          // Kysely instance untuk schema public
db.getTenantDb(tenantCode)                // Kysely instance + search_path tenant
db.withTenantTransaction(tenantCode, fn)  // Transaksi atomic di schema tenant
```

Connection pool: max 20 connections, idleTimeout 30s, connectionTimeout 3s.

### 9.2 MigrationService

- Auto-run on startup (onModuleInit)
- Menjalankan semua migration SQL secara ordered (diurutkan berdasarkan nama file)
- Menyimpan checksum SHA-256 setiap file ke migration_history
- **TIDAK BOLEH** edit file migration yang sudah dijalankan (checksum mismatch = error fatal)
- Berjalan untuk schema public dan semua tenant aktif

### 9.3 DocumentNumberService

```typescript
// Harus dipanggil di dalam transaksi aktif
const number = await docNumberService.generate(db, 'PO');
// Output: "PO-2026-00001"
```

Menggunakan UPDATE...RETURNING untuk mencegah race condition pada concurrent requests.

### 9.4 HashId System

- **HashIdService** — Encode/decode ID menggunakan library Sqids
- **HashIdInterceptor** — Otomatis encode semua field id dan *_id di response
- **HashIdDecodeInterceptor** — Decode HashID di request body sebelum sampai ke controller
- **HashIdPipe** — Decode HashID di @Param() route parameter
- Salt unik per tenant dari public.tenant_secrets.hash_salt

### 9.5 Permission System (RBAC)

19 Modul yang tersedia:
```
inventory, purchase_request, purchase_order, goods_receipt,
vendor_invoice, sales_quotation, sales_order, delivery_order,
customer_invoice, bom, production, mrp, quality_control,
accounting, bank, reporting, user_management, role_management,
master_data, tenant_settings
```

5 Aksi: `read`, `write`, `delete`, `approve`, `export`

**Default Role Templates:**

| Role | Akses Utama |
|---|---|
| `admin` | Semua modul, semua aksi |
| `manager` | Semua modul operasional + approve; accounting read-only |
| `staff_gudang` | Inventory, GR, DO, QC |
| `staff_produksi` | Inventory (read), BOM, Production, QC |
| `staff_pembelian` | PR, PO, VI, master_data |
| `staff_penjualan` | SQ, SO, Customer Invoice, inventory (read) |
| `akuntan` | Accounting, bank, invoice (read) |

### 9.6 Global Middleware Stack (dalam urutan eksekusi)

```
@fastify/rate-limit        → 300 req/menit per IP
@fastify/helmet            → Security headers (CSP, HSTS di prod)
@fastify/cors              → Whitelist origin dari env
ValidationPipe             → whitelist=true, forbidNonWhitelisted=true, transform=true
GlobalExceptionFilter      → Format error response konsisten
TenantInterceptor          → Inject tenant context ke request
HashIdDecodeInterceptor    → Decode ID di request body
HashIdInterceptor          → Encode ID di response
```

---

## 10. Status Pengembangan dan Roadmap

### Sudah Selesai

- [x] Infrastruktur (Database, Migration, HashId, Auth, Common)
- [x] Modul Auth (JWT, refresh token rotation, RBAC, rate limiting)
- [x] Modul Product (master produk, varian, atribut, batch, UoM, supplier, customer)
- [x] Modul Inventory (movements, stock opname, materialized views)
- [x] Modul Purchase Order (PR → RFQ → PO → GR → Vendor Invoice)
- [x] Modul Sales Order (Quotation → SO → DO → Invoice → Payment)
- [x] Modul BOM (BOM Header, Versioning, Tree Items, Operations, By-Products, Explode BOM)
- [x] Modul Production (Work orders, MRP demands, material consumption, production results, SO MTO integration)
- [x] Modul Quality Control (QC Parameters, Checklists, Defect Types, Inspections, Pass/Fail disposition)
- [x] Modul Accounting (CoA, Fiscal Periods, Journal Entries, GL, AP/AR, Bank Reconciliation, Tax Codes, Overhead Rates, SO/PO Auto-Posting)

### Fitur Masa Depan

- [ ] MRP Engine (auto-calculate planned orders dari demands)
- [ ] Laporan keuangan (P&L, Balance Sheet, Cash Flow)
- [ ] Export laporan ke Excel/PDF
- [ ] User & Role management API
- [ ] Tenant onboarding API
- [ ] Notifikasi real-time (WebSocket)
- [ ] Audit log terpusat

---

*Dokumentasi ini di-generate berdasarkan analisis kode sumber per Juli 2026.*
