# Status Setelah Hardening Poin 1-10

Tanggal verifikasi: 28 Oktober 2026.

Dokumen ini menggantikan audit awal yang sudah tidak sesuai dengan implementasi.
Rencana dan acceptance criteria normatif tetap berada di `docs/planning.md`.

## Selesai

1. Secret tracked dibersihkan, environment lokal di-ignore, bootstrap/provisioning
   tidak mempunyai credential bawaan, dan history repository sudah ditulis ulang.
2. Satu PostgreSQL pool digunakan; tenant connection selalu mereset `search_path`;
   checksum migration immutable.
3. Confirm/post, stok, journal, AP, dan AR memakai lock/conditional transition serta
   constraint database. Conflict paralel menjadi conflict terkontrol, bukan side
   effect ganda.
4. MRP memakai state machine `pending/running/completed/failed/failed_permanent/
   cancelled`, stable job ID tenant-scoped, reconciliation retry, guarded writer,
   serta cancellation yang tidak dapat ditimpa worker.
5. Customer invoice parsial dihitung dari Delivery Order; COGS memakai
   `product_variants.cost_price`, bukan harga jual.
6. Database development telah dibuat ulang dari kosong dan tenant migration
   001-016 berhasil diterapkan.
7. Smoke authenticated dua tenant dan E2E NestJS → Redis/BullMQ → worker Go telah
   mencapai status `completed` untuk kedua tenant tanpa kebocoran schema.

## Quality gate

- Backend: build, ESLint read-only, unit, integration PostgreSQL/Redis, dan
  concurrency suite.
- Worker: `go test -race ./...` dan tagged integration test terhadap database test.
- Acceptance suite mencakup tenant isolation/leak, migration checksum, parallel GR,
  stock-out, partial invoice, AP/AR overpayment, incoming/final QC, MRP retry,
  orphan enqueue, stuck-active guard, cancellation, dan writer idempotency.

## Scope berikutnya (bukan sisa poin 1-10)

- Frontend.
- User/role/tenant management API.
- Tax-code overhaul dan bank reconciliation redesign.
- Production cost sheet serta FIFO/average valuation.
- Validasi deployment server dan konfigurasi production nyata.

Metode costing v1 tetap `product_variants.cost_price`; ini memperbaiki bug COGS
berbasis harga jual, tetapi bukan pengganti valuation inventory penuh.
