-- ============================================================
-- QUALITY CONTROL SCHEMA
-- Titik inspeksi: Incoming QC (GR) + Final QC (Production)
-- ============================================================

-- ============================================================
-- 1. QC PARAMETERS
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_parameters (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(50)  UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    value_type      VARCHAR(20)  NOT NULL DEFAULT 'pass_fail'
                    CHECK (value_type IN ('pass_fail', 'numeric', 'text')),

    min_value       NUMERIC(18,4),
    max_value       NUMERIC(18,4),
    unit            VARCHAR(50),

    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- 2. QC CHECKLISTS (TEMPLATE)
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_checklists (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    inspection_type VARCHAR(20)  NOT NULL
                    CHECK (inspection_type IN ('incoming', 'final')),

    product_category_id BIGINT   REFERENCES product_categories(id),

    is_active       BOOLEAN      DEFAULT true,
    notes           TEXT,
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_checklist_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    checklist_id    BIGINT       NOT NULL REFERENCES qc_checklists(id) ON DELETE CASCADE,
    parameter_id    BIGINT       NOT NULL REFERENCES qc_parameters(id),
    sequence        INTEGER      NOT NULL DEFAULT 0,
    is_required     BOOLEAN      DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(checklist_id, parameter_id)
);

-- ============================================================
-- 3. QC INSPECTIONS (HEADER)
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_inspections (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    checklist_id        BIGINT       NOT NULL REFERENCES qc_checklists(id),
    inspection_type     VARCHAR(20)  NOT NULL
                        CHECK (inspection_type IN ('incoming', 'final')),

    goods_receipt_id        BIGINT   REFERENCES goods_receipts(id),
    production_result_id    BIGINT   REFERENCES production_results(id),

    variant_id          BIGINT       NOT NULL REFERENCES product_variants(id),
    batch_id            BIGINT       REFERENCES batches(id),

    quantity_to_inspect NUMERIC(18,4) NOT NULL CHECK (quantity_to_inspect > 0),
    quantity_inspected  NUMERIC(18,4) DEFAULT 0,
    uom_id              BIGINT        NOT NULL REFERENCES uom(id),

    inspection_date     DATE          NOT NULL DEFAULT CURRENT_DATE,

    result              VARCHAR(20)
                        CHECK (result IN ('passed', 'passed_with_note', 'failed')),

    disposition         VARCHAR(20)
                        CHECK (disposition IN (
                            'accepted', 'accepted_with_debit', 'rework', 'rejected', 'pending'
                        )),

    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'completed', 'cancelled')),

    notes               TEXT,
    created_by          BIGINT       NOT NULL,
    inspected_by        BIGINT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW(),

    CONSTRAINT chk_inspection_source CHECK (
        (inspection_type = 'incoming' AND goods_receipt_id IS NOT NULL)
        OR
        (inspection_type = 'final' AND production_result_id IS NOT NULL)
    )
);

-- ============================================================
-- 4. QC INSPECTION ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_inspection_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inspection_id       BIGINT         NOT NULL REFERENCES qc_inspections(id) ON DELETE CASCADE,
    checklist_item_id   BIGINT         NOT NULL REFERENCES qc_checklist_items(id),
    parameter_id        BIGINT         NOT NULL REFERENCES qc_parameters(id),

    pass_fail_value     BOOLEAN,
    numeric_value       NUMERIC(18,4),
    text_value          TEXT,

    is_within_spec      BOOLEAN,

    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 5. QC DEFECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_defect_types (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50)  UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    severity    VARCHAR(20)  NOT NULL DEFAULT 'minor'
                CHECK (severity IN ('critical', 'major', 'minor')),
    is_active   BOOLEAN      DEFAULT true,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_defects (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inspection_id       BIGINT         NOT NULL REFERENCES qc_inspections(id) ON DELETE CASCADE,
    defect_type_id      BIGINT         NOT NULL REFERENCES qc_defect_types(id),
    quantity_defective  NUMERIC(18,4)  NOT NULL CHECK (quantity_defective > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    description         TEXT,

    disposition         VARCHAR(20)    NOT NULL DEFAULT 'pending'
                        CHECK (disposition IN ('pending', 'rework', 'reject', 'accept_as_is')),

    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_qc_parameters_is_active
    ON qc_parameters(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_qc_checklists_type
    ON qc_checklists(inspection_type);
CREATE INDEX IF NOT EXISTS idx_qc_checklists_category
    ON qc_checklists(product_category_id)
    WHERE product_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_checklist_items_checklist
    ON qc_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_qc_checklist_items_parameter
    ON qc_checklist_items(parameter_id);

CREATE INDEX IF NOT EXISTS idx_qc_inspections_type
    ON qc_inspections(inspection_type);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_status
    ON qc_inspections(status);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_result
    ON qc_inspections(result)
    WHERE result IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_inspections_variant
    ON qc_inspections(variant_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_batch
    ON qc_inspections(batch_id)
    WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_inspections_gr
    ON qc_inspections(goods_receipt_id)
    WHERE goods_receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_inspections_production
    ON qc_inspections(production_result_id)
    WHERE production_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_inspections_date
    ON qc_inspections(inspection_date DESC);

CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_inspection
    ON qc_inspection_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_parameter
    ON qc_inspection_items(parameter_id);

CREATE INDEX IF NOT EXISTS idx_qc_defect_types_severity
    ON qc_defect_types(severity);
CREATE INDEX IF NOT EXISTS idx_qc_defects_inspection
    ON qc_defects(inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_defects_type
    ON qc_defects(defect_type_id);
CREATE INDEX IF NOT EXISTS idx_qc_defects_disposition
    ON qc_defects(disposition);

-- ============================================================
-- SEED DATA: QC Parameters umum untuk tekstil/garmen
-- ============================================================

INSERT INTO qc_parameters (code, name, value_type, unit) VALUES
    ('FABRIC_WIDTH',    'Lebar Kain',       'numeric',   'cm'),
    ('FABRIC_WEIGHT',   'Gramasi Kain',     'numeric',   'gsm'),
    ('COLOR_MATCH',     'Kesesuaian Warna', 'pass_fail', NULL),
    ('SHRINKAGE',       'Penyusutan',       'numeric',   '%'),
    ('SEAM_STRENGTH',   'Kekuatan Jahitan', 'pass_fail', NULL),
    ('MEASUREMENT',     'Ukuran Produk',    'pass_fail', NULL),
    ('SURFACE_DEFECT',  'Cacat Permukaan',  'pass_fail', NULL),
    ('LABEL_CORRECT',   'Label Benar',      'pass_fail', NULL),
    ('PACKING_INTACT',  'Kemasan Utuh',     'pass_fail', NULL),
    ('GENERAL_NOTE',    'Catatan Umum',     'text',      NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO qc_defect_types (code, name, severity) VALUES
    ('HOLE',            'Lubang/Bolong',            'critical'),
    ('TEAR',            'Robek',                    'critical'),
    ('COLOR_UNEVEN',    'Warna Tidak Merata',       'major'),
    ('COLOR_STAIN',     'Noda Warna',               'major'),
    ('SKIP_STITCH',     'Jahitan Loncat',           'major'),
    ('BROKEN_STITCH',   'Jahitan Putus',            'major'),
    ('MEASUREMENT_OFF', 'Ukuran Tidak Sesuai',      'major'),
    ('WRONG_LABEL',     'Label Salah',              'major'),
    ('DIRT_STAIN',      'Noda Kotor',               'minor'),
    ('LOOSE_THREAD',    'Benang Menjuntai',         'minor'),
    ('PACKAGING_DENT',  'Kemasan Penyok',           'minor')
ON CONFLICT (code) DO NOTHING;
