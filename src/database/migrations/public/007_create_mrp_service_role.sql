-- ============================================================
-- 007_create_mrp_service_role.sql
-- Public migration: buat role mrp_service untuk Go worker
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service') THEN
    CREATE ROLE mrp_service LOGIN PASSWORD 'mrp_service_secret';
  END IF;
END
$$;
