-- ============================================================
-- PRODUCTION PLANNING SCHEMA
-- MRP (Material Requirements Planning) + Work Orders
-- ============================================================

-- ============================================================
-- 1. MRP DEMAND
-- ============================================================

CREATE TABLE IF NOT EXISTS mrp_demands (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    variant_id      BIGINT       NOT NULL REFERENCES product_variants(id),

    demand_type     VARCHAR(20)  NOT NULL
                    CHECK (demand_type IN ('sales_order', 'forecast', 'safety_stock')),

    so_id           BIGINT       REFERENCES sales_orders(id),
    so_item_id      BIGINT       REFERENCES sales_order_items(id),

    quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT        NOT NULL REFERENCES uom(id),
    needed_date     DATE          NOT NULL,
    warehouse_id    BIGINT        NOT NULL REFERENCES warehouses(id),

    status          VARCHAR(20)  NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'planned', 'fulfilled', 'cancelled')),

    notes           TEXT,
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- 2. MRP RUN
-- ============================================================

CREATE TABLE IF NOT EXISTS mrp_runs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_date        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    plan_from       DATE         NOT NULL,
    plan_to         DATE         NOT NULL,

    status          VARCHAR(20)  NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),

    total_planned_production  INTEGER DEFAULT 0,
    total_planned_purchase    INTEGER DEFAULT 0,

    error_message   TEXT,
    duration_ms     INTEGER,
    triggered_by    BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- 3. PLANNED ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS planned_orders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mrp_run_id      BIGINT       NOT NULL REFERENCES mrp_runs(id),
    variant_id      BIGINT       NOT NULL REFERENCES product_variants(id),

    order_type      VARCHAR(20)  NOT NULL
                    CHECK (order_type IN ('production', 'purchase')),

    quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT        NOT NULL REFERENCES uom(id),

    planned_start   DATE          NOT NULL,
    planned_finish  DATE          NOT NULL,

    bom_version_id  BIGINT        REFERENCES bom_versions(id),

    suggested_supplier_id BIGINT  REFERENCES suppliers(id),

    status          VARCHAR(20)  NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'approved', 'cancelled')),

    work_order_id   BIGINT,
    purchase_order_id BIGINT,

    notes           TEXT,
    approved_by     BIGINT,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planned_order_demands (
    planned_order_id    BIGINT         NOT NULL REFERENCES planned_orders(id) ON DELETE CASCADE,
    demand_id           BIGINT         NOT NULL REFERENCES mrp_demands(id),
    quantity_allocated  NUMERIC(18,4)  NOT NULL CHECK (quantity_allocated > 0),
    PRIMARY KEY (planned_order_id, demand_id)
);

-- ============================================================
-- 4. WORK ORDERS (WO)
-- ============================================================

CREATE TABLE IF NOT EXISTS work_orders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(50)  UNIQUE NOT NULL,

    planned_order_id BIGINT      REFERENCES planned_orders(id),

    so_id           BIGINT       REFERENCES sales_orders(id),
    so_item_id      BIGINT       REFERENCES sales_order_items(id),

    variant_id      BIGINT       NOT NULL REFERENCES product_variants(id),
    bom_version_id  BIGINT       NOT NULL REFERENCES bom_versions(id),

    quantity_planned  NUMERIC(18,4) NOT NULL CHECK (quantity_planned > 0),
    quantity_produced NUMERIC(18,4) NOT NULL DEFAULT 0,
    uom_id            BIGINT        NOT NULL REFERENCES uom(id),

    output_warehouse_id BIGINT    NOT NULL REFERENCES warehouses(id),

    planned_start   DATE          NOT NULL,
    planned_finish  DATE          NOT NULL,
    actual_start    TIMESTAMPTZ,
    actual_finish   TIMESTAMPTZ,

    status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                        'draft', 'confirmed', 'in_progress', 'completed', 'partially_done', 'cancelled'
                    )),

    production_type VARCHAR(20)   NOT NULL DEFAULT 'mts'
                    CHECK (production_type IN ('mts', 'mto')),

    notes           TEXT,
    created_by      BIGINT        NOT NULL,
    confirmed_by    BIGINT,
    confirmed_at    TIMESTAMPTZ,
    completed_by    BIGINT,
    completed_at    TIMESTAMPTZ,
    cancelled_by    BIGINT,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ============================================================
-- 5. WORK ORDER MATERIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS work_order_materials (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id       BIGINT         NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    bom_item_id         BIGINT         REFERENCES bom_items(id),
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),

    quantity_planned    NUMERIC(18,4)  NOT NULL CHECK (quantity_planned > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),

    quantity_consumed   NUMERIC(18,4)  NOT NULL DEFAULT 0,

    warehouse_id        BIGINT         NOT NULL REFERENCES warehouses(id),

    status              VARCHAR(20)    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'partial', 'consumed', 'cancelled')),

    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_order_material_lots (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wo_material_id      BIGINT         NOT NULL REFERENCES work_order_materials(id) ON DELETE CASCADE,
    batch_id            BIGINT         REFERENCES batches(id),
    quantity_consumed   NUMERIC(18,4)  NOT NULL CHECK (quantity_consumed > 0),
    consumed_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    consumed_by         BIGINT         NOT NULL,

    inventory_movement_id BIGINT       REFERENCES inventory_movements(id)
);

-- ============================================================
-- 6. WORK ORDER OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS work_order_operations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id       BIGINT         NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    bom_operation_id    BIGINT         REFERENCES bom_operations(id),
    sequence            INTEGER        NOT NULL,
    name                VARCHAR(255)   NOT NULL,
    work_center         VARCHAR(100),

    planned_duration_minutes NUMERIC(10,2) DEFAULT 0,

    actual_start        TIMESTAMPTZ,
    actual_finish       TIMESTAMPTZ,
    actual_duration_minutes NUMERIC(10,2)
                        GENERATED ALWAYS AS (
                            EXTRACT(EPOCH FROM (actual_finish - actual_start)) / 60
                        ) STORED,

    status              VARCHAR(20)    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),

    operator_id         BIGINT,
    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 7. PRODUCTION RESULTS
-- ============================================================

CREATE TABLE IF NOT EXISTS production_results (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id       BIGINT         NOT NULL REFERENCES work_orders(id),
    result_date         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity_produced   NUMERIC(18,4)  NOT NULL CHECK (quantity_produced > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),

    batch_id            BIGINT         REFERENCES batches(id),

    warehouse_id        BIGINT         NOT NULL REFERENCES warehouses(id),

    inventory_movement_id BIGINT       REFERENCES inventory_movements(id),

    notes               TEXT,
    created_by          BIGINT         NOT NULL,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_result_by_products (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_result_id BIGINT        NOT NULL REFERENCES production_results(id) ON DELETE CASCADE,
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity            NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    type                VARCHAR(20)    NOT NULL
                        CHECK (type IN ('by_product', 'scrap', 'co_product')),
    warehouse_id        BIGINT         NOT NULL REFERENCES warehouses(id),
    inventory_movement_id BIGINT       REFERENCES inventory_movements(id),
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- MRP Demands
CREATE INDEX IF NOT EXISTS idx_mrp_demands_variant
    ON mrp_demands(variant_id);
CREATE INDEX IF NOT EXISTS idx_mrp_demands_status
    ON mrp_demands(status);
CREATE INDEX IF NOT EXISTS idx_mrp_demands_needed_date
    ON mrp_demands(needed_date);
CREATE INDEX IF NOT EXISTS idx_mrp_demands_so
    ON mrp_demands(so_id)
    WHERE so_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mrp_demands_type
    ON mrp_demands(demand_type);

-- MRP Runs
CREATE INDEX IF NOT EXISTS idx_mrp_runs_status
    ON mrp_runs(status);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_date
    ON mrp_runs(run_date DESC);

-- Planned Orders
CREATE INDEX IF NOT EXISTS idx_planned_orders_run
    ON planned_orders(mrp_run_id);
CREATE INDEX IF NOT EXISTS idx_planned_orders_variant
    ON planned_orders(variant_id);
CREATE INDEX IF NOT EXISTS idx_planned_orders_status
    ON planned_orders(status);
CREATE INDEX IF NOT EXISTS idx_planned_orders_type
    ON planned_orders(order_type);
CREATE INDEX IF NOT EXISTS idx_planned_orders_dates
    ON planned_orders(planned_start, planned_finish);

-- Work Orders
CREATE INDEX IF NOT EXISTS idx_wo_variant
    ON work_orders(variant_id);
CREATE INDEX IF NOT EXISTS idx_wo_status
    ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_production_type
    ON work_orders(production_type);
CREATE INDEX IF NOT EXISTS idx_wo_so
    ON work_orders(so_id)
    WHERE so_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wo_planned_order
    ON work_orders(planned_order_id)
    WHERE planned_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wo_dates
    ON work_orders(planned_start, planned_finish);
CREATE INDEX IF NOT EXISTS idx_wo_bom_version
    ON work_orders(bom_version_id);

-- WO Materials
CREATE INDEX IF NOT EXISTS idx_wo_materials_wo
    ON work_order_materials(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_materials_variant
    ON work_order_materials(variant_id);
CREATE INDEX IF NOT EXISTS idx_wo_materials_status
    ON work_order_materials(status);
CREATE INDEX IF NOT EXISTS idx_wo_material_lots_material
    ON work_order_material_lots(wo_material_id);
CREATE INDEX IF NOT EXISTS idx_wo_material_lots_batch
    ON work_order_material_lots(batch_id)
    WHERE batch_id IS NOT NULL;

-- WO Operations
CREATE INDEX IF NOT EXISTS idx_wo_operations_wo
    ON work_order_operations(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_operations_status
    ON work_order_operations(status);

-- Production Results
CREATE INDEX IF NOT EXISTS idx_production_results_wo
    ON production_results(work_order_id);
CREATE INDEX IF NOT EXISTS idx_production_results_variant
    ON production_results(variant_id);
CREATE INDEX IF NOT EXISTS idx_production_results_date
    ON production_results(result_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_by_products_result
    ON production_result_by_products(production_result_id);
