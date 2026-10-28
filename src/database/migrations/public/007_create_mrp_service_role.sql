-- ============================================================
-- 007_create_mrp_service_role.sql
-- Public migration: buat group role mrp_service tanpa credential bawaan.
-- Login hanya diaktifkan secara eksplisit oleh scripts/provision-mrp-role.cjs.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service') THEN
    CREATE ROLE mrp_service NOLOGIN;
  END IF;
END
$$;
