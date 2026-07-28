-- ============================================================
-- SALES ORDER SCHEMA
-- Alur: Sales Quotation → Sales Order
--       → Delivery Order → Customer Invoice → Payment Receipt
-- ============================================================

-- ============================================================
-- 1. SALES QUOTATION
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_quotations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(50)  UNIQUE NOT NULL,
    customer_id     BIGINT       NOT NULL REFERENCES customers(id),
    quotation_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
    valid_until     DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                        'draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'
                    )),

    subtotal        NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,

    payment_term_days   INTEGER   DEFAULT 30,
    delivery_address    TEXT,
    notes               TEXT,
    terms_conditions    TEXT,

    created_by      BIGINT       NOT NULL,
    sent_by         BIGINT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_quotation_items (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quotation_id    BIGINT         NOT NULL REFERENCES sales_quotations(id) ON DELETE CASCADE,
    variant_id      BIGINT         NOT NULL REFERENCES product_variants(id),
    quantity        NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id          BIGINT         NOT NULL REFERENCES uom(id),
    unit_price      NUMERIC(18,4)  NOT NULL DEFAULT 0,
    discount_pct    NUMERIC(5,2)   DEFAULT 0,
    tax_pct         NUMERIC(5,2)   DEFAULT 0,
    subtotal        NUMERIC(18,4)  NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 2. SALES ORDER (SO)
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_orders (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    customer_id         BIGINT       NOT NULL REFERENCES customers(id),

    quotation_id        BIGINT       REFERENCES sales_quotations(id),

    order_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
    requested_date      DATE,
    warehouse_id        BIGINT       NOT NULL REFERENCES warehouses(id),

    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft', 'confirmed', 'partial', 'delivered', 'invoiced', 'cancelled'
                        )),

    subtotal            NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(18,4) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,

    payment_term_days   INTEGER       DEFAULT 30,
    delivery_address    TEXT,
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

CREATE TABLE IF NOT EXISTS sales_order_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    so_id               BIGINT         NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),

    quotation_item_id   BIGINT         REFERENCES sales_quotation_items(id),

    quantity            NUMERIC(18,4)  NOT NULL CHECK (quantity > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    unit_price          NUMERIC(18,4)  NOT NULL DEFAULT 0,
    discount_pct        NUMERIC(5,2)   DEFAULT 0,
    tax_pct             NUMERIC(5,2)   DEFAULT 0,
    subtotal            NUMERIC(18,4)  NOT NULL DEFAULT 0,

    quantity_delivered  NUMERIC(18,4)  NOT NULL DEFAULT 0,
    quantity_pending    NUMERIC(18,4)
                        GENERATED ALWAYS AS (quantity - quantity_delivered) STORED,

    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 3. DELIVERY ORDER (DO)
-- ============================================================

CREATE TABLE IF NOT EXISTS delivery_orders (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    so_id               BIGINT       NOT NULL REFERENCES sales_orders(id),
    warehouse_id        BIGINT       NOT NULL REFERENCES warehouses(id),
    delivery_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
    receiver_name       VARCHAR(255),
    delivery_address    TEXT,
    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'confirmed', 'cancelled')),

    inventory_movement_id BIGINT     REFERENCES inventory_movements(id),

    notes               TEXT,
    created_by          BIGINT       NOT NULL,
    confirmed_by        BIGINT,
    confirmed_at        TIMESTAMPTZ,
    cancelled_by        BIGINT,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_order_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    do_id               BIGINT         NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    so_item_id          BIGINT         NOT NULL REFERENCES sales_order_items(id),
    variant_id          BIGINT         NOT NULL REFERENCES product_variants(id),
    batch_id            BIGINT         REFERENCES batches(id),
    quantity_delivered  NUMERIC(18,4)  NOT NULL CHECK (quantity_delivered > 0),
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    location_id         BIGINT         REFERENCES warehouse_locations(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 4. CUSTOMER INVOICE
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_invoices (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    customer_id         BIGINT       NOT NULL REFERENCES customers(id),
    so_id               BIGINT       NOT NULL REFERENCES sales_orders(id),
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

CREATE TABLE IF NOT EXISTS customer_invoice_deliveries (
    invoice_id  BIGINT NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
    do_id       BIGINT NOT NULL REFERENCES delivery_orders(id),
    PRIMARY KEY (invoice_id, do_id)
);

-- ============================================================
-- 5. PAYMENT RECEIPT
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_receipts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number          VARCHAR(50)  UNIQUE NOT NULL,
    customer_id     BIGINT       NOT NULL REFERENCES customers(id),
    payment_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    payment_method  VARCHAR(50)  NOT NULL
                    CHECK (payment_method IN (
                        'cash', 'transfer', 'cheque', 'giro', 'other'
                    )),
    reference_no    VARCHAR(100),
    amount          NUMERIC(18,4)   NOT NULL CHECK (amount > 0),
    notes           TEXT,
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_receipt_allocations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id      BIGINT         NOT NULL REFERENCES payment_receipts(id) ON DELETE CASCADE,
    invoice_id      BIGINT         NOT NULL REFERENCES customer_invoices(id),
    amount          NUMERIC(18,4)  NOT NULL CHECK (amount > 0),
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(payment_id, invoice_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Sales Quotation
CREATE INDEX IF NOT EXISTS idx_sq_customer
    ON sales_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_sq_status
    ON sales_quotations(status);
CREATE INDEX IF NOT EXISTS idx_sq_date
    ON sales_quotations(quotation_date DESC);
CREATE INDEX IF NOT EXISTS idx_sq_valid_until
    ON sales_quotations(valid_until)
    WHERE status IN ('draft', 'sent');
CREATE INDEX IF NOT EXISTS idx_sq_items_quotation
    ON sales_quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_sq_items_variant
    ON sales_quotation_items(variant_id);

-- Sales Order
CREATE INDEX IF NOT EXISTS idx_so_customer
    ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_quotation
    ON sales_orders(quotation_id)
    WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_status
    ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_date
    ON sales_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_so_warehouse
    ON sales_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_so_items_so
    ON sales_order_items(so_id);
CREATE INDEX IF NOT EXISTS idx_so_items_variant
    ON sales_order_items(variant_id);

-- Delivery Order
CREATE INDEX IF NOT EXISTS idx_do_so
    ON delivery_orders(so_id);
CREATE INDEX IF NOT EXISTS idx_do_status
    ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_do_date
    ON delivery_orders(delivery_date DESC);
CREATE INDEX IF NOT EXISTS idx_do_warehouse
    ON delivery_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_do_items_do
    ON delivery_order_items(do_id);
CREATE INDEX IF NOT EXISTS idx_do_items_so_item
    ON delivery_order_items(so_item_id);
CREATE INDEX IF NOT EXISTS idx_do_items_variant
    ON delivery_order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_do_items_batch
    ON delivery_order_items(batch_id)
    WHERE batch_id IS NOT NULL;

-- Customer Invoice
CREATE INDEX IF NOT EXISTS idx_ci_customer
    ON customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_ci_so
    ON customer_invoices(so_id);
CREATE INDEX IF NOT EXISTS idx_ci_status
    ON customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ci_due_date
    ON customer_invoices(due_date)
    WHERE status IN ('unpaid', 'partial');

-- Payment Receipt
CREATE INDEX IF NOT EXISTS idx_payment_receipt_customer
    ON payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_date
    ON payment_receipts(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_alloc_payment
    ON payment_receipt_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_alloc_invoice
    ON payment_receipt_allocations(invoice_id);
