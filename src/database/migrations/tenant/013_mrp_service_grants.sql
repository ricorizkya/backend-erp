-- ================================================================
-- 013_mrp_service_grants.sql
-- Tenant migration: tambahan GRANT permissions untuk role mrp_service
-- (UPDATE pada mrp_demands & DELETE pada planned_orders untuk idempotensi)
-- ================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service') THEN
    -- Izin update status demand saat dialokasikan oleh MRP engine
    EXECUTE 'GRANT UPDATE ON mrp_demands TO mrp_service';

    -- Izin delete planned orders untuk clean-before-write (idempotensi saat re-run)
    EXECUTE 'GRANT DELETE ON planned_orders, planned_order_demands TO mrp_service';
  ELSE
    RAISE WARNING 'Role mrp_service tidak ditemukan — GRANT tambahan di-skip. Jalankan 007_create_mrp_service_role.sql dulu.';
  END IF;
END
$$;
