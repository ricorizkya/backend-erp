-- ================================================================
-- 012_mrp_engine_service_support.sql
-- Tenant migration: perluasan mrp_runs + support MRP Go service
-- ================================================================

-- 1. Hapus constraint lama status check
ALTER TABLE mrp_runs DROP CONSTRAINT IF EXISTS mrp_runs_status_check;

-- 2. Perluasan kolom status mrp_runs
ALTER TABLE mrp_runs
  ALTER COLUMN status TYPE VARCHAR(20),
  ALTER COLUMN status SET DEFAULT 'pending';

-- Tambah constraint baru dengan status yang diperluas
ALTER TABLE mrp_runs
  ADD CONSTRAINT mrp_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'failed_permanent'));

-- 3. Tambah kolom baru di mrp_runs
ALTER TABLE mrp_runs
  ADD COLUMN IF NOT EXISTS retry_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS job_schema_version INTEGER NOT NULL DEFAULT 1;

-- 4. Tambah lead_time_days di product_variants
--
-- PERHATIAN: default diubah dari 0 menjadi 7. Kolom NOT NULL berarti
-- fallback "COALESCE(lead_time_days, 7)" yang direncanakan di query Go
-- (FR-07, mrp-engine-full-plan.md) TIDAK PERNAH akan terpicu — kolom
-- ini tidak akan pernah NULL. Kalau default tetap 0, semua produk yang
-- belum di-set lead time eksplisit akan dihitung MRP dengan lead time
-- NOL HARI (planned_start = planned_finish), yang tidak realistis.
-- Ganti ke 7 supaya konsisten dengan asumsi default yang sudah
-- direncanakan di level Go. Kalau ada angka default lain yang lebih
-- sesuai (misal per kategori produk), ganti di sini — tapi JANGAN
-- biarkan 0 tanpa keputusan sadar, itu bug diam-diam.
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 7;

-- 5. Index untuk reconciliation cron (query mrp_runs stuck jobs)
CREATE INDEX IF NOT EXISTS idx_mrp_runs_reconciliation
  ON mrp_runs (status, started_at)
  WHERE status = 'running';

-- 6. Concurrent run prevention — satu MRP run aktif per tenant (FR-01)
--
-- Karena tiap tenant = satu schema, cukup pastikan tidak ada lebih dari
-- satu row berstatus pending/running SEKALIGUS di schema ini.
--
-- CATATAN PENTING: index ini adalah pertahanan terakhir untuk race
-- condition, BUKAN pengganti cek di aplikasi. MrpRunService.triggerRun()
-- masih perlu try/catch eksplisit untuk unique_violation (kode 23505)
-- di sekitar INSERT-nya — tanpa itu, kalau index ini yang menahan race
-- condition (bukan SELECT check di aplikasi), error Postgres mentah
-- akan bocor sebagai 500 ke user, bukan pesan yang jelas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mrp_runs_one_active_per_tenant
  ON mrp_runs ((1))
  WHERE status IN ('pending', 'running');

-- 7. GRANT permissions untuk role mrp_service
--
-- CATATAN: blok ini silently no-op kalau role 'mrp_service' belum ada
-- (misal migration 007_create_mrp_service_role.sql belum sempat jalan di
-- environment ini). Numbering migration (007 < 012) seharusnya menjamin
-- urutan, tapi kalau migration runner tidak strictly sequential per
-- environment, ini bisa silent-fail tanpa error — permission tidak pernah
-- ter-grant dan tidak ada yang tahu sampai Go worker gagal connect dengan
-- permission denied.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO mrp_service', CURRENT_SCHEMA());
    EXECUTE 'GRANT SELECT ON product_variants, bom_headers, bom_versions, bom_items, bom_operations, uom, warehouses, suppliers, mrp_demands TO mrp_service';
    EXECUTE 'GRANT SELECT, UPDATE ON mrp_runs TO mrp_service';
    EXECUTE 'GRANT SELECT, INSERT ON planned_orders, planned_order_demands TO mrp_service';
  ELSE
    RAISE WARNING 'Role mrp_service tidak ditemukan — GRANT permission di-skip. Jalankan 007_create_mrp_service_role.sql dulu, lalu re-run migration ini secara manual untuk schema %.', CURRENT_SCHEMA();
  END IF;
END
$$;

