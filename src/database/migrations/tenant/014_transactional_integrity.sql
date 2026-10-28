-- Database-level backstops for idempotent posting and bounded payment totals.

CREATE UNIQUE INDEX uq_inventory_movement_source_document
    ON inventory_movements(reference_type, reference_id)
    WHERE reference_type IS NOT NULL
      AND reference_id IS NOT NULL;

CREATE UNIQUE INDEX uq_journal_entry_business_reference
    ON journal_entries(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

CREATE UNIQUE INDEX uq_general_ledger_journal_line
    ON general_ledger(journal_line_id);

CREATE INDEX idx_mrp_runs_reconciliation_state
    ON mrp_runs(status, created_at, started_at);

CREATE UNIQUE INDEX uq_planned_order_work_order
    ON planned_orders(work_order_id)
    WHERE work_order_id IS NOT NULL;

CREATE UNIQUE INDEX uq_planned_order_purchase_order
    ON planned_orders(purchase_order_id)
    WHERE purchase_order_id IS NOT NULL;

CREATE UNIQUE INDEX uq_work_order_bom_material
    ON work_order_materials(work_order_id, bom_item_id)
    WHERE bom_item_id IS NOT NULL;

CREATE UNIQUE INDEX uq_work_order_bom_operation
    ON work_order_operations(work_order_id, bom_operation_id)
    WHERE bom_operation_id IS NOT NULL;

CREATE UNIQUE INDEX uq_qc_inspection_checklist_item
    ON qc_inspection_items(inspection_id, checklist_item_id);

ALTER TABLE vendor_invoices
    ADD CONSTRAINT ck_vendor_invoice_paid_amount
    CHECK (paid_amount >= 0 AND paid_amount <= total_amount);

ALTER TABLE customer_invoices
    ADD CONSTRAINT ck_customer_invoice_paid_amount
    CHECK (paid_amount >= 0 AND paid_amount <= total_amount);

ALTER TABLE ap_transactions
    ADD CONSTRAINT ck_ap_transaction_paid_amount
    CHECK (paid_amount >= 0 AND paid_amount <= amount);

ALTER TABLE ar_transactions
    ADD CONSTRAINT ck_ar_transaction_received_amount
    CHECK (received_amount >= 0 AND received_amount <= amount);
