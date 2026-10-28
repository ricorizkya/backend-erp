import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { DocumentNumberService } from '../src/common/document-number.service';
import { FiscalPeriodService } from '../src/modules/accounting/services/fiscal-period.service';
import { JournalEntryService } from '../src/modules/accounting/services/journal-entry.service';
import { AccountService } from '../src/modules/accounting/services/account.service';
import { ApService } from '../src/modules/accounting/services/ap.service';
import { ArService } from '../src/modules/accounting/services/ar.service';
import { PurchaseOrderService } from '../src/modules/purchase-order/services/purchase-order.service';
import { GoodsReceiptService } from '../src/modules/purchase-order/services/goods-receipt.service';
import { MrpDemandService } from '../src/modules/production/services/mrp-demand.service';
import { SalesOrderService } from '../src/modules/sales-order/services/sales-order.service';
import { DeliveryOrderService } from '../src/modules/sales-order/services/delivery-order.service';
import {
  CustomerInvoiceService,
  PaymentReceiptService,
} from '../src/modules/sales-order/services/customer-invoice.service';
import { PaymentMethod as SalesPaymentMethod } from '../src/modules/sales-order/dto/sales-order.dto';
import { PaymentMethod as AccountingPaymentMethod } from '../src/modules/accounting/dto/accounting.dto';
import { QcInspectionService } from '../src/modules/quality-control/services/qc-inspection.service';
import {
  InspectionDisposition,
  InspectionResult,
  InspectionType,
} from '../src/modules/quality-control/dto/qc.dto';
import { getTestEnvironment } from './helpers/test-environment';
import {
  createMigratedTenantSchema,
  dropTestTenantSchema,
} from './helpers/migrated-tenant';

const schema = 'tenant_test_business';

describe('real ERP business concurrency and financial integrity', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 12,
  });
  const database = new DatabaseService(pool);
  const documentNumbers = new DocumentNumberService();
  const periods = new FiscalPeriodService();
  const journals = new JournalEntryService(documentNumbers, periods);
  const accounts = new AccountService();
  const purchaseOrders = new PurchaseOrderService(documentNumbers);
  const goodsReceipts = new GoodsReceiptService(
    documentNumbers,
    purchaseOrders,
    journals,
    accounts,
  );
  const salesOrders = new SalesOrderService(
    documentNumbers,
    new MrpDemandService(),
  );
  const deliveryOrders = new DeliveryOrderService(
    documentNumbers,
    salesOrders,
    journals,
    accounts,
  );
  const ar = new ArService();
  const customerInvoices = new CustomerInvoiceService(
    documentNumbers,
    ar,
    journals,
    accounts,
  );
  const receipts = new PaymentReceiptService(
    documentNumbers,
    customerInvoices,
    journals,
    accounts,
  );
  const ap = new ApService(documentNumbers, journals, accounts, periods);
  const qcInspections = new QcInspectionService(documentNumbers);
  let sequence = 0;

  beforeAll(async () => {
    await createMigratedTenantSchema(pool, schema);
    await pool.query(`
      INSERT INTO "${schema}".branches (name) VALUES ('Test Branch');
      INSERT INTO "${schema}".warehouses (branch_id, name, code, type)
        VALUES (1, 'Test Warehouse', 'TEST-WH', 'finished_goods');
      INSERT INTO "${schema}".uom (name, symbol) VALUES ('Piece', 'pcs');
      INSERT INTO "${schema}".suppliers (code, name)
        VALUES ('SUP-TEST', 'Test Supplier');
      INSERT INTO "${schema}".customers (code, name)
        VALUES ('CUS-TEST', 'Test Customer');
      INSERT INTO "${schema}".fiscal_years
        (name, start_date, end_date, status, created_by)
        VALUES ('FY 2026', '2026-01-01', '2026-12-31', 'open', 1);
      INSERT INTO "${schema}".accounting_periods
        (fiscal_year_id, name, period_number, start_date, end_date, status)
        VALUES (1, 'FY 2026', 1, '2026-01-01', '2026-12-31', 'open');
    `);
  });

  afterAll(async () => {
    await dropTestTenantSchema(pool, schema);
    await pool.end();
  });

  async function tenantDb() {
    return database.getTenantDb('test_business');
  }

  function expectOneSuccess(results: PromiseSettledResult<unknown>[]): void {
    const outcomes = results.map((result) =>
      result.status === 'fulfilled'
        ? 'fulfilled'
        : result.reason instanceof Error
          ? `${result.reason.name}: ${result.reason.message}`
          : String(result.reason),
    );
    expect(outcomes).toEqual(expect.arrayContaining(['fulfilled']));
    expect(outcomes.filter((outcome) => outcome === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.filter((outcome) => outcome !== 'fulfilled')).toHaveLength(
      1,
    );
  }

  async function createVariant(costPrice = 90): Promise<number> {
    const key = ++sequence;
    const product = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}".products
        (code, name, base_uom_id, purchase_uom_id, sales_uom_id)
       VALUES ($1, $2, 1, 1, 1) RETURNING id::text`,
      [`P-${key}`, `Product ${key}`],
    );
    const variant = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}".product_variants
        (product_id, sku, name, cost_price, sale_price)
       VALUES ($1, $2, $3, $4, 150) RETURNING id::text`,
      [product.rows[0].id, `SKU-${key}`, `Variant ${key}`, costPrice],
    );
    return Number(variant.rows[0].id);
  }

  async function addStock(variantId: number, quantity: number): Promise<void> {
    await pool.query(
      `WITH movement AS (
         INSERT INTO "${schema}".inventory_movements
           (movement_type_id, reference_type, reference_id, status, created_by,
            confirmed_by, confirmed_at)
         SELECT id, 'test_opening', $1, 'confirmed', 1, 1, NOW()
         FROM "${schema}".inventory_movement_types
         WHERE code = 'PURCHASE_RECEIPT'
         RETURNING id
       )
       INSERT INTO "${schema}".inventory_movement_items
         (movement_id, variant_id, to_warehouse_id, quantity, uom_id, unit_cost)
       SELECT id, $1, 1, $2, 1, 90 FROM movement`,
      [variantId, quantity],
    );
    await pool.query(`REFRESH MATERIALIZED VIEW "${schema}".stock_summary`);
    await pool.query(`REFRESH MATERIALIZED VIEW "${schema}".available_stock`);
  }

  it('confirms one GR exactly once under parallel requests', async () => {
    const variantId = await createVariant();
    const inserted = await pool.query<{ gr_id: string }>(
      `WITH po AS (
         INSERT INTO "${schema}".purchase_orders
           (number, supplier_id, warehouse_id, status, total_amount, created_by)
         VALUES ($1, 1, 1, 'confirmed', 1000, 1) RETURNING id
       ), item AS (
         INSERT INTO "${schema}".purchase_order_items
           (po_id, variant_id, quantity, uom_id, unit_price, subtotal)
         SELECT id, $2, 10, 1, 100, 1000 FROM po RETURNING id, po_id
       ), gr AS (
         INSERT INTO "${schema}".goods_receipts
           (number, po_id, warehouse_id, status, created_by)
         SELECT $3, po_id, 1, 'draft', 1 FROM item RETURNING id
       )
       INSERT INTO "${schema}".goods_receipt_items
         (gr_id, po_item_id, variant_id, quantity_received, uom_id)
       SELECT gr.id, item.id, $2, 10, 1 FROM gr, item
       RETURNING gr_id::text`,
      [`PO-GR-${variantId}`, variantId, `GR-${variantId}`],
    );
    const grId = Number(inserted.rows[0].gr_id);
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      const results = await Promise.allSettled([
        goodsReceipts.confirm(first.db, grId, 1),
        goodsReceipts.confirm(second.db, grId, 1),
      ]);
      expectOneSuccess(results);
      const effects = await pool.query<{ movements: string; journals: string }>(
        `SELECT
           (SELECT count(*) FROM "${schema}".inventory_movements
             WHERE reference_type = 'goods_receipt' AND reference_id = $1)::text AS movements,
           (SELECT count(*) FROM "${schema}".journal_entries
             WHERE reference_type = 'goods_receipt' AND reference_id = $1)::text AS journals`,
        [grId],
      );
      expect(effects.rows[0]).toEqual({ movements: '1', journals: '1' });
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('serializes stock-outs and records COGS using cost_price', async () => {
    const variantId = await createVariant(90);
    await addStock(variantId, 10);
    const rows = await pool.query<{ id: string }>(
      `WITH orders AS (
         INSERT INTO "${schema}".sales_orders
           (number, customer_id, warehouse_id, status, total_amount, created_by)
         VALUES
           ($1, 1, 1, 'confirmed', 1050, 1),
           ($2, 1, 1, 'confirmed', 1050, 1)
         RETURNING id, number
       ), items AS (
         INSERT INTO "${schema}".sales_order_items
           (so_id, variant_id, quantity, uom_id, unit_price, subtotal)
         SELECT id, $3, 7, 1, 150, 1050 FROM orders
         RETURNING id, so_id
       ), deliveries AS (
         INSERT INTO "${schema}".delivery_orders
           (number, so_id, warehouse_id, status, created_by)
         SELECT 'DO-' || so_id, so_id, 1, 'draft', 1 FROM items
         RETURNING id, so_id
       )
       INSERT INTO "${schema}".delivery_order_items
         (do_id, so_item_id, variant_id, quantity_delivered, uom_id)
       SELECT deliveries.id, items.id, $3, 7, 1
       FROM deliveries JOIN items USING (so_id)
       RETURNING do_id::text AS id`,
      [`SO-A-${variantId}`, `SO-B-${variantId}`, variantId],
    );
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      const results = await Promise.allSettled([
        deliveryOrders.confirm(first.db, Number(rows.rows[0].id), 1),
        deliveryOrders.confirm(second.db, Number(rows.rows[1].id), 1),
      ]);
      expectOneSuccess(results);
      const movement = await pool.query<{
        quantity: string;
        unit_cost: string;
      }>(
        `SELECT quantity::text, unit_cost::text
         FROM "${schema}".inventory_movement_items
         WHERE variant_id = $1 AND from_warehouse_id = 1`,
        [variantId],
      );
      expect(movement.rows).toHaveLength(1);
      expect(Number(movement.rows[0].quantity)).toBe(7);
      expect(Number(movement.rows[0].unit_cost)).toBe(90);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('invoices 40/60 deliveries only once and preserves their exact totals', async () => {
    const variantId = await createVariant();
    const rows = await pool.query<{ so_id: string; do_id: string }>(
      `WITH sale AS (
         INSERT INTO "${schema}".sales_orders
           (number, customer_id, warehouse_id, status, subtotal, tax_amount,
            discount_amount, total_amount, created_by)
         VALUES ($1, 1, 1, 'delivered', 13500, 1485, 1500, 14985, 1)
         RETURNING id
       ), item AS (
         INSERT INTO "${schema}".sales_order_items
           (so_id, variant_id, quantity, quantity_delivered, uom_id, unit_price,
            discount_pct, tax_pct, subtotal)
         SELECT id, $2, 100, 100, 1, 150, 10, 11, 14985 FROM sale
         RETURNING id, so_id
       ), deliveries AS (
         INSERT INTO "${schema}".delivery_orders
           (number, so_id, warehouse_id, status, created_by)
         SELECT $3, so_id, 1, 'confirmed', 1 FROM item
         UNION ALL
         SELECT $4, so_id, 1, 'confirmed', 1 FROM item
         RETURNING id, so_id, number
       )
       INSERT INTO "${schema}".delivery_order_items
         (do_id, so_item_id, variant_id, quantity_delivered, uom_id)
       SELECT deliveries.id, item.id, $2,
              CASE WHEN deliveries.number = $3 THEN 40 ELSE 60 END, 1
       FROM deliveries JOIN item USING (so_id)
       RETURNING (SELECT so_id FROM item)::text AS so_id, do_id::text`,
      [
        `SO-PART-${variantId}`,
        variantId,
        `DO-40-${variantId}`,
        `DO-60-${variantId}`,
      ],
    );
    const soId = Number(rows.rows[0].so_id);
    const firstDo = Number(rows.rows[0].do_id);
    const secondDo = Number(rows.rows[1].do_id);
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      const concurrent = await Promise.allSettled([
        customerInvoices.createInvoice(
          first.db,
          {
            soId,
            doIds: [firstDo],
            invoiceDate: '2026-10-26',
            dueDate: '2026-11-25',
          },
          1,
        ),
        customerInvoices.createInvoice(
          second.db,
          {
            soId,
            doIds: [firstDo],
            invoiceDate: '2026-10-26',
            dueDate: '2026-11-25',
          },
          1,
        ),
      ]);
      expectOneSuccess(concurrent);

      const third = await tenantDb();
      try {
        await customerInvoices.createInvoice(
          third.db,
          {
            soId,
            doIds: [secondDo],
            invoiceDate: '2026-10-26',
            dueDate: '2026-11-25',
          },
          1,
        );
      } finally {
        await third.release();
      }

      const totals = await pool.query<{
        count: string;
        total: string;
        status: string;
      }>(
        `SELECT count(ci.id)::text AS count,
                sum(ci.total_amount)::text AS total,
                min(so.status) AS status
         FROM "${schema}".customer_invoices ci
         JOIN "${schema}".sales_orders so ON so.id = ci.so_id
         WHERE ci.so_id = $1 GROUP BY so.id`,
        [soId],
      );
      expect(totals.rows[0]).toEqual({
        count: '2',
        total: '14985.0000',
        status: 'invoiced',
      });
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('prevents parallel AR receipts from overpaying an invoice', async () => {
    const inserted = await pool.query<{ id: string }>(
      `WITH sale AS (
         INSERT INTO "${schema}".sales_orders
           (number, customer_id, warehouse_id, status, total_amount, created_by)
         VALUES ($1, 1, 1, 'invoiced', 100, 1) RETURNING id
       )
       INSERT INTO "${schema}".customer_invoices
         (number, customer_id, so_id, invoice_date, due_date, status,
          total_amount, created_by)
       SELECT $2, 1, id, '2026-10-26', '2026-11-25', 'unpaid', 100, 1 FROM sale
       RETURNING id::text`,
      [`SO-AR-${++sequence}`, `INV-AR-${sequence}`],
    );
    const invoiceId = Number(inserted.rows[0].id);
    await pool.query(
      `INSERT INTO "${schema}".ar_transactions
        (customer_invoice_id, customer_id, transaction_date, due_date, amount)
       VALUES ($1, 1, '2026-10-26', '2026-11-25', 100)`,
      [invoiceId],
    );
    const first = await tenantDb();
    const second = await tenantDb();
    const dto = {
      customerId: 1,
      paymentDate: '2026-10-26',
      paymentMethod: SalesPaymentMethod.TRANSFER,
      allocations: [{ invoiceId, amount: 80 }],
    };
    try {
      await expect(
        first.db
          .selectFrom('customer_invoices')
          .where('id', '=', invoiceId)
          .select(['customer_id', 'status', 'outstanding_amount'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({
        customer_id: '1',
        status: 'unpaid',
        outstanding_amount: '100.0000',
      });
      const results = await Promise.allSettled([
        receipts.create(first.db, dto, 1),
        receipts.create(second.db, dto, 1),
      ]);
      expectOneSuccess(results);
      const invoice = await pool.query<{ paid: string; allocated: string }>(
        `SELECT ci.paid_amount::text AS paid,
                COALESCE(sum(pra.amount), 0)::text AS allocated
         FROM "${schema}".customer_invoices ci
         LEFT JOIN "${schema}".payment_receipt_allocations pra ON pra.invoice_id = ci.id
         WHERE ci.id = $1 GROUP BY ci.id`,
        [invoiceId],
      );
      expect(Number(invoice.rows[0].paid)).toBe(80);
      expect(Number(invoice.rows[0].allocated)).toBe(80);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('prevents parallel AP payments from overpaying a vendor invoice', async () => {
    const inserted = await pool.query<{ id: string }>(
      `WITH purchase AS (
         INSERT INTO "${schema}".purchase_orders
           (number, supplier_id, warehouse_id, status, total_amount, created_by)
         VALUES ($1, 1, 1, 'received', 100, 1) RETURNING id
       ), invoice AS (
         INSERT INTO "${schema}".vendor_invoices
           (number, supplier_invoice_no, supplier_id, po_id, invoice_date,
            due_date, status, total_amount, created_by)
         SELECT $2, $3, 1, id, '2026-10-26', '2026-11-25', 'unpaid', 100, 1
         FROM purchase RETURNING id
       )
       INSERT INTO "${schema}".ap_transactions
         (vendor_invoice_id, supplier_id, transaction_date, due_date, amount)
       SELECT id, 1, '2026-10-26', '2026-11-25', 100 FROM invoice
       RETURNING id::text`,
      [`PO-AP-${++sequence}`, `VI-AP-${sequence}`, `SUP-INV-${sequence}`],
    );
    const transactionId = Number(inserted.rows[0].id);
    const first = await tenantDb();
    const second = await tenantDb();
    const dto = {
      supplierId: 1,
      paymentDate: '2026-10-26',
      paymentMethod: AccountingPaymentMethod.TRANSFER,
      allocations: [{ apTransactionId: transactionId, amount: 80 }],
    };
    try {
      await expect(
        first.db
          .selectFrom('ap_transactions')
          .where('id', '=', transactionId)
          .select(['supplier_id', 'status', 'outstanding_amount'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({
        supplier_id: '1',
        status: 'open',
        outstanding_amount: '100.0000',
      });
      const results = await Promise.allSettled([
        ap.createPayment(first.db, dto, 1),
        ap.createPayment(second.db, dto, 1),
      ]);
      expectOneSuccess(results);
      const transaction = await pool.query<{ paid: string; allocated: string }>(
        `SELECT apt.paid_amount::text AS paid,
                COALESCE(sum(apa.amount), 0)::text AS allocated
         FROM "${schema}".ap_transactions apt
         LEFT JOIN "${schema}".ap_payment_allocations apa
           ON apa.ap_transaction_id = apt.id
         WHERE apt.id = $1 GROUP BY apt.id`,
        [transactionId],
      );
      expect(Number(transaction.rows[0].paid)).toBe(80);
      expect(Number(transaction.rows[0].allocated)).toBe(80);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('completes incoming and final QC once with all required parameters', async () => {
    const variantId = await createVariant();
    const seeded = await pool.query<{
      incoming_checklist_id: string;
      incoming_item_id: string;
      final_checklist_id: string;
      final_item_id: string;
      parameter_id: string;
      gr_id: string;
      production_result_id: string;
    }>(
      `WITH parameter AS (
         INSERT INTO "${schema}".qc_parameters
           (code, name, value_type, min_value, max_value)
         VALUES ($1, 'Test Measurement', 'numeric', 9, 11)
         RETURNING id
       ), incoming_checklist AS (
         INSERT INTO "${schema}".qc_checklists
           (name, inspection_type, created_by)
         VALUES ($2, 'incoming', 1) RETURNING id
       ), incoming_item AS (
         INSERT INTO "${schema}".qc_checklist_items
           (checklist_id, parameter_id, sequence, is_required)
         SELECT incoming_checklist.id, parameter.id, 1, true
         FROM incoming_checklist, parameter RETURNING id
       ), final_checklist AS (
         INSERT INTO "${schema}".qc_checklists
           (name, inspection_type, created_by)
         VALUES ($3, 'final', 1) RETURNING id
       ), final_item AS (
         INSERT INTO "${schema}".qc_checklist_items
           (checklist_id, parameter_id, sequence, is_required)
         SELECT final_checklist.id, parameter.id, 1, true
         FROM final_checklist, parameter RETURNING id
       ), purchase AS (
         INSERT INTO "${schema}".purchase_orders
           (number, supplier_id, warehouse_id, status, total_amount, created_by)
         VALUES ($4, 1, 1, 'received', 100, 1) RETURNING id
       ), receipt AS (
         INSERT INTO "${schema}".goods_receipts
           (number, po_id, warehouse_id, status, created_by)
         SELECT $5, id, 1, 'confirmed', 1 FROM purchase RETURNING id
       ), bom_header AS (
         INSERT INTO "${schema}".bom_headers (variant_id, name, is_active, created_by)
         VALUES ($6, $7, true, 1) RETURNING id
       ), bom_version AS (
         INSERT INTO "${schema}".bom_versions
           (bom_header_id, version_number, output_quantity, output_uom_id,
            effective_from, status, created_by)
         SELECT id, '1', 1, 1, CURRENT_DATE, 'active', 1 FROM bom_header
         RETURNING id
       ), work_order AS (
         INSERT INTO "${schema}".work_orders
           (number, variant_id, bom_version_id, quantity_planned, uom_id,
            output_warehouse_id, planned_start, planned_finish, status, created_by)
         SELECT $8, $6, id, 1, 1, 1, CURRENT_DATE, CURRENT_DATE + 1,
                'completed', 1 FROM bom_version RETURNING id
       ), production_result AS (
         INSERT INTO "${schema}".production_results
           (work_order_id, variant_id, quantity_produced, uom_id,
            warehouse_id, created_by)
         SELECT id, $6, 1, 1, 1, 1 FROM work_order RETURNING id
       )
       SELECT
         (SELECT id FROM incoming_checklist)::text AS incoming_checklist_id,
         (SELECT id FROM incoming_item)::text AS incoming_item_id,
         (SELECT id FROM final_checklist)::text AS final_checklist_id,
         (SELECT id FROM final_item)::text AS final_item_id,
         (SELECT id FROM parameter)::text AS parameter_id,
         (SELECT id FROM receipt)::text AS gr_id,
         (SELECT id FROM production_result)::text AS production_result_id`,
      [
        `QC-PARAM-${++sequence}`,
        `Incoming Checklist ${sequence}`,
        `Final Checklist ${sequence}`,
        `PO-QC-${sequence}`,
        `GR-QC-${sequence}`,
        variantId,
        `BOM ${sequence}`,
        `WO-QC-${sequence}`,
      ],
    );
    const ids = seeded.rows[0];
    const tenant = await tenantDb();
    try {
      const incoming = await qcInspections.create(
        tenant.db,
        {
          checklistId: Number(ids.incoming_checklist_id),
          inspectionType: InspectionType.INCOMING,
          goodsReceiptId: Number(ids.gr_id),
          variantId,
          quantityToInspect: 1,
          uomId: 1,
        },
        1,
      );
      await expect(
        qcInspections.complete(
          tenant.db,
          Number(incoming.id),
          {
            quantityInspected: 1,
            result: InspectionResult.PASSED,
            disposition: InspectionDisposition.ACCEPTED,
            items: [
              {
                checklistItemId: Number(ids.incoming_item_id),
                parameterId: Number(ids.parameter_id),
                numericValue: 10,
              },
            ],
          },
          1,
        ),
      ).resolves.toMatchObject({ status: 'completed', result: 'passed' });

      const finalInspection = await qcInspections.create(
        tenant.db,
        {
          checklistId: Number(ids.final_checklist_id),
          inspectionType: InspectionType.FINAL,
          productionResultId: Number(ids.production_result_id),
          variantId,
          quantityToInspect: 1,
          uomId: 1,
        },
        1,
      );
      const completion = {
        quantityInspected: 1,
        result: InspectionResult.PASSED,
        disposition: InspectionDisposition.ACCEPTED,
        items: [
          {
            checklistItemId: Number(ids.final_item_id),
            parameterId: Number(ids.parameter_id),
            numericValue: 10,
          },
        ],
      };
      const second = await tenantDb();
      try {
        expectOneSuccess(
          await Promise.allSettled([
            qcInspections.complete(
              tenant.db,
              Number(finalInspection.id),
              completion,
              1,
            ),
            qcInspections.complete(
              second.db,
              Number(finalInspection.id),
              completion,
              1,
            ),
          ]),
        );
      } finally {
        await second.release();
      }
    } finally {
      await tenant.release();
    }
  });
});
