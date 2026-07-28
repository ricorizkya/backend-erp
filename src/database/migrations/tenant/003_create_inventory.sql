CREATE TABLE IF NOT EXISTS warehouse_locations (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id BIGINT       NOT NULL REFERENCES warehouses(id),
    code         VARCHAR(50)  NOT NULL,
    name         VARCHAR(100),
    is_active    BOOLEAN      DEFAULT true,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(warehouse_id, code)
);
 
-- Tipe transaksi inventory
-- Dipisah ke tabel sendiri agar extensible tanpa ubah schema
CREATE TABLE IF NOT EXISTS inventory_movement_types (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50)  UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    direction   VARCHAR(10)  NOT NULL CHECK (direction IN ('in', 'out', 'transfer')),
    description TEXT,
 
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Header transaksi inventory
CREATE TABLE IF NOT EXISTS inventory_movements (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_type_id BIGINT      NOT NULL REFERENCES inventory_movement_types(id),
    reference_type  VARCHAR(50),
    reference_id    BIGINT,
    movement_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'confirmed', 'cancelled')),
 
    -- Audit trail
    created_by      BIGINT      NOT NULL,
    confirmed_by    BIGINT,
    confirmed_at    TIMESTAMPTZ,
    cancelled_by    BIGINT,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
 
-- Line item transaksi inventory
CREATE TABLE IF NOT EXISTS inventory_movement_items (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_id      BIGINT         NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
    variant_id       BIGINT         NOT NULL REFERENCES product_variants(id),
    batch_id         BIGINT         REFERENCES batches(id),
 
    from_warehouse_id     BIGINT    REFERENCES warehouses(id),
    from_location_id      BIGINT    REFERENCES warehouse_locations(id),
    to_warehouse_id       BIGINT    REFERENCES warehouses(id),
    to_location_id        BIGINT    REFERENCES warehouse_locations(id),
 
    quantity         NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id           BIGINT         NOT NULL REFERENCES uom(id),
 
    unit_cost        NUMERIC(18,4)  DEFAULT 0,
 
    notes            TEXT,
    created_at       TIMESTAMPTZ    DEFAULT NOW()
);
 
-- ============================================================
-- STOCK SUMMARY — Materialized view untuk performa
-- ============================================================
 
CREATE MATERIALIZED VIEW IF NOT EXISTS stock_summary AS
SELECT
    mi.variant_id,
    mi.batch_id,
    COALESCE(mi.to_warehouse_id, mi.from_warehouse_id) AS warehouse_id,
    SUM(
        CASE
            WHEN mt.direction = 'in'       THEN  mi.quantity
            WHEN mt.direction = 'out'      THEN -mi.quantity
            ELSE 0
        END
    ) AS quantity_on_hand
FROM inventory_movement_items mi
JOIN inventory_movements       m  ON m.id  = mi.movement_id
JOIN inventory_movement_types  mt ON mt.id = m.movement_type_id
WHERE m.status = 'confirmed'
GROUP BY
    mi.variant_id,
    mi.batch_id,
    COALESCE(mi.to_warehouse_id, mi.from_warehouse_id);
 
-- Index di materialized view untuk query cepat
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_summary_unique
    ON stock_summary(variant_id, warehouse_id, COALESCE(batch_id, 0::bigint));
 
CREATE INDEX IF NOT EXISTS idx_stock_summary_warehouse
    ON stock_summary(warehouse_id);
 
CREATE INDEX IF NOT EXISTS idx_stock_summary_variant
    ON stock_summary(variant_id);
 
-- ============================================================
-- STOCK OPNAME (Physical Count)
-- ============================================================
 
CREATE TABLE IF NOT EXISTS stock_opnames (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id    BIGINT      NOT NULL REFERENCES warehouses(id),
    opname_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'counting', 'completed', 'cancelled')),
    notes           TEXT,
    created_by      BIGINT      NOT NULL,
    completed_by    BIGINT,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
 
CREATE TABLE IF NOT EXISTS stock_opname_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opname_id       BIGINT         NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),
    batch_id        BIGINT         REFERENCES batches(id),
    system_quantity NUMERIC(18,4)  NOT NULL DEFAULT 0,
    actual_quantity NUMERIC(18,4),
    difference      NUMERIC(18,4)
                    GENERATED ALWAYS AS (actual_quantity - system_quantity) STORED,
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);
 
-- ============================================================
-- INDEXES
-- ============================================================
 
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_warehouse_id
    ON warehouse_locations(warehouse_id);
 
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type
    ON inventory_movements(movement_type_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_status
    ON inventory_movements(status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date
    ON inventory_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
    ON inventory_movements(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;
 
CREATE INDEX IF NOT EXISTS idx_movement_items_movement_id
    ON inventory_movement_items(movement_id);
CREATE INDEX IF NOT EXISTS idx_movement_items_variant_id
    ON inventory_movement_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_movement_items_batch_id
    ON inventory_movement_items(batch_id)
    WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movement_items_from_warehouse
    ON inventory_movement_items(from_warehouse_id)
    WHERE from_warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movement_items_to_warehouse
    ON inventory_movement_items(to_warehouse_id)
    WHERE to_warehouse_id IS NOT NULL;
 
CREATE INDEX IF NOT EXISTS idx_movement_items_stock_query
    ON inventory_movement_items(variant_id, to_warehouse_id);
 
CREATE INDEX IF NOT EXISTS idx_stock_opnames_warehouse
    ON stock_opnames(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_opname
    ON stock_opname_items(opname_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_variant
    ON stock_opname_items(variant_id);
 
-- ============================================================
-- SEED DATA: inventory_movement_types
-- ============================================================
 
INSERT INTO inventory_movement_types (code, name, direction, description)
VALUES
    ('PURCHASE_RECEIPT',  'Penerimaan Pembelian',      'in',       'Barang masuk dari Purchase Order'),
    ('PRODUCTION_IN',     'Hasil Produksi',            'in',       'Barang jadi masuk dari Work Order'),
    ('RETURN_CUSTOMER',   'Retur dari Customer',       'in',       'Barang kembali dari customer'),
    ('ADJUSTMENT_IN',     'Penyesuaian Masuk',         'in',       'Koreksi stock opname — kelebihan fisik'),
    ('SALES_DELIVERY',    'Pengiriman Penjualan',       'out',      'Barang keluar untuk Sales Order'),
    ('PRODUCTION_OUT',    'Konsumsi Produksi',         'out',      'Bahan baku keluar ke Work Order'),
    ('RETURN_SUPPLIER',   'Retur ke Supplier',         'out',      'Barang dikembalikan ke supplier'),
    ('ADJUSTMENT_OUT',    'Penyesuaian Keluar',        'out',      'Koreksi stock opname — kekurangan fisik'),
    ('TRANSFER',          'Transfer Antar Gudang',     'transfer', 'Perpindahan stock antar warehouse')
ON CONFLICT (code) DO NOTHING;