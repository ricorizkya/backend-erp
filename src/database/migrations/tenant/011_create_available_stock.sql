-- ============================================================
-- AVAILABLE STOCK VIEW
-- Soft reservation: stock on hand dikurangi quantity yang
-- sudah "dijanjikan" ke SO confirmed tapi belum di-delivery.
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS available_stock AS
SELECT
    ss.variant_id,
    ss.warehouse_id,
    ss.batch_id,
    ss.quantity_on_hand,
    COALESCE(reserved.quantity_reserved, 0) AS quantity_reserved,
    ss.quantity_on_hand - COALESCE(reserved.quantity_reserved, 0)
        AS quantity_available
FROM stock_summary ss
LEFT JOIN (
    SELECT
        soi.variant_id,
        so.warehouse_id,
        SUM(soi.quantity_pending) AS quantity_reserved
    FROM sales_order_items soi
    JOIN sales_orders so ON so.id = soi.so_id
    WHERE so.status IN ('confirmed', 'partial')
      AND soi.quantity_pending > 0
    GROUP BY soi.variant_id, so.warehouse_id
) reserved
    ON  reserved.variant_id   = ss.variant_id
    AND reserved.warehouse_id = ss.warehouse_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_available_stock_unique
    ON available_stock(
        variant_id,
        warehouse_id,
        COALESCE(batch_id, 0)
    );

CREATE INDEX IF NOT EXISTS idx_available_stock_warehouse
    ON available_stock(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_available_stock_variant
    ON available_stock(variant_id);

-- Seed SO document types
INSERT INTO document_counters (doc_type, year, counter)
VALUES
    ('SQ',  EXTRACT(YEAR FROM NOW())::INTEGER, 0),
    ('SO',  EXTRACT(YEAR FROM NOW())::INTEGER, 0),
    ('DO',  EXTRACT(YEAR FROM NOW())::INTEGER, 0),
    ('INV', EXTRACT(YEAR FROM NOW())::INTEGER, 0),
    ('PAY', EXTRACT(YEAR FROM NOW())::INTEGER, 0)
ON CONFLICT (doc_type, year) DO NOTHING;
