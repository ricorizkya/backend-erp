# Backend ERP — Dokumentasi Teknis Lengkap

## Daftar Isi

1. [Ikhtisar Proyek](#1-ikhtisar-proyek)
2. [Tech Stack & Konfigurasi](#2-tech-stack--konfigurasi)
3. [Arsitektur Aplikasi](#3-arsitektur-aplikasi)
4. [Modul Auth](#4-modul-auth-srcmodulesauth)
5. [Modul Product](#5-modul-product-srcmodulesproduct)
6. [Modul Inventory](#6-modul-inventory-srcmodulesinventory)
7. [Infrastruktur & Common](#7-infrastruktur--common)
8. [Skema Database](#8-skema-database)
9. [Roadmap Pengembangan](#9-roadmap-pengembangan)

---

## 1. Ikhtisar Proyek

Sistem backend ERP multi-tenant yang dirancang untuk industri manufaktur dan distribusi. Dibangun dengan **NestJS** + **Fastify** + **PostgreSQL** + **Kysely**. Arsitektur modular memungkinkan pengembangan bertahap — saat ini tiga modul utama sudah aktif: **Auth**, **Product**, dan **Inventory**.

### Fitur Utama yang Sudah Aktif
- Autentikasi JWT dengan refresh token rotation dan rate limiting
- Manajemen produk dengan sistem variant, atribut, batch/lot, dan multi-UoM
- Manajemen inventory: pergerakan stok (in/out/transfer), stock opname, dan pelaporan stok real-time
- Role-based permission system (RBAC) dengan 19 modul dan 5 aksi

---

## 2. Tech Stack & Konfigurasi

### Dependensi Utama
| Kategori | Library | Kegunaan |
|---|---|---|
| Framework | NestJS v11 | Modular backend framework |
| HTTP Adapter | Fastify | Performa 2-3x lebih cepat dari Express |
| Database | PostgreSQL + Kysely v0.28 | Type-safe SQL query builder |
| Auth | passport-jwt + @nestjs/jwt | JWT access & refresh token |
| Cache/Queue | ioredis | Rate limiting, token blacklist, session cache |
| Validation | class-validator + class-transformer | Validasi DTO otomatis |
| Security | @fastify/helmet, @fastify/cors, @fastify/rate-limit, bcrypt | Security headers, CORS, rate limit, hashing |
| Scheduler | @nestjs/schedule | Cron job (token cleanup) |

### Environment Variables (`.env.development`)
```
PORT=3000                     # Port aplikasi
DB_HOST, DB_PORT, DB_NAME     # Koneksi PostgreSQL
DB_USER, DB_PASSWORD
REDIS_URL                     # Koneksi Redis
JWT_ACCESS_SECRET              # Secret untuk access token (min 64 chars)
JWT_REFRESH_SECRET             # Secret untuk refresh token (berbeda dari access)
ALLOWED_ORIGINS                # CORS whitelist (pisahkan dengan koma)
```

### Global Prefix
Semua endpoint menggunakan prefix: **`/api/v1`**

---

## 3. Arsitektur Aplikasi

### Struktur Direktori
```
src/
├── main.ts                        # Bootstrap Fastify + global pipes/filters
├── app.module.ts                  # Root module, register semua sub-module
├── common/                        # Shared infrastructure
│   ├── decorators/                # @TenantDb() decorator
│   ├── filters/                   # GlobalExceptionFilter
│   └── interceptors/              # TenantInterceptor
├── config/                        # Konfigurasi tambahan
├── database/                      # DatabaseService & DatabaseModule
├── types/
│   └── database.types.ts          # Seluruh skema tabel (1400+ baris)
└── modules/
    ├── auth/                      # Autentikasi & otorisasi
    ├── product/                   # Master data produk
    └── inventory/                 # Pergerakan stok & gudang
```

### Request Lifecycle
```
HTTP Request
  → Fastify Rate Limit (300 req/menit/IP)
  → Helmet (security headers)
  → ValidationPipe (whitelist + transform)
  → GlobalExceptionFilter
  → TenantInterceptor (inject tenant context)
  → JwtAuthGuard (validasi token + cek blacklist di Redis)
  → PermissionGuard (cek module:action permission)
  → Controller → Service → Kysely → PostgreSQL
```

### Multi-Tenant Architecture
Setiap request yang terautentikasi membawa context `tenantId` dan `tenantCode` di dalam JWT payload. Decorator `@TenantDb()` menyediakan koneksi database yang di-scope ke tenant yang sedang aktif, memastikan isolasi data antar perusahaan.

---

## 4. Modul Auth (`src/modules/auth`)

### 4.1 Struktur File
```
auth/
├── auth.module.ts                 # Register module, import Passport & JWT
├── auth.controller.ts             # 6 endpoint
├── auth.service.ts                # Business logic (481 baris)
├── auth.constants.ts              # Konstanta JWT, Redis keys, rate limit, permissions
├── auth.types.ts                  # Interface: JwtPayload, AuthenticatedUser, TokenPair
├── token-clenup.service.ts        # Cron job pembersihan token expired
├── dto/
│   └── auth.dto.ts                # LoginDto, RefreshTokenDto, ChangePasswordDto
├── decorators/
│   └── current-user.decorator.ts  # @CurrentUser() parameter decorator
├── guards/
│   └── auth.guard.ts              # JwtAuthGuard, PermissionGuard, @RequirePermission
└── strategies/
    └── jwt.strategy.ts            # Passport JWT strategy + Redis blacklist check
```

### 4.2 Endpoints

| Method | Path | Guard | Deskripsi |
|--------|------|-------|-----------|
| `POST` | `/auth/login` | — | Login dengan email, password, tenantCode |
| `POST` | `/auth/refresh` | — | Perbarui access token menggunakan refresh token |
| `POST` | `/auth/logout` | JWT | Blacklist access token + revoke refresh tokens |
| `POST` | `/auth/logout-all` | JWT | Logout dari semua device sekaligus |
| `POST` | `/auth/change-password` | JWT | Ganti password + force logout all devices |
| `GET`  | `/auth/me` | JWT | Ambil profil user yang sedang login |

### 4.3 Flow Login (Detail Step-by-Step)
1. **Rate Limit Check** — Redis key `ratelimit:login:{ip}`. Maks 5 percobaan per 15 menit.
2. **Validasi Tenant** — Query tabel `tenants` berdasarkan `tenantCode`. Tenant harus `is_active = true`.
3. **Validasi User** — Query tabel `users` berdasarkan `email` + `tenant_id`. User harus `is_active = true`.
4. **Validasi Password** — Menggunakan `bcrypt.compare()` dengan 12 rounds hashing.
5. **Ambil Permissions** — Query `user_roles` JOIN `roles`. Permissions dari semua role di-*merge* secara union (paling permissif).
6. **Update Last Login** — Set `last_login_at` di tabel `users`.
7. **Generate Token Pair:**
   - **Access Token** (JWT, 15 menit): Berisi `sub`, `email`, `tenantId`, `tenantCode`, `roles`, `permissions`, `jti`.
   - **Refresh Token** (Signed JWT wrapping random 64 bytes, 7 hari): Di-hash dengan SHA256, disimpan ke DB (`refresh_tokens`) dan di-cache ke Redis.
8. **Reset Rate Limit** — Hapus counter Redis setelah login sukses.

### 4.4 Flow Refresh Token (Rotation)
1. Verifikasi signature & expiry refresh token (menggunakan `JWT_REFRESH_SECRET`).
2. Hash token → cek di Redis (fast path). Jika tidak ada → fallback ke database.
3. **Revoke token lama** (hapus dari Redis + set `is_revoked = true` di DB).
4. Ambil ulang user permissions terbaru.
5. Generate token pair baru — **setiap refresh token hanya bisa dipakai sekali**.

### 4.5 Sistem Permission (RBAC)

**19 Modul** yang bisa dikontrol:
`inventory`, `purchase_request`, `purchase_order`, `goods_receipt`, `vendor_invoice`, `sales_quotation`, `sales_order`, `delivery_order`, `customer_invoice`, `bom`, `production`, `mrp`, `quality_control`, `accounting`, `bank`, `reporting`, `user_management`, `role_management`, `master_data`, `tenant_settings`.

**5 Aksi** per modul: `read`, `write`, `delete`, `approve`, `export`.

**Template Role Bawaan:**
| Role | Akses Utama |
|------|-------------|
| `admin` | Semua modul, semua aksi |
| `manager` | Hampir semua modul (read, write, approve, export), terbatas di accounting |
| `staff_gudang` | Inventory, goods receipt, delivery order, QC |
| `staff_produksi` | BOM (read), production (read+write), QC |
| `staff_pembelian` | Purchase request, PO, vendor invoice |
| `staff_penjualan` | Sales quotation, SO, customer invoice |
| `akuntan` | Accounting (full), bank, reporting (read+export) |

### 4.6 Token Cleanup (Cron Job)
`TokenCleanupService` berjalan setiap hari jam 02:00 pagi. Menghapus refresh token yang sudah expired atau revoked dari tabel `refresh_tokens`.

### 4.7 JWT Strategy & Blacklist
`JwtStrategy` mengekstrak token dari header `Authorization: Bearer <token>`. Setelah verifikasi signature, melakukan pengecekan blacklist di Redis (`auth:blacklist:{jti}`). Jika token ada di blacklist → tolak request.

---

## 5. Modul Product (`src/modules/product`)

### 5.1 Struktur File
```
product/
├── product.module.ts              # Register module
├── product.controller.ts          # 14 endpoint
├── dto/
│   └── product.dto.ts             # 14 DTO class (323 baris)
└── service/
    ├── product.service.ts         # Produk & variant logic (572 baris)
    ├── product-category.service.ts # Kategori hierarkis (124 baris)
    ├── attribute.service.ts       # Atribut & values (122 baris)
    ├── uom.service.ts             # Unit of Measurement (105 baris)
    └── batch.service.ts           # Batch/lot management (98 baris)
```

### 5.2 Hierarki Data Produk
```
ProductCategory (hierarkis, parentId)
  └── Product (base product, kode unik)
        ├── UoM: base, purchase, sales (masing-masing bisa berbeda)
        ├── Flags: canBePurchased, canBeSold, canBeManufactured, hasVariant
        └── ProductVariant (SKU unik per variant)
              ├── Harga: costPrice, salePrice
              ├── Min Stock: minStock (untuk reorder alert)
              ├── AttributeValues: [Merah, XL] (many-to-many via pivot table)
              └── Batch (nomor batch, manufacture_date, expiry_date)
```

### 5.3 Endpoints

| Method | Path | Permission | Deskripsi |
|--------|------|------------|-----------|
| **UoM** | | | |
| `GET` | `/uom` | master_data:read | List semua unit of measurement |
| `POST` | `/uom` | master_data:write | Buat UoM baru (cek duplikasi simbol) |
| `GET` | `/uom/conversions` | master_data:read | List konversi UoM (JOIN from_uom → to_uom) |
| `POST` | `/uom/conversions` | master_data:write | Buat rasio konversi antar UoM |
| **Kategori** | | | |
| `GET` | `/product-categories` | master_data:read | List kategori (flat + parent_name) |
| `POST` | `/product-categories` | master_data:write | Buat kategori (opsional parentId) |
| `PATCH` | `/product-categories/:id` | master_data:write | Update nama/parent (cegah self-reference) |
| `DELETE` | `/product-categories/:id` | master_data:delete | Hapus (gagal jika punya sub-kategori atau produk) |
| **Atribut** | | | |
| `GET` | `/attributes` | master_data:read | List atribut + values-nya (N+1 prevention) |
| `POST` | `/attributes` | master_data:write | Buat atribut baru (cek duplikasi nama) |
| `POST` | `/attributes/:id/values` | master_data:write | Tambah value ke atribut |
| `DELETE` | `/attributes/values/:valueId` | master_data:delete | Hapus value (gagal jika dipakai variant) |
| **Produk** | | | |
| `GET` | `/products` | master_data:read | List produk (filter, search, pagination) |
| `GET` | `/products/:id` | master_data:read | Detail produk + variants + attributes |
| `POST` | `/products` | master_data:write | Buat produk baru (otomatis buat default variant) |
| `PATCH` | `/products/:id` | master_data:write | Update produk |
| `DELETE` | `/products/:id` | master_data:delete | Soft delete (cek PO aktif, nonaktifkan semua variant) |
| **Variant** | | | |
| `GET` | `/products/:id/variants` | master_data:read | List variant per produk + attributes |
| `POST` | `/products/:id/variants` | master_data:write | Tambah variant (hanya jika hasVariant=true) |
| `PATCH` | `/products/variants/:variantId` | master_data:write | Update harga/status variant |
| `DELETE` | `/products/variants/:variantId` | master_data:delete | Soft delete (minimal 1 variant harus tetap aktif) |
| **Batch** | | | |
| `GET` | `/products/variants/:variantId/batches` | inventory:read | List batch per variant |
| `POST` | `/batches` | inventory:write | Buat batch baru (cek duplikasi batch_number per variant) |

### 5.4 Flow Pembuatan Produk (`ProductService.create`)
```
1. Cek duplikasi kode produk (kode di-uppercase otomatis via DTO Transform)
2. Validasi semua UoM ID (base, purchase, sales) exist
3. BEGIN TRANSACTION
   4a. Insert ke tabel `products`
   4b. Jika hasVariant=true DAN variants[] dikirim:
       → Loop setiap variant:
         - Cek duplikasi SKU
         - Insert ke `product_variants`
         - Insert ke `product_variant_attributes` (pivot)
   4c. Jika hasVariant=false:
       → Auto-create 1 default variant (SKU = kode produk)
5. COMMIT
6. Return produk + variants
```

### 5.5 Flow Soft Delete Produk
```
1. Cek apakah produk masih digunakan di Purchase Order aktif (draft/confirmed/partial)
2. Jika ya → throw ConflictException
3. Set products.is_active = false
4. Set SEMUA product_variants.is_active = false untuk produk tersebut
```

### 5.6 DTO Validasi Produk

**`CreateProductDto`:**
- `code` (required, max 100 chars, auto-uppercase + trim)
- `name` (required, max 255 chars)
- `baseUomId`, `purchaseUomId`, `salesUomId` (required UUID)
- `categoryId` (optional UUID)
- `canBePurchased`, `canBeSold`, `canBeManufactured`, `hasVariant` (optional boolean, defaults: true, true, false, false)
- `variants[]` (optional, array of `CreateVariantDto`)

**`ProductFilterDto`** (extends `PaginationDto`):
- `search` → filter by code ILIKE atau name ILIKE
- `categoryId`, `canBePurchased`, `canBeSold`, `canBeManufactured`, `isActive` (default: true)
- `page` (default: 1), `limit` (default: 20)

---

## 6. Modul Inventory (`src/modules/inventory`)

### 6.1 Struktur File
```
inventory/
├── inventory.module.ts            # Register module
├── inventory.controller.ts        # 22 endpoint
├── dto/
│   └── inventory.dto.ts           # 12 DTO class (305 baris)
└── services/
    ├── warehouse.service.ts       # Branch, warehouse, location (283 baris)
    ├── inventory-movement.service.ts  # Movement CRUD + confirm/cancel (454 baris)
    ├── stok-query.service.ts      # Query stok real-time (320 baris)
    └── stock-opname.service.ts    # Stock opname workflow (432 baris)
```

### 6.2 Konsep Kunci

**Materialized View `stock_summary`:**
Alih-alih menghitung `SUM(quantity)` dari ribuan movement setiap kali user membuka halaman stok, sistem menggunakan PostgreSQL Materialized View. View ini di-refresh secara `CONCURRENTLY` (non-blocking) setiap kali movement dikonfirmasi atau stock opname diselesaikan.

**Tipe Gudang:**
- `raw_material` — gudang bahan baku
- `wip` — gudang work-in-progress
- `finished_goods` — gudang barang jadi

### 6.3 Endpoints

| Method | Path | Permission | Deskripsi |
|--------|------|------------|-----------|
| **Branch** | | | |
| `GET` | `/branches` | inventory:read | List cabang |
| `GET` | `/branches/:id` | inventory:read | Detail cabang + warehouses |
| `POST` | `/branches` | inventory:write | Buat cabang |
| `PATCH` | `/branches/:id` | inventory:write | Update cabang |
| **Warehouse** | | | |
| `GET` | `/warehouses` | inventory:read | List gudang (filter by branchId) |
| `GET` | `/warehouses/:id` | inventory:read | Detail gudang + locations |
| `POST` | `/warehouses` | inventory:write | Buat gudang (cek duplikasi kode) |
| `PATCH` | `/warehouses/:id` | inventory:write | Update gudang |
| **Warehouse Location** | | | |
| `GET` | `/warehouses/:id/locations` | inventory:read | List lokasi rak/lorong |
| `POST` | `/warehouse-locations` | inventory:write | Buat lokasi (cek duplikasi kode per gudang) |
| `DELETE` | `/warehouse-locations/:id` | inventory:delete | Soft delete lokasi |
| **Inventory Movement** | | | |
| `GET` | `/inventory-movements` | inventory:read | List movement (filter: type, status, date, warehouse) |
| `GET` | `/inventory-movements/:id` | inventory:read | Detail movement + items |
| `POST` | `/inventory-movements` | inventory:write | Buat movement (status: draft) |
| `POST` | `/inventory-movements/:id/confirm` | inventory:approve | Konfirmasi → refresh stock_summary |
| `POST` | `/inventory-movements/:id/cancel` | inventory:approve | Batalkan (hanya status draft) |
| **Stock Query** | | | |
| `GET` | `/stock` | inventory:read | Stok on-hand (filter: warehouse, variant, batch) |
| `GET` | `/stock/variants/:variantId` | inventory:read | Agregat stok per variant di semua gudang |
| `GET` | `/stock/history` | inventory:read | Kartu stok / audit trail (pagination) |
| `GET` | `/stock/locations/:warehouseId` | inventory:read | Stok per lokasi rak |
| `GET` | `/stock/reorder-alerts` | inventory:read | Daftar SKU di bawah min_stock |
| **Stock Opname** | | | |
| `GET` | `/stock-opnames` | inventory:read | List opname (filter by warehouseId) |
| `GET` | `/stock-opnames/:id` | inventory:read | Detail opname + items |
| `POST` | `/stock-opnames` | inventory:write | Buat opname → snapshot stock saat ini |
| `POST` | `/stock-opnames/:id/complete` | inventory:approve | Selesaikan → generate adjustment movements |
| `POST` | `/stock-opnames/:id/cancel` | inventory:approve | Batalkan opname |

### 6.4 Flow Inventory Movement

#### 6.4.1 Buat Movement (Status: Draft)
```
1. Validasi movement type code (query tabel inventory_movement_types)
2. Minimal 1 item diperlukan
3. Validasi setiap item:
   - Variant harus exist dan is_active
   - Direction 'in'      → wajib to_warehouse_id
   - Direction 'out'     → wajib from_warehouse_id
   - Direction 'transfer' → wajib from + to, dan tidak boleh sama
   - UoM harus exist
4. BEGIN TRANSACTION
   5. Insert header ke `inventory_movements` (status: draft)
   6. Insert items ke `inventory_movement_items`
7. COMMIT
8. Return detail movement + items
```

#### 6.4.2 Konfirmasi Movement
```
1. Cek status harus 'draft'
2. Jika direction 'out' atau 'transfer':
   → Validasi stok mencukupi per item (query stock_summary)
   → Jika stok kurang → throw BadRequestException dengan detail SKU dan jumlah
3. BEGIN TRANSACTION
   4. Update status → 'confirmed', set confirmed_by & confirmed_at
   5. REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary
4. COMMIT
```

#### 6.4.3 Batalkan Movement
- Hanya bisa membatalkan status `draft`
- Movement `confirmed` **tidak bisa dibatalkan** langsung — harus buat adjustment movement baru sebagai koreksi

### 6.5 Flow Stock Opname (Detail)

#### 6.5.1 Buat Opname
```
1. Cek tidak ada opname aktif (draft/counting) di warehouse yang sama
2. Validasi warehouse exist dan is_active
3. BEGIN TRANSACTION
   4. Insert header ke `stock_opnames` (status: counting)
   5. Snapshot stock_summary untuk warehouse ini (quantity > 0)
   6. Insert snapshot ke `stock_opname_items` (system_quantity = qty saat ini, actual = null)
7. COMMIT
8. Return opname + items (user mulai menghitung fisik)
```

#### 6.5.2 Selesaikan Opname (Complete)
```
1. Cek status harus 'counting'
2. Validasi jumlah items yang dikirim = jumlah items di DB
3. BEGIN TRANSACTION
   4. Update actual_quantity untuk setiap item
   5. Query items yang punya selisih (difference != 0)
   6. Generate adjustment movements:
      - Surplus (actual > system) → buat ADJUSTMENT_IN movement (confirmed)
      - Kekurangan (actual < system) → buat ADJUSTMENT_OUT movement (confirmed)
      - UoM otomatis diambil dari base_uom_id produk (1 query, bukan N)
   7. Update status opname → 'completed'
   8. REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary
9. COMMIT
```

### 6.6 Stock Query Service (Detail Fungsi)

#### `getStockOnHand(query: StockQueryDto)`
Query utama dari `stock_summary` dengan JOIN ke `product_variants`, `products`, `warehouses`, `uom`, dan `batches`. Mendukung filter: `warehouseId`, `variantId`, `batchId`, `onlyPositive` (default: true). Hasil diurutkan berdasarkan nama produk → SKU → nama gudang.

#### `getStockByVariant(variantId: string)`
Mengembalikan objek yang berisi: detail variant, total stok di semua gudang, dan breakdown stok per warehouse + batch. Berguna untuk halaman detail stok satu produk.

#### `getStockHistory(query: StockHistoryDto)`
Kartu stok / audit trail. JOIN 6 tabel: `inventory_movement_items`, `inventory_movements`, `inventory_movement_types`, `warehouses` (from + to), `batches`. Mendukung filter: `warehouseId`, `dateFrom`, `dateTo`. Pagination default: 50 item per halaman.

#### `getStockByLocation(warehouseId: string)`
Breakdown stok sampai level lokasi rak (`warehouse_locations`). Menghitung `SUM(quantity)` dari `inventory_movement_items` yang di-GROUP BY variant, lokasi, dan batch. Berguna untuk warehouse dengan sistem binning.

#### `getReorderAlerts(warehouseId?: string)`
1. Ambil semua variant aktif yang punya `min_stock > 0`
2. Ambil total stok dari `stock_summary` (opsional filter per warehouse)
3. Filter variant yang `current_stock < min_stock`
4. Return sorted by shortage (terbesar dulu)

---

## 7. Infrastruktur & Common

### 7.1 `main.ts` — Bootstrap
- Membuat `NestFastifyApplication` dengan Fastify adapter
- Register `@fastify/helmet` (CSP, HSTS di production)
- Register `@fastify/cors` (dari `ALLOWED_ORIGINS` env)
- Register `@fastify/rate-limit` (300 req/menit/IP)
- Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- Global `GlobalExceptionFilter`
- Global prefix `/api/v1`
- Listen di `0.0.0.0` (semua interface)

### 7.2 `app.module.ts` — Root Module
Meng-import:
- `ConfigModule` (global, dari `.env`)
- `RedisModule` (ioredis, dengan retry strategy)
- `DatabaseModule` (Kysely + PostgreSQL)
- `CommonModule` (shared utilities)
- `AuthModule`, `ProductModule`, `InventoryModule`
- TenantInterceptor (registered sebagai `APP_INTERCEPTOR`)

Module yang sudah disiapkan tapi belum aktif (commented):
`PurchaseOrderModule`, `SalesOrderModule`, `BomModule`, `ProductionModule`, `QualityControlModule`, `AccountingModule`.

### 7.3 Custom Decorators
- **`@TenantDb()`** — Inject `Kysely<TenantSchema>` yang di-scope ke tenant aktif
- **`@CurrentUser()`** — Inject `AuthenticatedUser` dari `req.user`. Support field extraction: `@CurrentUser('userId')` → langsung string.
- **`@RequirePermission(module, action)`** — Metadata decorator untuk PermissionGuard

### 7.4 Global Exception Filter
Menangkap semua exception dan mengembalikan format response yang konsisten.

---

## 8. Skema Database

### 8.1 Public Schema (Global)
| Tabel | Kolom Kunci | Deskripsi |
|-------|-------------|-----------|
| `tenants` | id, code, name, industry, is_active | Perusahaan/organisasi |
| `users` | id, tenant_id, email, password_hash, full_name, is_active | Pengguna sistem |
| `roles` | id, tenant_id, name, permissions (JSONB) | Role dengan permission matrix |
| `user_roles` | user_id, role_id | Pivot user-role (many-to-many) |
| `refresh_tokens` | token_hash, user_id, is_revoked, expires_at | Refresh token storage |

### 8.2 Tenant Schema — Master Data
| Tabel | Kolom Kunci | Deskripsi |
|-------|-------------|-----------|
| `branches` | id, name, address, city | Cabang perusahaan |
| `warehouses` | id, branch_id, code, name, type | Gudang (raw/wip/finished) |
| `warehouse_locations` | id, warehouse_id, code, name | Lokasi rak/lorong dalam gudang |
| `uom` | id, name, symbol | Satuan ukur (KG, PCS, L, dll) |
| `uom_conversions` | from_uom_id, to_uom_id, factor | Rasio konversi antar UoM |
| `product_categories` | id, name, parent_id | Kategori hierarkis |
| `attributes` | id, name | Definisi atribut (Warna, Ukuran) |
| `attribute_values` | id, attribute_id, value | Nilai atribut (Merah, XL) |
| `products` | id, code, name, base_uom_id, purchase_uom_id, sales_uom_id, has_variant, can_be_* | Produk dasar |
| `product_variants` | id, product_id, sku, cost_price, sale_price, min_stock | Varian dengan SKU unik |
| `product_variant_attributes` | variant_id, attribute_value_id | Pivot variant-attribute |
| `batches` | id, variant_id, batch_number, manufacture_date, expiry_date | Lot/batch produksi |

### 8.3 Tenant Schema — Inventory
| Tabel | Kolom Kunci | Deskripsi |
|-------|-------------|-----------|
| `inventory_movement_types` | id, code, direction (in/out/transfer) | Tipe pergerakan stok |
| `inventory_movements` | id, movement_type_id, status, movement_date, reference_type, reference_id | Header transaksi stok |
| `inventory_movement_items` | id, movement_id, variant_id, batch_id, from_warehouse_id, to_warehouse_id, quantity, uom_id | Detail item per movement |
| `stock_opnames` | id, warehouse_id, status (draft/counting/completed/cancelled) | Header stock opname |
| `stock_opname_items` | id, opname_id, variant_id, system_quantity, actual_quantity, difference | Detail opname per item |
| `stock_summary` | variant_id, warehouse_id, batch_id, quantity_on_hand | **Materialized View** untuk query stok cepat |

### 8.4 Tenant Schema — Belum Diimplementasikan
Tabel-tabel berikut sudah didefinisikan di `database.types.ts` tapi belum ada service/controller:
- **Purchase:** `purchase_requests`, `rfqs`, `purchase_orders`, `goods_receipts`, `vendor_invoices`
- **Sales:** `sales_quotations`, `sales_orders`, `delivery_orders`, `customer_invoices`, `payment_receipts`
- **Manufacturing:** `bom_headers`, `bom_versions`, `bom_items`, `mrp_demands`, `work_orders`, `production_results`
- **Quality Control:** `qc_parameters`, `qc_checklists`, `qc_inspections`, `qc_defects`
- **Accounting:** `accounts`, `journal_entries`, `general_ledger`, `ap_transactions`, `ar_transactions`, `bank_accounts`

---

## 9. Roadmap Pengembangan

Dengan pondasi Auth, Product, dan Inventory yang sudah solid, berikut urutan pengembangan yang direkomendasikan:

1. **Modul Purchase** — PR → RFQ → PO → Goods Receipt → Vendor Invoice
2. **Modul Sales** — Quotation → SO → Delivery Order → Customer Invoice → Payment Receipt
3. **Modul BOM & Manufacturing** — BOM management → MRP → Work Orders → Production Results
4. **Modul Quality Control** — QC parameter setup → Inspection workflow → Defect tracking
5. **Modul Accounting** — Chart of Accounts → Journal Entries → AP/AR → Bank Reconciliation
