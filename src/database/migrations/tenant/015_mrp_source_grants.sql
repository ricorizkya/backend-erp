-- Source tables and views read by the MRP worker.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service') THEN
    GRANT SELECT ON purchase_orders, purchase_order_items, stock_summary TO mrp_service;
  ELSE
    RAISE WARNING 'Role mrp_service tidak ditemukan — GRANT source MRP di-skip.';
  END IF;
END
$$;
