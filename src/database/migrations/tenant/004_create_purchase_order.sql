-- ============================================================
-- PURCHASE ORDER SCHEMA
-- Alur: Purchase Request → RFQ → Purchase Order
--       → Goods Receipt → Vendor Invoice
-- ============================================================

-- ============================================================
-- 1. PURCHASE REQUEST (PR)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_requests (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(50)  UNIQUE NOT NULL,
    request_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    needed_date     DATE,
    warehouse_id    BIGINT       NOT NULL REFERENCES warehouses(id),
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'closed')),
    notes           TEXT,

    -- Audit
    created_by      BIGINT       NOT NULL,
    submitted_by    BIGINT,
    submitted_at    TIMESTAMPTZ,
    approved_by     BIGINT,
    approved_at     TIMESTAMPTZ,
    rejected_by     BIGINT,
    rejected_at     TIMESTAMPTZ,
    rejection_notes TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_request_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pr_id           BIGINT         NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),
    estimated_price NUMERIC(18,4)  DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 2. REQUEST FOR QUOTATION (RFQ)
-- ============================================================

CREATE TABLE IF NOT EXISTS rfqs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(50)  UNIQUE NOT NULL,
    rfq_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
    deadline_date   DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'closed', 'cancelled')),
    notes           TEXT,
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfq_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rfq_id          BIGINT         NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfq_item_pr_items (
    rfq_item_id     BIGINT NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
    pr_item_id      BIGINT NOT NULL REFERENCES purchase_request_items(id),
    PRIMARY KEY (rfq_item_id, pr_item_id)
);

CREATE TABLE IF NOT EXISTS rfq_supplier_quotes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rfq_id          BIGINT       NOT NULL REFERENCES rfqs(id),
    supplier_id     BIGINT       NOT NULL REFERENCES suppliers(id),
    quote_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    valid_until     DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'received', 'selected', 'rejected')),
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(rfq_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS rfq_supplier_quote_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quote_id        BIGINT         NOT NULL REFERENCES rfq_supplier_quotes(id) ON DELETE CASCADE,
    rfq_item_id     BIGINT         NOT NULL REFERENCES rfq_items(id),
    unit_price      NUMERIC(18,4)  NOT NULL DEFAULT 0,
    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),
    lead_time_days  INTEGER        DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(quote_id, rfq_item_id)
);

-- ============================================================
-- 3. PURCHASE ORDER (PO)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    supplier_id         BIGINT       NOT NULL REFERENCES suppliers(id),

    rfq_supplier_quote_id BIGINT     REFERENCES rfq_supplier_quotes(id),

    po_date             DATE         NOT NULL DEFAULT CURRENT_DATE,
    expected_date       DATE,
    warehouse_id        BIGINT       NOT NULL REFERENCES warehouses(id),

    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft', 'confirmed', 'partial', 'received', 'cancelled'
                        )),

    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,

    payment_term_days   INTEGER       DEFAULT 30,
    shipping_address    TEXT,
    notes               TEXT,
    terms_conditions    TEXT,

    created_by          BIGINT       NOT NULL,
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    cancelled_by        BIGINT,
    cancelled_at        TIMESTAMPTZ,
    cancellation_notes  TEXT,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id               BIGINT         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),

    rfq_quote_item_id   BIGINT         REFERENCES rfq_supplier_quote_items(id),

    quantity            NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    unit_price          NUMERIC(18,4)  NOT NULL DEFAULT 0,
    discount_pct        NUMERIC(5,2)   DEFAULT 0,
    tax_pct             NUMERIC(5,2)   DEFAULT 0,
    subtotal            NUMERIC(18,4)  NOT NULL DEFAULT 0,

    quantity_received   NUMERIC(18,4)  NOT NULL DEFAULT 0,
    quantity_pending    NUMERIC(18,4)
                        GENERATED ALWAYS AS (quantity - quantity_received) STORED,

    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 4. GOODS RECEIPT (GR)
-- ============================================================

CREATE TABLE IF NOT EXISTS goods_receipts (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    po_id               BIGINT       NOT NULL REFERENCES purchase_orders(id),
    warehouse_id        BIGINT       NOT NULL REFERENCES warehouses(id),
    receipt_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
    supplier_do_number  VARCHAR(100),
    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'confirmed', 'cancelled')),

    inventory_movement_id BIGINT     REFERENCES inventory_movements(id),

    notes               TEXT,
    created_by          BIGINT       NOT NULL,
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gr_id               BIGINT         NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_item_id          BIGINT         NOT NULL REFERENCES purchase_order_items(id),
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),
    batch_id            BIGINT         REFERENCES batches(id),
    quantity_received   NUMERIC(18,4)  NOT NULL CHECK (quantity_received > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    location_id         BIGINT         REFERENCES warehouse_locations(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 5. VENDOR INVOICE
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_invoices (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    supplier_invoice_no VARCHAR(100) NOT NULL,
    supplier_id         BIGINT       NOT NULL REFERENCES suppliers(id),
    po_id               BIGINT       NOT NULL REFERENCES purchase_orders(id),
    invoice_date        DATE         NOT NULL,
    due_date            DATE         NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')),

    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    paid_amount         NUMERIC(18,4) NOT NULL DEFAULT 0,
    outstanding_amount  NUMERIC(18,4)
                        GENERATED ALWAYS AS (total_amount - paid_amount) STORED,

    notes               TEXT,
    created_by          BIGINT       NOT NULL,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_invoice_receipts (
    invoice_id  BIGINT NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
    gr_id       BIGINT NOT NULL REFERENCES goods_receipts(id),
    PRIMARY KEY (invoice_id, gr_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Purchase Request
CREATE INDEX IF NOT EXISTS idx_pr_status
    ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_warehouse
    ON purchase_requests(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_pr_date
    ON purchase_requests(request_date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_items_pr_id
    ON purchase_request_items(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_variant
    ON purchase_request_items(variant_id);

-- RFQ
CREATE INDEX IF NOT EXISTS idx_rfq_status
    ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfq_date
    ON rfqs(rfq_date DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id
    ON rfq_items(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_items_variant
    ON rfq_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq_id
    ON rfq_supplier_quotes(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_supplier
    ON rfq_supplier_quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfq_quote_items_quote_id
    ON rfq_supplier_quote_items(quote_id);

-- Purchase Order
CREATE INDEX IF NOT EXISTS idx_po_supplier
    ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status
    ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_date
    ON purchase_orders(po_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_warehouse
    ON purchase_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id
    ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_variant
    ON purchase_order_items(variant_id);

-- Goods Receipt
CREATE INDEX IF NOT EXISTS idx_gr_po_id
    ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_gr_status
    ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_gr_date
    ON goods_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr_id
    ON goods_receipt_items(gr_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_po_item
    ON goods_receipt_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_variant
    ON goods_receipt_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_batch
    ON goods_receipt_items(batch_id)
    WHERE batch_id IS NOT NULL;

-- Vendor Invoice
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_supplier
    ON vendor_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_po
    ON vendor_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_status
    ON vendor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_due_date
    ON vendor_invoices(due_date)
    WHERE status IN ('unpaid', 'partial');
