-- Rebuild derived stock views so transfers move quantity between warehouses.

DROP MATERIALIZED VIEW IF EXISTS available_stock;
DROP MATERIALIZED VIEW IF EXISTS stock_summary;

CREATE MATERIALIZED VIEW stock_summary AS
SELECT
    variant_id,
    batch_id,
    warehouse_id,
    SUM(quantity_delta) AS quantity_on_hand
FROM (
    SELECT
        mi.variant_id,
        mi.batch_id,
        mi.to_warehouse_id AS warehouse_id,
        CASE
            WHEN mt.direction IN ('in', 'transfer') THEN mi.quantity
            ELSE 0
        END AS quantity_delta
    FROM inventory_movement_items mi
    JOIN inventory_movements m ON m.id = mi.movement_id
    JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
    WHERE m.status = 'confirmed'
      AND mi.to_warehouse_id IS NOT NULL

    UNION ALL

    SELECT
        mi.variant_id,
        mi.batch_id,
        mi.from_warehouse_id AS warehouse_id,
        CASE
            WHEN mt.direction IN ('out', 'transfer') THEN -mi.quantity
            ELSE 0
        END AS quantity_delta
    FROM inventory_movement_items mi
    JOIN inventory_movements m ON m.id = mi.movement_id
    JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
    WHERE m.status = 'confirmed'
      AND mi.from_warehouse_id IS NOT NULL
) movements
GROUP BY variant_id, batch_id, warehouse_id;

CREATE UNIQUE INDEX idx_stock_summary_unique
    ON stock_summary(variant_id, warehouse_id, COALESCE(batch_id, 0::bigint));
CREATE INDEX idx_stock_summary_warehouse ON stock_summary(warehouse_id);
CREATE INDEX idx_stock_summary_variant ON stock_summary(variant_id);

CREATE MATERIALIZED VIEW available_stock AS
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
    ON reserved.variant_id = ss.variant_id
   AND reserved.warehouse_id = ss.warehouse_id;

CREATE UNIQUE INDEX idx_available_stock_unique
    ON available_stock(variant_id, warehouse_id, COALESCE(batch_id, 0));
CREATE INDEX idx_available_stock_warehouse ON available_stock(warehouse_id);
CREATE INDEX idx_available_stock_variant ON available_stock(variant_id);
