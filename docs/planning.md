Implementation Plan Hardening Poin 1–10
Target akhir: mempertahankan arsitektur NestJS + PostgreSQL + BullMQ + worker Go, tetapi membuat security, transaksi bisnis, dan state machine MRP aman untuk dijalankan paralel. Karena database masih development, schema akan dibangun ulang dari migration bersih.
1. Keputusan teknis yang dikunci
- Tidak menambah ORM, repository layer, event framework, atau dependency runtime baru.
- PostgreSQL tetap menjadi sumber kebenaran untuk status dokumen dan MRP.
- Gunakan SELECT ... FOR UPDATE, conditional update, constraint database, dan transaction-level advisory lock.
- BullMQ tetap memakai jobId = mrp-run-${runId}.
- Tidak menambah outbox pada tahap ini. Cron reconciliation menjadi mekanisme pemulihan enqueue.
- Harga pokok v1 menggunakan product_variants.cost_price; production cost sheet lengkap tetap di luar scope poin 1–10.
- Migration lama hanya diedit untuk menghapus secret. Perubahan schema fungsional baru masuk migration 014.
- Database dan Redis development di-reset setelah seluruh perubahan siap.
- Riwayat Git akan di-rewrite karena repository belum dibagikan.
2. Pemetaan temuan ke tahap
Poin audit	Penanganan
1. Secret dalam Git	Tahap 1
2. Confirm/post paralel	Tahap 3
3. MRP failed tidak retry	Tahap 4
4. Requeue gagal meninggalkan pending	Tahap 4
5. Cancel MRP tidak konsisten	Tahap 4
6. Partial invoice menagih seluruh SO	Tahap 5
7. COGS memakai harga jual	Tahap 5
8. Pembayaran paralel melebihi outstanding	Tahap 3
9. Tenant connection leak/search path	Tahap 2
10. Checksum migration hanya diperbarui	Tahap 2


Tahap 0 — Baseline dan test infrastructure
Perubahan
- Buat checkpoint lokal dari perubahan MRP yang belum di-commit sebelum refactor.
- Tambahkan environment integration test PostgreSQL dan Redis yang terisolasi.
- Pisahkan unit test dari integration/concurrency test.
- Jangan memakai database development utama sebagai target automated test.
File utama
- backend-erp/package.json
- backend-erp/test/jest-integration.json
- backend-erp/docker-compose.test.yml
- backend-erp/test/helpers/database.ts
- backend-erp/test/helpers/redis.ts
- erp-mrp-engine/test/integration/helper_test.go
Script yang ditambahkan
{
  "test:unit": "jest --runInBand --watchman=false",
  "test:integration": "jest --config test/jest-integration.json --runInBand --watchman=false",
  "test:concurrency": "jest --config test/jest-integration.json --runInBand --testPathPattern=concurrency",
  "test:ci": "npm run build && npm run test:unit && npm run test:integration"
}
Integration test wajib menggunakan:
- Database khusus, misalnya erp_test.
- Redis database/index khusus.
- Tenant schema dengan prefix tenant_test_.
- Cleanup hanya terhadap schema test.
- Tidak ada fallback credential hardcoded.
Acceptance criteria
- Test menolak berjalan jika nama database tidak mengandung penanda test.
- Test tidak pernah mengakses database development utama.
- npm run build tetap lulus.
- Go unit test dan race detector tetap lulus.
- Integration suite dapat membuat dan menghapus schema test secara deterministik.
Tahap 1 — Secret cleanup dan bootstrap aman
1.1 Environment files
File
- .gitignore
- .env.development — hapus dari tracking
- .env.example — buat versi sanitized
- erp-mrp-engine/.gitignore
- erp-mrp-engine/.env.example
Perubahan
- Ignore seluruh .env*, kecuali .env.example.
- .env.example hanya menyimpan nama variabel dan nilai dummy.
- Jangan menyimpan password database, JWT secret, Redis password, MinIO key, atau admin password.
Contoh variabel bootstrap:
BOOTSTRAP_TENANT_CODE
BOOTSTRAP_TENANT_NAME
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
MRP_SERVICE_PASSWORD
1.2 Admin bootstrap
File
- src/database/migrations/public/006_seed_admin.sql
- scripts/bootstrap-admin.ts
- package.json
Perubahan
Migration 006 hanya boleh membuat data non-rahasia:
- Tenant development awal.
- Template role dan permission.
- Tidak membuat user dengan password tetap.
- Tidak menyimpan hash salt tetap.
scripts/bootstrap-admin.ts:
1. Membaca seluruh nilai dari environment.
2. Memastikan password minimum sesuai DTO auth.
3. Membuat bcrypt hash.
4. Membuat tenant_secrets.hash_salt dengan crypto.randomBytes.
5. Membuat atau memperbarui admin dalam satu transaksi.
6. Menghubungkan admin dengan role administrator.
7. Tidak mencetak password atau hash ke log.
Tambahkan script:
{
  "db:bootstrap-admin": "ts-node scripts/bootstrap-admin.ts"
}
1.3 Role MRP
File
- src/database/migrations/public/007_create_mrp_service_role.sql
- scripts/provision-mrp-role.sql
- scripts/provision-mrp-role.sh
Perubahan
Migration 007:
- Membuat role mrp_service tanpa password hardcoded.
- Tidak mengubah password role yang sudah ada.
- GRANT tenant tetap berada di migration tenant 012/013.
Provisioning script:
- Menerima password melalui MRP_SERVICE_PASSWORD.
- Menjalankan ALTER ROLE mrp_service LOGIN PASSWORD ....
- Gagal jika environment tidak tersedia.
- Tidak menggunakan password sebagai argument command-line yang terlihat melalui process list.
- Tidak mencetak secret.
1.4 Integration test Go
File
- erp-mrp-engine/test/integration/helper_test.go
Perubahan
- Hapus fallback DSN lengkap.
- Bila TEST_DATABASE_URL tidak tersedia, integration test harus Skip.
- Pastikan nama database atau schema sesuai pola test sebelum DROP SCHEMA.
- Jangan pernah menggunakan credential production/development sebagai default.
1.5 Rotasi dan Git history
Dilakukan setelah perubahan kode selesai dan sebelum reset environment:
1. Rotasi password PostgreSQL utama.
2. Rotasi password mrp_service.
3. Rotasi JWT access dan refresh secret.
4. Rotasi Redis/MinIO credential jika nilai nyata pernah masuk Git.
5. Gunakan git filter-repo untuk menghapus:
   - .env.development
   - credential fallback integration test
   - password role MRP
   - password/admin seed lama
6. Jalankan secret scan pada seluruh commit.
7. Force-push branch setelah membuat backup lokal.
Test cases
- Bootstrap gagal jika password/email/tenant tidak tersedia.
- Bootstrap kedua kali tidak membuat user atau role duplikat.
- Admin hasil bootstrap dapat login.
- Hash salt berbeda setelah database benar-benar dibuat ulang.
- Worker berhasil login memakai password hasil provisioning.
- git log -S '<secret-lama>' --all tidak menemukan hasil.
Acceptance criteria
- Tidak ada plaintext secret pada tracked files atau Git history.
- .env.development tidak lagi tracked.
- Clean clone dapat disiapkan hanya dari .env.example dan secret lokal.
- Admin dan role worker dibuat tanpa credential bawaan.
Tahap 2 — Tenant connection dan migration safety
2.1 Gunakan satu PostgreSQL pool
Saat ini DatabaseModule dan DatabaseService membuat pool masing-masing.
File
- src/database/database.module.ts
- src/database/database.service.ts
Perubahan
- DatabaseService menerima provider Pool dari DatabaseModule.
- Hapus pembuatan new Pool() kedua dari DatabaseService.
- publicDb menggunakan pool yang sama.
- onModuleDestroy() hanya menutup pool pada satu owner yang jelas.
Ini mencegah penggunaan koneksi dua kali lipat dan menyederhanakan pengujian leak.
2.2 Reset search_path sebelum koneksi kembali ke pool
Interface internal
Ubah hasil getTenantDb() menjadi:
{
  db: Kysely<TenantSchema>;
  release: () => Promise<void>;
}
Perilaku release()
1. Jalankan RESET search_path.
2. Bila reset gagal, destroy koneksi dan jangan kembalikan ke pool.
3. Baru panggil original client release.
4. Lindungi dari pemanggilan dua kali.
Caller yang diperbarui
- src/common/interceptors/tenant.interceptor.ts
- src/modules/production/services/mrp-reconciliation.service.ts
- Semua hasil pencarian getTenantDb( lainnya.
2.3 Tutup koneksi pada error sebelum handler
File
- src/common/interceptors/tenant.interceptor.ts
Perubahan
- Setelah koneksi didapat, bungkus pengambilan salt dan pemanggilan handler dalam error handling.
- Jika query tenant secret gagal sebelum observable terbentuk, await release() langsung.
- Setelah handler selesai/error, mulai asynchronous reset; koneksi tidak kembali ke pool sebelum reset selesai.
- Jika tenant atau salt tidak ditemukan, gagal eksplisit. Jangan memakai undefined atau default_salt.
2.4 Migration checksum immutable
File
- src/database/migration.service.ts
Perubahan
- Hapus cabang yang memperbarui checksum di non-production.
- Checksum mismatch selalu menghentikan startup dengan pesan:
  - nama migration,
  - schema,
  - checksum tersimpan,
  - checksum file,
  - instruksi membuat migration baru.
- Perbaiki pengecualian nama bootstrap:
  - Gunakan 000_create_migrations_history.sql, bukan nama singular yang salah.
- Migration baru tidak boleh diubah setelah masuk baseline baru.
Test cases
- Setelah tenant connection dilepas, SHOW search_path pada koneksi yang sama tidak mengandung tenant lama.
- Error saat query tenant_secrets tidak menambah jumlah checked-out connection.
- 100 request gagal berurutan tidak menghabiskan pool.
- Tenant A lalu tenant B pada koneksi yang sama tidak membaca schema A.
- Mengubah satu migration lama menyebabkan startup gagal pada development.
- Migration baru diterapkan dan dicatat satu kali.
- Bootstrap migration tidak dijalankan dua kali sebagai migration biasa.
Acceptance criteria
- Satu application process hanya mempunyai satu PostgreSQL pool.
- Pool kembali idle setelah request sukses maupun gagal.
- Tidak ada koneksi yang dilepas dengan tenant search_path aktif.
- Checksum mismatch tidak pernah diperbaiki otomatis.
Tahap 3 — Transactional integrity untuk confirm, posting, stok, dan pembayaran
3.1 Migration 014
File baru
src/database/migrations/tenant/014_transactional_integrity.sql
Isi
1. Tambah unique partial index untuk source movement:
CREATE UNIQUE INDEX ... ON inventory_movements(reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
2. Tambah unique constraint/index pada:
general_ledger(journal_line_id)
3. Tambah index pendukung lock dan lookup:
   - inventory_movement_items(movement_id)
   - payment_receipt_allocations(invoice_id)
   - ap_payment_allocations(ap_transaction_id)
   - journal_entries(reference_type, reference_id)
4. Jangan membuat unique constraint pada gr_id atau do_id karena kebijakan cancellation/reinvoice belum memiliki active-link column. Serialisasi dilakukan dengan row lock.
3.2 Pola wajib untuk perubahan status
Setiap aksi confirm, post, approve, atau complete yang mempunyai side effect mengikuti urutan:
1. Mulai transaksi.
2. Select source row dengan FOR UPDATE.
3. Validasi status di dalam transaksi.
4. Jalankan side effects.
5. Update status dengan syarat status lama.
6. Pastikan tepat satu row berubah.
7. Commit.
Contoh invariant:
UPDATE delivery_orders
SET status = 'confirmed'
WHERE id = $1 AND status = 'draft';
Jika row count 0, kembalikan HTTP 409.
3.3 Service yang wajib diperbarui
Prioritas pertama:
- goods-receipt.service.ts
- delivery-order.service.ts
- inventory-movement.service.ts
- journal-entry.service.ts
- ap.service.ts
- customer-invoice.service.ts
- work-order.service.ts
- stock-opname.service.ts
- qc-inspection.service.ts
Kemudian terapkan pola sama pada confirm/approve lain yang menghasilkan side effect.
3.4 Lock stok lintas dokumen
File baru
src/modules/inventory/services/stock-lock.ts
Bukan Nest provider; cukup fungsi kecil yang menerima transaksi dan daftar key:
type StockKey = {
  variantId: number;
  warehouseId: number;
  batchId?: number | null;
};
Perilaku:
1. Deduplicate key.
2. Sort berdasarkan variant, warehouse, batch.
3. Ambil pg_advisory_xact_lock untuk setiap key.
4. Baru refresh/baca saldo dan validasi stock.
5. Lock otomatis dilepas ketika transaksi selesai.
Semua jalur stock-out harus memakai helper yang sama:
- Manual inventory movement.
- Delivery Order.
- Work Order material consumption.
- Stock opname adjustment yang mengurangi stok.
3.5 Journal posting
Perubahan
- Lock journal_entries yang akan dipost.
- Lock accounting_periods agar tidak dapat ditutup bersamaan.
- Ambil dan lock account IDs dalam urutan naik.
- Hitung ulang balance setelah account lock.
- Update journal hanya jika masih draft.
- Unique general_ledger.journal_line_id menjadi pertahanan terakhir.
FiscalPeriodService.updatePeriodStatus() juga harus mengunci period dan memastikan tidak ada posting berjalan sebelum mengubah status menjadi closed/locked.
3.6 Pembayaran AP/AR
Perubahan
- Mulai transaksi sebelum validasi outstanding.
- Urutkan allocation berdasarkan target ID.
- Lock seluruh ap_transactions atau customer_invoices dengan FOR UPDATE.
- Validasi supplier/customer dan status setelah lock.
- Hitung ulang total allocation existing.
- Tolak jika hasil akhir melebihi outstanding.
- Baru buat payment, allocation, journal, dan paid status.
Test cases
- Dua request confirm GR: satu sukses, satu 409; satu movement dan satu journal.
- Dua request confirm DO: satu sukses, satu 409; stok hanya berkurang sekali.
- Dua request post journal: satu sukses, satu 409; setiap journal line hanya memiliki satu GL row.
- Dua stock-out berbeda untuk SKU dan gudang sama: transaksi kedua melihat saldo terbaru dan ditolak bila stok habis.
- Dua pembayaran paralel terhadap invoice yang sama tidak dapat menghasilkan overpayment.
- Closing period bersamaan dengan posting: hanya salah satu state transition yang menang.
- Semua failure di tengah transaksi rollback movement, journal, allocation, dan status bersama-sama.
Acceptance criteria
- Tidak ada duplicate movement/journal/ledger pada concurrency test.
- Stock tidak menjadi negatif karena dua transaksi paralel.
- paid_amount <= total_amount selalu benar.
- Semua conflict terkontrol menjadi HTTP 409, bukan PostgreSQL error 500.
Tahap 4 — MRP state machine, retry, enqueue recovery, dan cancellation
4.1 Migration 014: status MRP
Migration yang sama menambah cancelled ke constraint:
pending
running
completed
failed
failed_permanent
cancelled
Tambahkan index reconciliation:
(status, created_at, started_at)
4.2 State transition yang diizinkan
new → pending
pending → running
pending → cancelled
running → completed
running → failed
running → cancelled
failed → pending
failed → failed_permanent
running(stuck) → pending
Transition lain ditolak.
4.3 Trigger dari NestJS
File
- mrp-run.service.ts
Perubahan
1. Insert mrp_runs(status='pending').
2. Coba queue.add() dengan stable job ID.
3. Jika Redis berhasil, return pending seperti sekarang.
4. Jika Redis gagal:
   - Jangan ubah status menjadi failed.
   - Simpan error enqueue pada error_message.
   - Log warning.
   - Tetap return run berstatus pending.
5. Cron akan memperbaiki pending tanpa job.
Public response tetap kompatibel: runId, status, tanggal, dan createdAt.
4.4 Claim worker dalam transaksi pendek
File
- internal/infra/mrp/engine.go
- internal/infra/db/repository.go
Perubahan
1. Jalankan MarkRunning() dalam WithTenantSchema() tersendiri.
2. Commit segera.
3. Jika row tidak berubah, worker berhenti tanpa kalkulasi.
4. Jalankan load/calculate/write pada transaksi kedua.
5. Jika kalkulasi gagal, MarkFailed() hanya boleh mengubah row yang masih running.
6. Jangan menimpa cancelled.
Dengan ini status running terlihat oleh API dan reconciliation selama kalkulasi berlangsung.
4.5 Writer cancellation guard
Sebelum menghapus atau menulis planned order:
1. SELECT status FROM mrp_runs WHERE id=$1 FOR UPDATE.
2. Jika status bukan running, batalkan transaksi tanpa menulis hasil.
3. Tulis hasil MRP.
4. Update ke completed WHERE status='running'.
5. Pastikan satu row berubah.
Jika cancellation lebih dulu memperoleh lock, writer rollback tanpa hasil. Jika writer lebih dulu memperoleh lock, cancel menunggu lalu mendapatkan conflict karena status sudah completed.
4.6 Reconciliation
File
- mrp-reconciliation.service.ts
Ekstrak helper internal ensureQueued() agar seluruh jalur memakai payload dan job options yang sama.
Cron memproses:
Pending tanpa job
- Pilih pending yang lebih tua dari 30 detik.
- Bila job tidak ada, tambahkan dengan stable job ID.
- Bila job lama completed atau failed, remove lalu add ulang.
- Tidak menaikkan retry_count.
Failed
- Bila retry_count < 3, conditional update failed → pending dan tambah retry count.
- Panggil ensureQueued().
- Bila queue gagal, biarkan pending; siklus berikutnya mencoba lagi.
- Bila retry habis, update failed_permanent dan emit alert.
Running macet
- Pilih running yang melewati configured timeout.
- Jika BullMQ job masih active, alert dan jangan retry.
- Jika tidak active:
  - conditional update running → pending,
  - tambah retry count,
  - ensure queued.
- Retry habis menjadi failed_permanent.
Semua update menyertakan expected old status agar beberapa instance cron aman berjalan bersamaan.
4.7 Cancellation
File
- mrp-run.service.ts
Perilaku:
- pending/running → cancelled memakai conditional update.
- Set completed_at dan reason.
- Waiting/delayed job boleh dihapus.
- Active job tidak perlu dipaksa remove; worker writer guard mencegah hasil disimpan.
- completed, failed_permanent, dan cancelled menghasilkan 409.
- Jika status berubah selama request, row count nol menghasilkan 409.
Test cases
Backend:
- Redis mati saat trigger: run tetap pending.
- Redis pulih: cron membuat job dan worker dapat mengambilnya.
- Worker failure: status failed lalu retry sampai maksimal tiga.
- Pending orphan tidak menaikkan retry count.
- Dua instance cron tidak membuat dua job.
- Cancel pending menghapus waiting job.
- Cancel running mencegah planned order tersimpan.
- Cancel setelah completion menghasilkan 409.
Go:
- running terlihat dari koneksi lain selama calculation.
- Worker tidak mengambil run yang bukan pending.
- MarkFailed tidak menimpa cancelled.
- Writer terhadap cancelled run tidak menghapus atau menambah planned order.
- Retry run yang sama tetap idempotent.
- Schema version mismatch langsung menjadi failed permanent.
Acceptance criteria
- Tidak ada run pending permanen hanya karena Redis sempat mati.
- Semua transient worker failure mendapat maksimal tiga retry.
- retry_count konsisten dengan eksekusi worker, bukan percobaan enqueue.
- Cancelled run tidak mempunyai planned order baru.
- Tidak ada state yang dapat ditimpa tanpa expected-state check.
Tahap 5 — Partial invoice dan COGS
5.1 Customer invoice berdasarkan Delivery Order
File
- customer-invoice.service.ts
- DTO response bila diperlukan, tanpa mengubah request existing.
Perubahan
Di dalam satu transaksi:
1. Lock Sales Order.
2. Lock seluruh Delivery Order berdasarkan ID terurut.
3. Validasi semua DO:
   - milik SO yang sama,
   - status confirmed,
   - belum dipakai invoice aktif.
4. Query item DO dan SO item terkait.
5. Hitung per baris:
   - gross = quantity_delivered × unit_price
   - discount berdasarkan discount_pct
   - taxable subtotal setelah discount
   - tax berdasarkan tax_pct
6. Round setiap nilai ke 4 decimal sebelum agregasi.
7. Simpan subtotal, tax, dan total hanya untuk DO tersebut.
8. AR dan journal memakai total invoice hasil perhitungan.
9. SO menjadi:
   - invoiced bila seluruh kuantitas delivered sudah di-invoice,
   - partial bila masih ada delivered quantity yang belum di-invoice.
Tidak lagi menyalin total seluruh SO ke invoice parsial.
5.2 COGS dari cost price
File
- delivery-order.service.ts
Perubahan
- Join product_variants ketika mengambil DO items.
- inventory_movement_items.unit_cost = product_variants.cost_price.
- COGS = quantity_delivered × cost_price.
- Jangan memakai sales_order_items.unit_price.
- Bila cost price nol:
  - movement tetap dapat diproses,
  - journal COGS tidak dibuat untuk nilai nol,
  - emit structured warning dengan variant ID.
- Production costing yang lebih lengkap menjadi pekerjaan terpisah setelah poin 1–10.
Test cases
- SO 100 unit, DO pertama 40 unit: invoice hanya menagih 40 unit.
- DO kedua 60 unit: total dua invoice sama dengan nilai SO.
- Discount dan tax berbeda per item dihitung sesuai DO quantity.
- DO yang sama tidak dapat diinvoicing paralel dua kali.
- AR transaction dan sales journal sama dengan nilai invoice parsial.
- Harga jual 150 dan cost price 90: COGS memakai 90.
- Margin laporan mencerminkan sales 150 dan COGS 90.
- Cost price nol menghasilkan warning dan tidak membuat jurnal nol.
Acceptance criteria
- Total invoice tidak pernah melebihi nilai delivered goods.
- Total invoice seluruh DO sama dengan SO dalam toleransi 0.0001.
- COGS tidak pernah membaca unit_price dari Sales Order.
- Inventory movement dan journal memakai basis biaya yang sama.
Tahap 6 — Reset database dan validasi penuh
Urutan reset
1. Stop NestJS, worker Go, dan scheduler.
2. Backup database development bila masih ingin menyimpan referensi manual.
3. Kosongkan queue Redis MRP.
4. Drop dan create ulang database development.
5. Jalankan provisioning role MRP.
6. Jalankan public migration.
7. Jalankan admin bootstrap.
8. Jalankan tenant migration 001–014.
9. Verifikasi GRANT mrp_service.
10. Start NestJS.
11. Start worker Go.
12. Jalankan smoke test dua tenant.
Smoke test wajib
Auth dan tenant
- Login dua tenant.
- ID hashing berbeda per tenant.
- Tenant A tidak dapat membaca data tenant B.
- Pool kembali idle setelah request.
Purchase
- PR → RFQ → PO → GR.
- Confirm GR dua kali secara paralel.
- Verifikasi satu movement, satu journal, dan stok benar.
- Vendor invoice dan AP terbentuk.
Sales
- SO → dua DO parsial.
- Confirm DO paralel terhadap stok terbatas.
- Buat dua invoice parsial.
- Verifikasi total invoice dan COGS.
Accounting
- Post journal paralel.
- Payment AR/AP paralel.
- Tutup period bersamaan dengan posting.
- Verifikasi trial balance tetap seimbang.
Production/MRP
- Trigger MRP dengan Redis hidup.
- Trigger ketika Redis mati, lalu hidupkan Redis dan tunggu reconciliation.
- Paksa worker gagal lalu verifikasi retry.
- Cancel saat running.
- Jalankan dua tenant bersamaan dan periksa isolasi planned order.
Acceptance criteria global
- Seluruh build, lint, unit, integration, concurrency, dan race test lulus.
- Tidak ada secret pada working tree atau Git history.
- Tidak ada stok negatif dari concurrency test.
- Tidak ada duplicate journal, movement, payment allocation, atau planned order.
- Trial balance debit sama dengan kredit.
- Semua MRP run mencapai terminal state: completed, failed permanent, atau cancelled.
- Clean clone dapat dibangun dan dijalankan memakai dokumentasi saja.
Tahap 7 — Dokumentasi dan rollout Git
File dokumentasi
- backend-erp/README.md
- backend-erp/docs/project_documentation.md
- erp-mrp-engine/README.md
- erp-mrp-engine/docs/session.md
- erp-mrp-engine/docs/mrp-test-validation-report.md
Isi yang diperbarui
- Setup PostgreSQL dan Redis test.
- Urutan provisioning role, migration, dan bootstrap admin.
- Diagram state MRP final.
- Kebijakan immutable migration.
- Cara rotasi secret.
- Cara menjalankan concurrency test.
- Batas costing v1: product_variants.cost_price.
- Hapus klaim yang tidak lagi sesuai kode.
Urutan commit/PR yang disarankan
1. PR 1 — Test infrastructure dan safe integration fixtures
2. PR 2 — Secret removal, bootstrap, dan role provisioning
3. PR 3 — Shared pool, tenant release, dan migration immutability
4. PR 4 — Transaction locks, database constraints, dan payment safety
5. PR 5 — MRP state machine, retry, enqueue recovery, cancellation
6. PR 6 — Partial invoice dan COGS correction
7. PR 7 — Documentation dan final validation evidence
8. Rewrite Git history dan force-push setelah seluruh PR digabung pada branch development.
9. Reset database/Redis dan jalankan smoke test final.
Setiap PR harus tetap buildable dan tidak boleh bergantung pada perubahan yang belum masuk, kecuali migration 014 dan service changes yang digabung dalam PR transactional masing-masing.
Definition of done
Poin 1–10 dianggap selesai hanya bila:
- Implementasi ada di Git, bukan hanya working tree.
- Regression test yang mereproduksi bug lama gagal tanpa fix dan lulus dengan fix.
- Integration test memakai PostgreSQL nyata.
- Concurrency test benar-benar mengirim request/transaction paralel.
- Database berhasil dibuat ulang dari kosong.
- Dua tenant berhasil melewati alur utama tanpa kebocoran.
- Tidak ada secret atau credential default dalam history.
- Dokumentasi sama dengan perilaku runtime.
Yang sengaja tidak termasuk: frontend, user/role management API, tax-code overhaul, bank reconciliation redesign, dan production cost sheet penuh. Risiko tersisa terbesar adalah metode valuation yang masih memakai product_variants.cost_price; itu cukup untuk menutup bug harga jual sebagai COGS, tetapi belum menggantikan FIFO/average costing.