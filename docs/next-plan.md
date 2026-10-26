Should fix
11. Backend bisnis praktis tidak memiliki automated test ([app.controller.spec.ts (line 1)](/Users/rico/Documents/Project/ERP/backend-erp/src/app.controller.spec.ts:1), [app.e2e-spec.ts (line 1)](/Users/rico/Documents/Project/ERP/backend-erp/test/app.e2e-spec.ts:1))
    - What this is: Hanya ada test starter “Hello World”.
    - Problem: Tidak ada regression test untuk auth, tenant isolation, stok, purchase, sales, journal, QC, atau MRP API.
    - Fix: Mulai dari test concurrency dan invariant keuangan, lalu satu happy-path integration test per alur utama.
    - If we skip it: Perubahan kecil dapat merusak transaksi lintas modul tanpa terdeteksi.
12. Bank reconciliation menandai semua transaksi sebagai reconciled ([bank.service.ts (line 195)](/Users/rico/Documents/Project/ERP/backend-erp/src/modules/accounting/services/bank.service.ts:195))
    - What this is: Penyelesaian satu reconciliation meng-update seluruh transaksi unreconciled pada rekening.
    - Problem: Tidak ada daftar transaksi yang benar-benar dicocokkan dan tidak ada pembatas periode/tanggal.
    - Fix: Simpan reconciliation lines atau daftar transaction ID, lalu update hanya transaksi yang dipilih.
    - If we skip it: Transaksi yang belum muncul pada rekening koran ikut dianggap selesai.
13. Beberapa fitur yang disebut oleh permission/schema belum mempunyai API bisnis
    - What this is: Permission mencantumkan user, role, dan tenant management; schema accounting mencakup production cost sheets.
    - Problem: Tidak ada controller/service user-role-tenant, dan cost accounting/HPP hanya berupa tabel serta posting bahan sederhana.
    - Fix: Selesaikan administration API dan production costing sebelum menyebut scope backend v1 lengkap.
    - If we skip it: Sistem membutuhkan SQL manual untuk onboarding pengguna dan tidak dapat menghasilkan biaya produksi yang dapat diaudit.
14. Refresh token rotation masih dapat dipakai dua kali secara paralel ([auth.service.ts (line 155)](/Users/rico/Documents/Project/ERP/backend-erp/src/modules/auth/auth.service.ts:155))
    - What this is: Token diperiksa, kemudian direvoke dalam operasi terpisah.
    - Problem: Dua refresh request simultan dapat sama-sama lolos sebelum revoke dan menghasilkan dua token baru.
    - Fix: Gunakan operasi konsumsi token atomik di Redis atau conditional database update is_revoked=false RETURNING.
    - If we skip it: Token yang seharusnya sekali pakai dapat menghasilkan lebih dari satu sesi.
15. Pajak pembelian di-hardcode 11% walaupun tax code tersedia ([vendor-invoice.service.ts (line 197)](/Users/rico/Documents/Project/ERP/backend-erp/src/modules/purchase-order/services/vendor-invoice.service.ts:197))
    - What this is: Accounting memiliki tabel dan endpoint tax code.
    - Problem: Vendor invoice selalu memakai subtotal × 11% tanpa memperhatikan barang bebas pajak, tarif berbeda, atau perubahan aturan.
    - Fix: Masukkan tax code pada dokumen/item dan hitung dari konfigurasi efektif.
    - If we skip it: Nilai invoice dan kewajiban pajak salah untuk transaksi selain PPN standar.
16. Artefak deployment dan perbaikan MRP belum menjadi bagian repository
    - What this is: Migration 013 dan beberapa perbaikan source masih uncommitted; Dockerfile dan dokumentasi worker justru di-ignore.
    - Problem: Clone bersih tidak memperoleh supervisor, Dockerfile, fixture validasi, atau perbaikan idempotensi terbaru.
    - Fix: Pisahkan artefak runtime dari fixture lokal, perbaiki .gitignore, lalu commit perubahan yang sudah divalidasi.
    - If we skip it: Deployment dari Git akan berbeda dari workspace yang dinyatakan berhasil diuji.
17. Dokumentasi status saling bertentangan ([backend documentation (line 508)](/Users/rico/Documents/Project/ERP/backend-erp/docs/project_documentation.md:508), [worker README (line 33)](/Users/rico/Documents/Project/ERP/erp-mrp-engine/README.md:33), [validation report (line 184)](/Users/rico/Documents/Project/ERP/erp-mrp-engine/docs/mrp-test-validation-report.md:184))
    - What this is: Dokumen lama menyebut modul atau engine belum dibuat, sementara laporan lain menyebut gate selesai 100%.
    - Problem: Engineer baru tidak dapat menentukan dokumen mana yang menjadi sumber kebenaran.
    - Fix: Jadikan satu status matrix sebagai dokumen aktif dan tandai dokumen lama sebagai arsip.
    - If we skip it: Planning berikutnya dapat mengulang pekerjaan atau melewatkan gap yang nyata.
Nice to have
18. Quality gate belum bersih
    - What this is: Build NestJS berhasil, tetapi ESLint menghasilkan 71 error dan 9 warning.
    - Problem: Sebagian besar terkait any, unsafe access, unused values, dan floating promise.
    - Fix: Bersihkan error bertahap dan jalankan lint tanpa --fix di CI.
    - If we skip it: Masalah tipe baru mudah tersembunyi di antara error lama.
19. Materialized view direfresh sinkron pada banyak transaksi bisnis ([inventory-movement.service.ts (line 449)](/Users/rico/Documents/Project/ERP/backend-erp/src/modules/inventory/services/inventory-movement.service.ts:449))
    - What this is: Confirm movement, GR, DO, SO, stock opname, dan WO memanggil REFRESH MATERIALIZED VIEW CONCURRENTLY.
    - Problem: Pada traffic tinggi, refresh penuh berulang menjadi titik serialisasi dan memperpanjang transaksi.
    - Fix: Ukur dengan data produksi; jika signifikan, ganti dengan tabel saldo yang di-update incremental atau refresh terjadwal.
    - If we skip it: Throughput transaksi stok turun ketika jumlah movement membesar.

    Hasil verifikasi
- NestJS build: lulus.
- Jest: 1 suite/1 test lulus, hanya starter test.
- ESLint: gagal, 71 error dan 9 warning.
- Go go test -race ./...: lulus.
- Coverage Go:
  - domain: 91.3%
  - config: 82.9%
  - logger: 82.1%
  - utils: 85.7%
  - worker, database, query, dan orchestration infrastructure: 0%
- Integration test Go tersedia, tetapi tidak dijalankan karena akan membuat dan menghapus schema PostgreSQL.
- Kedua branch sama dengan upstream, tetapi kedua repository memiliki perubahan lokal yang belum di-commit.
Verdict: fitur backend sudah maju dan layak untuk demo terkontrol, sekitar 77% dari scope v1; belum aman untuk production sampai temuan 1–10 diselesaikan dan dilindungi test.
Not checked: deployment server nyata, konfigurasi Redis/PostgreSQL production, replay integration test terhadap database, klaim load test historis, dan frontend. Tidak ada file atau data yang diubah selama audit.
## Implementation update — 2026-10-26

The audit baseline below is historical. Since then:

- Tenant connection release now resets `search_path`, handles pre-handler errors, and migration checksums are immutable.
- Tenant migrations 001–016 were applied from an empty development database for `tenant_admin` and `tenant_demo`.
- Migration 014 now includes MRP `cancelled`, reconciliation indexes, and the unique `general_ledger.journal_line_id` backstop.
- MRP enqueue recovery, conditional cancellation, short worker claim transactions, and writer status guards were implemented.
- Customer invoices are calculated from delivered DO quantities; COGS uses `product_variants.cost_price`.
- Current verification: backend build/lint/unit/integration/concurrency pass; Go unit and race tests pass.

Verification update — 2026-10-26:

- Added a real PostgreSQL integration suite for `MrpRunService` covering
  parallel trigger conflict, Redis enqueue failure recovery, and cancellation.
- The tagged Go integration suite is runnable against an explicitly supplied
  test database and the worker README now reflects the current state.
- A disposable clean clone installed dependencies and completed `npm run build`.
- Still pending: authenticated two-tenant business-flow smoke tests, a full
  NestJS↔Redis↔Go run against the rebuilt development database, and secret
  rotation/history rewrite.
