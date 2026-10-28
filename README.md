# ERP Backend

NestJS backend untuk ERP manufaktur multi-tenant dengan PostgreSQL, Redis/BullMQ,
dan worker MRP Go.

## Development lokal

1. Salin `.env.example` menjadi `.env.development.local`, lalu isi secret lokal.
2. Siapkan PostgreSQL database `new_erp` dan Redis.
3. Jalankan `npm install` lalu `npm run start:dev` agar migration public dan tenant dijalankan.
4. Isi `MRP_SERVICE_PASSWORD`, lalu jalankan `npm run db:provision-mrp-role`.
5. Bootstrap admin memakai nilai `BOOTSTRAP_*` lokal sesuai script bootstrap yang tersedia.

Startup menjalankan migration public dan seluruh tenant aktif. Migration yang
sudah tercatat bersifat immutable; perubahan schema harus memakai migration baru.

## Test

```bash
npm run test:unit
npm run test:services:up
npm run test:integration
npm run test:concurrency
npm run test:services:down
npm run build
npm run lint
```

Integration test memakai database `erp_test`, Redis port `56379`, dan schema
tenant berprefix `tenant_test_`. Target non-test ditolak oleh test guard.

## MRP

NestJS membuat `mrp_runs` berstatus `pending` dan enqueue job dengan ID stabil
`mrp-<tenantCode>-run-<runId>`. Scope tenant wajib berada pada ID karena sequence
`mrp_runs` bersifat lokal per schema. Worker Go meng-claim `pending` menjadi `running` dalam
transaksi pendek, menghitung dalam transaksi terpisah, lalu menulis planned order
secara idempotent. Status terminal adalah `completed`, `failed_permanent`, atau
`cancelled`; reconciliation menangani enqueue gagal dan retry transient.

State transition yang didukung:

```text
pending -> running -> completed
   |          |  \\-> failed -> pending (maksimal 3 retry)
   |          \\----> cancelled
   \\--------------> cancelled
failed ----------------> failed_permanent
running (stuck) --------> pending
```

## Batas costing v1

COGS menggunakan `product_variants.cost_price`. FIFO, average costing, dan
production cost sheet penuh belum termasuk scope hardening ini.

## Reset development

Setelah backup, hentikan aplikasi/worker, hapus hanya key BullMQ MRP, drop/create
database, jalankan aplikasi untuk migration 001-016, provision login role MRP,
bootstrap admin dari secret lokal, lalu jalankan smoke test dua tenant. Migration
yang sudah tercatat tidak boleh diedit; checksum mismatch selalu menghentikan startup.
