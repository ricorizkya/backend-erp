# ERP Backend

NestJS backend untuk ERP manufaktur multi-tenant dengan PostgreSQL, Redis/BullMQ,
dan worker MRP Go.

## Development lokal

1. Siapkan PostgreSQL database `new_erp`, Redis, dan role aplikasi.
2. Gunakan `.env.development.local` untuk konfigurasi lokal; file ini di-ignore Git.
3. Jalankan `npm install` lalu `npm run start:dev`.

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
`mrp-run-<runId>`. Worker Go meng-claim `pending` menjadi `running` dalam
transaksi pendek, menghitung dalam transaksi terpisah, lalu menulis planned order
secara idempotent. Status terminal adalah `completed`, `failed_permanent`, atau
`cancelled`; reconciliation menangani enqueue gagal dan retry transient.

## Batas costing v1

COGS menggunakan `product_variants.cost_price`. FIFO, average costing, dan
production cost sheet penuh belum termasuk scope hardening ini.

## Reset development

Setelah backup, hentikan aplikasi/worker, hapus key BullMQ MRP saja, drop/create
database, jalankan migration, provisioning role MRP, bootstrap admin, dan smoke
test dua tenant.
