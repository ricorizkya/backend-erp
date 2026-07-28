-- ============================================================
-- ACCOUNTING SCHEMA
-- Double-Entry Bookkeeping
-- ============================================================

-- ============================================================
-- 1. FISCAL YEAR & ACCOUNTING PERIODS
-- ============================================================

CREATE TABLE IF NOT EXISTS fiscal_years (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(50)  NOT NULL,
    start_date      DATE         NOT NULL,
    end_date        DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed')),
    created_by      BIGINT       NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT chk_fiscal_year_dates CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS accounting_periods (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fiscal_year_id  BIGINT       NOT NULL REFERENCES fiscal_years(id),
    name            VARCHAR(50)  NOT NULL,
    period_number   INTEGER      NOT NULL,
    start_date      DATE         NOT NULL,
    end_date        DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'locked')),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(fiscal_year_id, period_number),
    CONSTRAINT chk_period_dates CHECK (end_date > start_date)
);

-- ============================================================
-- 2. CHART OF ACCOUNTS (CoA)
-- ============================================================

CREATE TABLE IF NOT EXISTS accounts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(20)  UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    parent_id       BIGINT       REFERENCES accounts(id),

    account_type    VARCHAR(30)  NOT NULL
                    CHECK (account_type IN (
                        'asset', 'liability', 'equity', 'revenue', 'expense', 'cost_of_goods'
                    )),

    account_group   VARCHAR(50)
                    CHECK (account_group IN (
                        'current_asset', 'fixed_asset', 'other_asset',
                        'current_liability', 'long_term_liability',
                        'equity',
                        'operating_revenue', 'other_revenue',
                        'operating_expense', 'other_expense',
                        'cost_of_production', 'cost_of_goods_sold'
                    )),

    is_header       BOOLEAN      DEFAULT false,

    system_account  VARCHAR(50)  UNIQUE,

    level           INTEGER      NOT NULL DEFAULT 1,
    is_active       BOOLEAN      DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- 3. JOURNAL ENTRIES
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)  UNIQUE NOT NULL,
    period_id           BIGINT       NOT NULL REFERENCES accounting_periods(id),
    entry_date          DATE         NOT NULL,

    entry_type          VARCHAR(30)  NOT NULL
                        CHECK (entry_type IN (
                            'general', 'purchase', 'sales', 'payment', 'inventory',
                            'production', 'cost_of_goods', 'adjustment', 'closing'
                        )),

    folio               VARCHAR(100),

    reference_type      VARCHAR(50),
    reference_id        BIGINT,

    description         TEXT         NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'posted', 'reversed')),

    reversed_by         BIGINT       REFERENCES journal_entries(id),
    reversal_of         BIGINT       REFERENCES journal_entries(id),

    total_debit         NUMERIC(18,4) NOT NULL DEFAULT 0,
    total_credit        NUMERIC(18,4) NOT NULL DEFAULT 0,

    created_by          BIGINT       NOT NULL,
    posted_by           BIGINT,
    posted_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW(),

    CONSTRAINT chk_journal_balanced CHECK (
        status != 'posted' OR total_debit = total_credit
    )
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    journal_entry_id    BIGINT         NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id          BIGINT         NOT NULL REFERENCES accounts(id),
    line_number         INTEGER        NOT NULL,

    folio               VARCHAR(50),

    debit               NUMERIC(18,4)  NOT NULL DEFAULT 0,
    credit              NUMERIC(18,4)  NOT NULL DEFAULT 0,
    description         TEXT,

    cost_center         VARCHAR(100),

    created_at          TIMESTAMPTZ    DEFAULT NOW(),

    CONSTRAINT chk_line_debit_credit CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    )
);

-- ============================================================
-- 4. GENERAL LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS general_ledger (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id          BIGINT         NOT NULL REFERENCES accounts(id),
    period_id           BIGINT         NOT NULL REFERENCES accounting_periods(id),
    journal_entry_id    BIGINT         NOT NULL REFERENCES journal_entries(id),
    journal_line_id     BIGINT         NOT NULL REFERENCES journal_entry_lines(id),
    entry_date          DATE           NOT NULL,

    folio               VARCHAR(50)    NOT NULL,

    debit               NUMERIC(18,4)  NOT NULL DEFAULT 0,
    credit              NUMERIC(18,4)  NOT NULL DEFAULT 0,

    balance             NUMERIC(18,4)  NOT NULL DEFAULT 0,

    description         TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 5. ACCOUNT BALANCES
-- ============================================================

CREATE TABLE IF NOT EXISTS account_balances (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id          BIGINT         NOT NULL REFERENCES accounts(id),
    period_id           BIGINT         NOT NULL REFERENCES accounting_periods(id),
    opening_balance     NUMERIC(18,4)  NOT NULL DEFAULT 0,
    total_debit         NUMERIC(18,4)  NOT NULL DEFAULT 0,
    total_credit        NUMERIC(18,4)  NOT NULL DEFAULT 0,
    closing_balance     NUMERIC(18,4)  NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(account_id, period_id)
);

-- ============================================================
-- 6. ACCOUNTS PAYABLE (A/P)
-- ============================================================

CREATE TABLE IF NOT EXISTS ap_transactions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_invoice_id   BIGINT         NOT NULL REFERENCES vendor_invoices(id),
    supplier_id         BIGINT         NOT NULL REFERENCES suppliers(id),
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    transaction_date    DATE           NOT NULL,
    due_date            DATE           NOT NULL,
    amount              NUMERIC(18,4)  NOT NULL,
    paid_amount         NUMERIC(18,4)  NOT NULL DEFAULT 0,
    outstanding_amount  NUMERIC(18,4)
                        GENERATED ALWAYS AS (amount - paid_amount) STORED,
    status              VARCHAR(20)    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(vendor_invoice_id)
);

CREATE TABLE IF NOT EXISTS ap_payments (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number              VARCHAR(50)    UNIQUE NOT NULL,
    supplier_id         BIGINT         NOT NULL REFERENCES suppliers(id),
    payment_date        DATE           NOT NULL,
    payment_method      VARCHAR(50)    NOT NULL
                        CHECK (payment_method IN ('cash', 'transfer', 'cheque', 'giro', 'other')),
    bank_account_id     BIGINT,
    reference_no        VARCHAR(100),
    amount              NUMERIC(18,4)  NOT NULL CHECK (amount > 0),
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    notes               TEXT,
    created_by          BIGINT         NOT NULL,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ap_payment_allocations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ap_payment_id       BIGINT         NOT NULL REFERENCES ap_payments(id) ON DELETE CASCADE,
    ap_transaction_id   BIGINT         NOT NULL REFERENCES ap_transactions(id),
    amount              NUMERIC(18,4)  NOT NULL CHECK (amount > 0),
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(ap_payment_id, ap_transaction_id)
);

-- ============================================================
-- 7. ACCOUNTS RECEIVABLE (A/R)
-- ============================================================

CREATE TABLE IF NOT EXISTS ar_transactions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_invoice_id BIGINT         NOT NULL REFERENCES customer_invoices(id),
    customer_id         BIGINT         NOT NULL REFERENCES customers(id),
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    transaction_date    DATE           NOT NULL,
    due_date            DATE           NOT NULL,
    amount              NUMERIC(18,4)  NOT NULL,
    received_amount     NUMERIC(18,4)  NOT NULL DEFAULT 0,
    outstanding_amount  NUMERIC(18,4)
                        GENERATED ALWAYS AS (amount - received_amount) STORED,
    status              VARCHAR(20)    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(customer_invoice_id)
);

CREATE TABLE IF NOT EXISTS ar_receipt_allocations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_receipt_id  BIGINT         NOT NULL REFERENCES payment_receipts(id),
    ar_transaction_id   BIGINT         NOT NULL REFERENCES ar_transactions(id),
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    amount              NUMERIC(18,4)  NOT NULL CHECK (amount > 0),
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(payment_receipt_id, ar_transaction_id)
);

-- ============================================================
-- 8. CASH & BANK
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      BIGINT       NOT NULL REFERENCES accounts(id),
    name            VARCHAR(255) NOT NULL,
    bank_name       VARCHAR(100),
    account_number  VARCHAR(50)  UNIQUE,
    branch_name     VARCHAR(100),
    currency        VARCHAR(10)  NOT NULL DEFAULT 'IDR',
    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE ap_payments
    ADD CONSTRAINT fk_ap_payments_bank_account
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bank_account_id     BIGINT         NOT NULL REFERENCES bank_accounts(id),
    transaction_date    DATE           NOT NULL,
    transaction_type    VARCHAR(20)    NOT NULL
                        CHECK (transaction_type IN ('debit', 'credit')),
    amount              NUMERIC(18,4)  NOT NULL CHECK (amount > 0),
    reference_no        VARCHAR(100),
    description         TEXT,
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),

    is_reconciled       BOOLEAN        DEFAULT false,
    reconciled_at       TIMESTAMPTZ,
    reconciled_by       BIGINT,

    created_by          BIGINT         NOT NULL,
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bank_account_id     BIGINT         NOT NULL REFERENCES bank_accounts(id),
    period_id           BIGINT         NOT NULL REFERENCES accounting_periods(id),
    reconciliation_date DATE           NOT NULL,
    statement_balance   NUMERIC(18,4)  NOT NULL,
    book_balance        NUMERIC(18,4)  NOT NULL,
    difference          NUMERIC(18,4)
                        GENERATED ALWAYS AS (statement_balance - book_balance) STORED,
    status              VARCHAR(20)    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'completed')),
    notes               TEXT,
    created_by          BIGINT         NOT NULL,
    completed_by        BIGINT,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(bank_account_id, period_id)
);

-- ============================================================
-- 9. TAX
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_codes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(20)  UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    tax_type        VARCHAR(20)  NOT NULL
                    CHECK (tax_type IN ('ppn', 'pph')),
    rate            NUMERIC(5,2) NOT NULL,
    account_id      BIGINT       NOT NULL REFERENCES accounts(id),
    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_lines (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tax_code_id         BIGINT         NOT NULL REFERENCES tax_codes(id),
    reference_type      VARCHAR(50)    NOT NULL,
    reference_id        BIGINT         NOT NULL,
    taxable_amount      NUMERIC(18,4)  NOT NULL,
    tax_amount          NUMERIC(18,4)  NOT NULL,
    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- 10. COST ACCOUNTING / HPP
-- ============================================================

CREATE TABLE IF NOT EXISTS overhead_rates (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_id       BIGINT         NOT NULL REFERENCES accounting_periods(id),
    name            VARCHAR(100)   NOT NULL,
    rate_type       VARCHAR(20)    NOT NULL
                    CHECK (rate_type IN ('per_unit', 'per_labor_hour', 'per_machine_hour', 'percentage')),
    rate            NUMERIC(18,4)  NOT NULL,
    account_id      BIGINT         NOT NULL REFERENCES accounts(id),
    created_by      BIGINT         NOT NULL,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(period_id, name)
);

CREATE TABLE IF NOT EXISTS production_cost_sheets (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    work_order_id       BIGINT         NOT NULL REFERENCES work_orders(id),
    period_id           BIGINT         NOT NULL REFERENCES accounting_periods(id),
    calculation_date    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    raw_material_cost   NUMERIC(18,4)  NOT NULL DEFAULT 0,
    labor_cost          NUMERIC(18,4)  NOT NULL DEFAULT 0,
    overhead_cost       NUMERIC(18,4)  NOT NULL DEFAULT 0,
    by_product_offset   NUMERIC(18,4)  NOT NULL DEFAULT 0,

    total_cost          NUMERIC(18,4)  NOT NULL DEFAULT 0,
    quantity_produced   NUMERIC(18,4)  NOT NULL,
    uom_id              BIGINT         NOT NULL REFERENCES uom(id),
    cost_per_unit       NUMERIC(18,4)  NOT NULL DEFAULT 0,

    status              VARCHAR(20)    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'posted', 'revised')),

    journal_entry_id    BIGINT         REFERENCES journal_entries(id),
    calculated_by       BIGINT         NOT NULL,
    posted_by           BIGINT,
    posted_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(work_order_id)
);

CREATE TABLE IF NOT EXISTS production_cost_details (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cost_sheet_id       BIGINT         NOT NULL REFERENCES production_cost_sheets(id) ON DELETE CASCADE,
    cost_type           VARCHAR(20)    NOT NULL
                        CHECK (cost_type IN ('raw_material', 'labor', 'overhead', 'by_product')),
    reference_id        BIGINT,
    description         TEXT           NOT NULL,
    quantity            NUMERIC(18,4),
    unit_cost           NUMERIC(18,4),
    total_cost          NUMERIC(18,4)  NOT NULL,
    account_id          BIGINT         REFERENCES accounts(id),
    created_at          TIMESTAMPTZ    DEFAULT NOW()
);

-- ============================================================
-- SEED DATA: Chart of Accounts dasar
-- ============================================================

INSERT INTO accounts (code, name, account_type, account_group, is_header, level) VALUES
-- ============ ASET (1) ============
('1',       'ASET',                         'asset',        'current_asset',        true,  1),
('1-1',     'Aset Lancar',                  'asset',        'current_asset',        true,  2),
('1-1-001', 'Kas',                          'asset',        'current_asset',        false, 3),
('1-1-002', 'Bank',                         'asset',        'current_asset',        false, 3),
('1-1-003', 'Piutang Usaha',               'asset',        'current_asset',        false, 3),
('1-1-004', 'Piutang Lain-lain',           'asset',        'current_asset',        false, 3),
('1-1-005', 'Persediaan Bahan Baku',       'asset',        'current_asset',        false, 3),
('1-1-006', 'Persediaan Barang Dalam Proses', 'asset',     'current_asset',        false, 3),
('1-1-007', 'Persediaan Barang Jadi',      'asset',        'current_asset',        false, 3),
('1-1-008', 'PPN Masukan',                 'asset',        'current_asset',        false, 3),
('1-1-009', 'Uang Muka Pembelian',         'asset',        'current_asset',        false, 3),
('1-2',     'Aset Tetap',                  'asset',        'fixed_asset',          true,  2),
('1-2-001', 'Tanah',                       'asset',        'fixed_asset',          false, 3),
('1-2-002', 'Bangunan',                    'asset',        'fixed_asset',          false, 3),
('1-2-003', 'Mesin dan Peralatan',         'asset',        'fixed_asset',          false, 3),
('1-2-004', 'Akumulasi Penyusutan Mesin',  'asset',        'fixed_asset',          false, 3),
('1-2-005', 'Kendaraan',                   'asset',        'fixed_asset',          false, 3),
('1-2-006', 'Akumulasi Penyusutan Kendaraan', 'asset',     'fixed_asset',          false, 3),

-- ============ KEWAJIBAN (2) ============
('2',       'KEWAJIBAN',                   'liability',    'current_liability',     true,  1),
('2-1',     'Kewajiban Lancar',            'liability',    'current_liability',     true,  2),
('2-1-001', 'Hutang Usaha',               'liability',    'current_liability',     false, 3),
('2-1-002', 'Hutang Lain-lain',           'liability',    'current_liability',     false, 3),
('2-1-003', 'PPN Keluaran',               'liability',    'current_liability',     false, 3),
('2-1-004', 'Hutang PPh 23',              'liability',    'current_liability',     false, 3),
('2-1-005', 'Uang Muka Penjualan',        'liability',    'current_liability',     false, 3),
('2-1-006', 'Beban Akrual',               'liability',    'current_liability',     false, 3),
('2-2',     'Kewajiban Jangka Panjang',   'liability',    'long_term_liability',   true,  2),
('2-2-001', 'Hutang Bank Jangka Panjang', 'liability',    'long_term_liability',   false, 3),

-- ============ EKUITAS (3) ============
('3',       'EKUITAS',                    'equity',       'equity',                true,  1),
('3-1-001', 'Modal Disetor',              'equity',       'equity',                false, 2),
('3-1-002', 'Laba Ditahan',               'equity',       'equity',                false, 2),
('3-1-003', 'Laba Tahun Berjalan',        'equity',       'equity',                false, 2),

-- ============ PENDAPATAN (4) ============
('4',       'PENDAPATAN',                 'revenue',      'operating_revenue',     true,  1),
('4-1-001', 'Penjualan',                  'revenue',      'operating_revenue',     false, 2),
('4-1-002', 'Retur Penjualan',            'revenue',      'operating_revenue',     false, 2),
('4-1-003', 'Diskon Penjualan',           'revenue',      'operating_revenue',     false, 2),
('4-2-001', 'Pendapatan Lain-lain',       'revenue',      'other_revenue',         false, 2),

-- ============ HARGA POKOK (5) ============
('5',       'HARGA POKOK PENJUALAN',      'cost_of_goods','cost_of_goods_sold',    true,  1),
('5-1-001', 'Harga Pokok Penjualan',      'cost_of_goods','cost_of_goods_sold',    false, 2),
('5-2-001', 'Biaya Bahan Baku',           'cost_of_goods','cost_of_production',    false, 2),
('5-2-002', 'Biaya Tenaga Kerja Langsung','cost_of_goods','cost_of_production',    false, 2),
('5-2-003', 'Biaya Overhead Pabrik',      'cost_of_goods','cost_of_production',    false, 2),

-- ============ BEBAN OPERASIONAL (6) ============
('6',       'BEBAN OPERASIONAL',          'expense',      'operating_expense',     true,  1),
('6-1-001', 'Beban Gaji',                 'expense',      'operating_expense',     false, 2),
('6-1-002', 'Beban Listrik & Air',        'expense',      'operating_expense',     false, 2),
('6-1-003', 'Beban Penyusutan',           'expense',      'operating_expense',     false, 2),
('6-1-004', 'Beban Transportasi',         'expense',      'operating_expense',     false, 2),
('6-1-005', 'Beban Pemasaran',            'expense',      'operating_expense',     false, 2),
('6-2-001', 'Beban Bunga',                'expense',      'other_expense',         false, 2),
('6-2-002', 'Beban Lain-lain',            'expense',      'other_expense',         false, 2)

ON CONFLICT (code) DO NOTHING;

-- Set system_account untuk akun yang dipakai auto-posting
UPDATE accounts SET system_account = 'ar'                  WHERE code = '1-1-003';
UPDATE accounts SET system_account = 'inventory_raw'       WHERE code = '1-1-005';
UPDATE accounts SET system_account = 'inventory_wip'       WHERE code = '1-1-006';
UPDATE accounts SET system_account = 'inventory_finished'  WHERE code = '1-1-007';
UPDATE accounts SET system_account = 'ppn_input'           WHERE code = '1-1-008';
UPDATE accounts SET system_account = 'ap'                  WHERE code = '2-1-001';
UPDATE accounts SET system_account = 'ppn_output'          WHERE code = '2-1-003';
UPDATE accounts SET system_account = 'revenue'             WHERE code = '4-1-001';
UPDATE accounts SET system_account = 'cogs'                WHERE code = '5-1-001';
UPDATE accounts SET system_account = 'raw_material_cost'   WHERE code = '5-2-001';
UPDATE accounts SET system_account = 'labor_cost'          WHERE code = '5-2-002';
UPDATE accounts SET system_account = 'overhead_cost'       WHERE code = '5-2-003';

-- ============================================================
-- INDEXES
-- ============================================================

-- Fiscal Year & Periods
CREATE INDEX IF NOT EXISTS idx_fiscal_years_status
    ON fiscal_years(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_fiscal_year
    ON accounting_periods(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
    ON accounting_periods(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates
    ON accounting_periods(start_date, end_date);

-- Chart of Accounts
CREATE INDEX IF NOT EXISTS idx_accounts_parent
    ON accounts(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_type
    ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_group
    ON accounts(account_group);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active
    ON accounts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_accounts_system_account
    ON accounts(system_account) WHERE system_account IS NOT NULL;

-- Journal Entries
CREATE INDEX IF NOT EXISTS idx_je_period
    ON journal_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_je_date
    ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_type
    ON journal_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_je_status
    ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_je_reference
    ON journal_entries(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_je_folio
    ON journal_entries(folio)
    WHERE folio IS NOT NULL;

-- Journal Entry Lines
CREATE INDEX IF NOT EXISTS idx_jel_journal
    ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account
    ON journal_entry_lines(account_id);

-- General Ledger
CREATE INDEX IF NOT EXISTS idx_gl_account
    ON general_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_gl_period
    ON general_ledger(period_id);
CREATE INDEX IF NOT EXISTS idx_gl_date
    ON general_ledger(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_gl_journal
    ON general_ledger(journal_entry_id);

-- Account Balances
CREATE INDEX IF NOT EXISTS idx_ab_account
    ON account_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_ab_period
    ON account_balances(period_id);

-- AP
CREATE INDEX IF NOT EXISTS idx_ap_supplier
    ON ap_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_status
    ON ap_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ap_due_date
    ON ap_transactions(due_date)
    WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_ap_payment_supplier
    ON ap_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_payment_date
    ON ap_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_ap_allocation_payment
    ON ap_payment_allocations(ap_payment_id);
CREATE INDEX IF NOT EXISTS idx_ap_allocation_transaction
    ON ap_payment_allocations(ap_transaction_id);

-- AR
CREATE INDEX IF NOT EXISTS idx_ar_customer
    ON ar_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_status
    ON ar_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ar_due_date
    ON ar_transactions(due_date)
    WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_ar_receipt_payment
    ON ar_receipt_allocations(payment_receipt_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipt_transaction
    ON ar_receipt_allocations(ar_transaction_id);

-- Bank
CREATE INDEX IF NOT EXISTS idx_bank_account_gl
    ON bank_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_account
    ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date
    ON bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled
    ON bank_transactions(is_reconciled)
    WHERE is_reconciled = false;
CREATE INDEX IF NOT EXISTS idx_bank_recon_account
    ON bank_reconciliations(bank_account_id);

-- Tax
CREATE INDEX IF NOT EXISTS idx_tax_lines_reference
    ON tax_lines(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_tax_lines_code
    ON tax_lines(tax_code_id);

-- Cost Accounting
CREATE INDEX IF NOT EXISTS idx_cost_sheet_wo
    ON production_cost_sheets(work_order_id);
CREATE INDEX IF NOT EXISTS idx_cost_sheet_period
    ON production_cost_sheets(period_id);
CREATE INDEX IF NOT EXISTS idx_cost_sheet_status
    ON production_cost_sheets(status);
CREATE INDEX IF NOT EXISTS idx_cost_detail_sheet
    ON production_cost_details(cost_sheet_id);
CREATE INDEX IF NOT EXISTS idx_cost_detail_type
    ON production_cost_details(cost_type);
CREATE INDEX IF NOT EXISTS idx_overhead_rates_period
    ON overhead_rates(period_id);
