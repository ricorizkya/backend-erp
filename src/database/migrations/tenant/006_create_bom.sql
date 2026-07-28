-- ============================================================
-- BILL OF MATERIALS (BOM) SCHEMA
-- Support: Multi-level BOM + Versioning
-- ============================================================

-- ============================================================
-- 1. BOM HEADER
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_headers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    variant_id      BIGINT       NOT NULL REFERENCES product_variants(id),
    name            VARCHAR(255) NOT NULL,
    notes           TEXT,
    is_active       BOOLEAN      DEFAULT true,
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),

    UNIQUE(variant_id)
);

-- ============================================================
-- 2. BOM VERSION
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_versions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bom_header_id   BIGINT       NOT NULL REFERENCES bom_headers(id),
    version_number  INTEGER      NOT NULL,
    version_name    VARCHAR(100),
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'obsolete')),

    output_quantity NUMERIC(18,4) NOT NULL DEFAULT 1,
    output_uom_id   BIGINT        NOT NULL REFERENCES uom(id),

    effective_from  DATE          NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,

    notes           TEXT,
    created_by      BIGINT        NOT NULL,
    approved_by     BIGINT,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW(),

    UNIQUE(bom_header_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_versions_one_active
    ON bom_versions(bom_header_id)
    WHERE status = 'active';

-- ============================================================
-- 3. BOM ITEMS (KOMPONEN)
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bom_version_id  BIGINT         NOT NULL REFERENCES bom_versions(id) ON DELETE CASCADE,

    parent_item_id  BIGINT         REFERENCES bom_items(id),

    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),

    is_phantom      BOOLEAN        DEFAULT false,

    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),

    scrap_pct       NUMERIC(5,2)   DEFAULT 0 CHECK (scrap_pct >= 0),

    quantity_with_scrap NUMERIC(18,4),

    level           INTEGER        NOT NULL DEFAULT 0,

    sequence        INTEGER        DEFAULT 0,

    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 4. BOM OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_operations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bom_version_id      BIGINT         NOT NULL REFERENCES bom_versions(id) ON DELETE CASCADE,
    sequence            INTEGER        NOT NULL,
    name                VARCHAR(255)   NOT NULL,
    work_center         VARCHAR(100),
    duration_minutes    NUMERIC(10,2)  DEFAULT 0,
    cost_per_minute     NUMERIC(18,4)  DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 5. BOM BY-PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_by_products (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bom_version_id  BIGINT         NOT NULL REFERENCES bom_versions(id) ON DELETE CASCADE,
    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),
    type            VARCHAR(20)    NOT NULL DEFAULT 'by_product'
                    CHECK (type IN ('by_product', 'scrap', 'co_product')),
    cost_share_pct  NUMERIC(5,2)   DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bom_headers_variant
    ON bom_headers(variant_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_is_active
    ON bom_headers(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bom_versions_header
    ON bom_versions(bom_header_id);
CREATE INDEX IF NOT EXISTS idx_bom_versions_status
    ON bom_versions(status);
CREATE INDEX IF NOT EXISTS idx_bom_versions_effective
    ON bom_versions(effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_bom_items_version
    ON bom_items(bom_version_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_parent
    ON bom_items(parent_item_id)
    WHERE parent_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bom_items_variant
    ON bom_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_level
    ON bom_items(bom_version_id, level);

CREATE INDEX IF NOT EXISTS idx_bom_operations_version
    ON bom_operations(bom_version_id);
CREATE INDEX IF NOT EXISTS idx_bom_operations_sequence
    ON bom_operations(bom_version_id, sequence);

CREATE INDEX IF NOT EXISTS idx_bom_by_products_version
    ON bom_by_products(bom_version_id);
CREATE INDEX IF NOT EXISTS idx_bom_by_products_variant
    ON bom_by_products(variant_id);
