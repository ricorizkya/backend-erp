import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateCustomerInvoiceDto,
  CreatePaymentReceiptDto,
  PaginationDto,
} from '../dto/sales-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { ArService } from '../../accounting/services/ar.service';
import { JournalEntryService } from '../../accounting/services/journal-entry.service';
import { AccountService } from '../../accounting/services/account.service';
import { JournalEntryType } from '../../accounting/dto/accounting.dto';

export interface DeliveryInvoiceLine {
  quantity: number;
  unitPrice: number;
  discountPct?: number | null;
  taxPct?: number | null;
}

export function calculateDeliveryInvoiceTotals(
  lines: readonly DeliveryInvoiceLine[],
) {
  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const gross = round4(line.quantity * line.unitPrice);
    const discounted = round4(
      gross * (1 - Number(line.discountPct ?? 0) / 100),
    );
    subtotal = round4(subtotal + discounted);
    taxAmount = round4(
      taxAmount + discounted * (Number(line.taxPct ?? 0) / 100),
    );
  }
  return { subtotal, taxAmount, totalAmount: round4(subtotal + taxAmount) };
}

@Injectable()
export class CustomerInvoiceService {
  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly arService: ArService,
    private readonly journalService: JournalEntryService,
    private readonly accountService: AccountService,
  ) {}

  // ----------------------------------------------------------------
  // LIST INVOICES
  // ----------------------------------------------------------------

  async findAllInvoices(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo, customerId } =
      filter;

    let query = db
      .selectFrom('customer_invoices as ci')
      .innerJoin('customers as c', 'c.id', 'ci.customer_id')
      .innerJoin('sales_orders as so', 'so.id', 'ci.so_id')
      .select([
        'ci.id',
        'ci.number',
        'ci.invoice_date',
        'ci.due_date',
        'ci.status',
        'ci.total_amount',
        'ci.paid_amount',
        'ci.outstanding_amount',
        'ci.notes',
        'ci.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
        'so.number as so_number',
      ]);

    if (status) query = query.where('ci.status', '=', status as any);
    if (customerId) query = query.where('ci.customer_id', '=', customerId);
    if (dateFrom)
      query = query.where('ci.invoice_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('ci.invoice_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('ci.number', 'ilike', `%${search}%`),
          eb('c.name', 'ilike', `%${search}%`),
        ]),
      );
    }

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('ci.invoice_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL INVOICE
  // ----------------------------------------------------------------

  async findOneInvoice(db: Kysely<TenantSchema>, invoiceId: number) {
    const invoice = await db
      .selectFrom('customer_invoices as ci')
      .innerJoin('customers as c', 'c.id', 'ci.customer_id')
      .innerJoin('sales_orders as so', 'so.id', 'ci.so_id')
      .where('ci.id', '=', invoiceId)
      .select([
        'ci.id',
        'ci.number',
        'ci.customer_id',
        'ci.so_id',
        'ci.invoice_date',
        'ci.due_date',
        'ci.status',
        'ci.subtotal',
        'ci.tax_amount',
        'ci.total_amount',
        'ci.paid_amount',
        'ci.outstanding_amount',
        'ci.notes',
        'ci.created_by',
        'ci.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'c.email as customer_email',
        'so.number as so_number',
      ])
      .executeTakeFirst();

    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');

    // DO yang di-cover invoice ini
    const linkedDos = await db
      .selectFrom('customer_invoice_deliveries as cid')
      .innerJoin('delivery_orders as do_', 'do_.id', 'cid.do_id')
      .where('cid.invoice_id', '=', invoiceId)
      .select(['do_.id', 'do_.number', 'do_.delivery_date'])
      .execute();

    // Payment allocations
    const payments = await db
      .selectFrom('payment_receipt_allocations as pra')
      .innerJoin('payment_receipts as pr', 'pr.id', 'pra.payment_id')
      .where('pra.invoice_id', '=', invoiceId)
      .select([
        'pr.id',
        'pr.number',
        'pr.payment_date',
        'pr.payment_method',
        'pra.amount',
      ])
      .execute();

    return { ...invoice, deliveryOrders: linkedDos, payments };
  }

  // ----------------------------------------------------------------
  // CREATE INVOICE
  // ----------------------------------------------------------------

  async createInvoice(
    db: Kysely<TenantSchema>,
    dto: CreateCustomerInvoiceDto,
    createdBy: number,
  ) {
    if (!dto.doIds.length) {
      throw new BadRequestException('Minimal satu Delivery Order diperlukan');
    }

    return db.transaction().execute(async (trx) => {
      const so = await trx
        .selectFrom('sales_orders')
        .where('id', '=', dto.soId)
        .where('status', 'in', ['confirmed', 'partial', 'delivered'])
        .select(['id', 'customer_id'])
        .forUpdate()
        .executeTakeFirst();
      if (!so) {
        throw new NotFoundException(
          'Sales Order tidak ditemukan atau belum ada pengiriman',
        );
      }

      const uniqueDoIds = [...new Set(dto.doIds)].sort((a, b) => a - b);
      const dos = await trx
        .selectFrom('delivery_orders')
        .where('id', 'in', uniqueDoIds)
        .where('so_id', '=', dto.soId)
        .where('status', '=', 'confirmed')
        .select(['id'])
        .orderBy('id')
        .forUpdate()
        .execute();
      if (dos.length !== uniqueDoIds.length) {
        throw new BadRequestException(
          'Satu atau lebih DO tidak valid atau belum dikonfirmasi',
        );
      }

      const alreadyInvoiced = await trx
        .selectFrom('customer_invoice_deliveries as cid')
        .innerJoin('customer_invoices as ci', 'ci.id', 'cid.invoice_id')
        .where('cid.do_id', 'in', uniqueDoIds)
        .where('ci.status', '!=', 'cancelled')
        .select('cid.do_id')
        .executeTakeFirst();
      if (alreadyInvoiced) {
        throw new ConflictException(
          `DO ${alreadyInvoiced.do_id} sudah ada di invoice lain`,
        );
      }

      const items = await trx
        .selectFrom('delivery_order_items as doi')
        .innerJoin('sales_order_items as soi', 'soi.id', 'doi.so_item_id')
        .where('doi.do_id', 'in', uniqueDoIds)
        .select([
          'doi.do_id',
          'doi.quantity_delivered',
          'soi.unit_price',
          'soi.discount_pct',
          'soi.tax_pct',
        ])
        .execute();

      const totals = calculateDeliveryInvoiceTotals(
        items.map((item) => ({
          quantity: Number(item.quantity_delivered),
          unitPrice: Number(item.unit_price),
          discountPct: Number(item.discount_pct ?? 0),
          taxPct: Number(item.tax_pct ?? 0),
        })),
      );
      const { subtotal, taxAmount, totalAmount } = totals;

      const number = await this.docNumber.generate(trx, 'INV');

      const [invoice] = await trx
        .insertInto('customer_invoices')
        .values({
          number,
          customer_id: so.customer_id,
          so_id: dto.soId,
          invoice_date: new Date(dto.invoiceDate),
          due_date: new Date(dto.dueDate),
          status: 'unpaid',
          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          paid_amount: 0,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Link invoice ke DO
      await trx
        .insertInto('customer_invoice_deliveries')
        .values(
          uniqueDoIds.map((doId) => ({
            invoice_id: invoice.id,
            do_id: doId,
          })),
        )
        .execute();

      const soItems = await trx
        .selectFrom('sales_order_items')
        .where('so_id', '=', dto.soId)
        .select(['id', 'quantity_delivered'])
        .execute();
      const invoicedQuantities = await trx
        .selectFrom('delivery_order_items as doi')
        .innerJoin(
          'customer_invoice_deliveries as cid',
          'cid.do_id',
          'doi.do_id',
        )
        .innerJoin('customer_invoices as ci', 'ci.id', 'cid.invoice_id')
        .where('ci.status', '!=', 'cancelled')
        .innerJoin('sales_order_items as soi', 'soi.id', 'doi.so_item_id')
        .where('soi.so_id', '=', dto.soId)
        .select([
          'doi.so_item_id',
          sql<number>`SUM(doi.quantity_delivered)`.as('quantity'),
        ])
        .groupBy('doi.so_item_id')
        .execute();
      const invoicedByItem = new Map(
        invoicedQuantities.map((row) => [row.so_item_id, Number(row.quantity)]),
      );
      const fullyInvoiced = soItems.every(
        (item) =>
          Number(invoicedByItem.get(item.id) ?? 0) >=
          Number(item.quantity_delivered),
      );

      // Update SO status berdasarkan delivered quantity yang sudah diinvoicing
      await trx
        .updateTable('sales_orders')
        .set({
          status: fullyInvoiced ? 'invoiced' : 'partial',
          updated_at: new Date(),
        })
        .where('id', '=', dto.soId)
        .execute();

      // Auto-create AR Transaction
      await this.arService.createTransaction(
        trx,
        invoice.id,
        so.customer_id,
        totalAmount,
        new Date(dto.invoiceDate),
        new Date(dto.dueDate),
      );

      // Auto-post Journal Entry (Piutang Usaha vs Penjualan + PPN Keluaran)
      const arAccount = await this.accountService.getSystemAccount(trx, 'ar');
      const revenueAccount = await this.accountService.getSystemAccount(
        trx,
        'revenue',
      );
      const lines = [
        {
          accountId: arAccount.id,
          lineNumber: 1,
          debit: totalAmount,
          credit: 0,
          description: `Faktur Penjualan ${invoice.number}`,
        },
        {
          accountId: revenueAccount.id,
          lineNumber: 2,
          debit: 0,
          credit: subtotal,
          description: `Penjualan ${invoice.number}`,
        },
      ];

      if (taxAmount > 0) {
        const ppnAccount = await this.accountService.getSystemAccount(
          trx,
          'ppn_output',
        );
        lines.push({
          accountId: ppnAccount.id,
          lineNumber: 3,
          debit: 0,
          credit: taxAmount,
          description: `PPN Keluaran ${invoice.number}`,
        });
      }

      await this.journalService.autoPost(
        trx,
        {
          entryDate: new Date(dto.invoiceDate).toISOString(),
          entryType: JournalEntryType.SALES,
          description: `Faktur Penjualan - ${invoice.number}`,
          folio: invoice.number,
          referenceType: 'customer_invoice',
          referenceId: invoice.id,
          lines,
        },
        createdBy,
      );

      return this.findOneInvoice(trx, invoice.id);
    });
  }

  // ----------------------------------------------------------------
  // OVERDUE INVOICES
  // ----------------------------------------------------------------

  async findOverdue(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('customer_invoices as ci')
      .innerJoin('customers as c', 'c.id', 'ci.customer_id')
      .where('ci.due_date', '<', new Date())
      .where('ci.status', 'in', ['unpaid', 'partial'])
      .select([
        'ci.id',
        'ci.number',
        'ci.invoice_date',
        'ci.due_date',
        'ci.outstanding_amount',
        'c.name as customer_name',
        'c.phone as customer_phone',
      ])
      .orderBy('ci.due_date', 'asc')
      .execute();
  }

  // ----------------------------------------------------------------
  // UPDATE PAID (dipanggil internal dari payment service)
  // ----------------------------------------------------------------

  async updatePaidAmount(
    db: Kysely<TenantSchema>,
    invoiceId: number,
    paidAmount: number,
  ) {
    const invoice = await db
      .selectFrom('customer_invoices')
      .where('id', '=', invoiceId)
      .select(['id', 'total_amount', 'status'])
      .executeTakeFirst();

    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');

    const total = Number(invoice.total_amount);
    const newStatus =
      paidAmount >= total ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    await db
      .updateTable('customer_invoices')
      .set({
        paid_amount: paidAmount,
        status: newStatus,
        updated_at: new Date(),
      })
      .where('id', '=', invoiceId)
      .execute();
  }
}

// ================================================================
// PAYMENT RECEIPT SERVICE
// ================================================================

@Injectable()
export class PaymentReceiptService {
  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly invoiceService: CustomerInvoiceService,
    private readonly journalService: JournalEntryService,
    private readonly accountService: AccountService,
  ) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, dateFrom, dateTo, customerId } = filter;

    let query = db
      .selectFrom('payment_receipts as pr')
      .innerJoin('customers as c', 'c.id', 'pr.customer_id')
      .select([
        'pr.id',
        'pr.number',
        'pr.payment_date',
        'pr.payment_method',
        'pr.amount',
        'pr.reference_no',
        'pr.notes',
        'pr.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
      ]);

    if (customerId) query = query.where('pr.customer_id', '=', customerId);
    if (dateFrom)
      query = query.where('pr.payment_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('pr.payment_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('pr.number', 'ilike', `%${search}%`),
          eb('pr.reference_no', 'ilike', `%${search}%`),
          eb('c.name', 'ilike', `%${search}%`),
        ]),
      );
    }

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('pr.payment_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, paymentId: number) {
    const payment = await db
      .selectFrom('payment_receipts as pr')
      .innerJoin('customers as c', 'c.id', 'pr.customer_id')
      .where('pr.id', '=', paymentId)
      .select([
        'pr.id',
        'pr.number',
        'pr.customer_id',
        'pr.payment_date',
        'pr.payment_method',
        'pr.reference_no',
        'pr.amount',
        'pr.notes',
        'pr.created_by',
        'pr.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
      ])
      .executeTakeFirst();

    if (!payment) throw new NotFoundException('Payment tidak ditemukan');

    const allocations = await db
      .selectFrom('payment_receipt_allocations as pra')
      .innerJoin('customer_invoices as ci', 'ci.id', 'pra.invoice_id')
      .where('pra.payment_id', '=', paymentId)
      .select([
        'pra.id',
        'pra.amount',
        'ci.id as invoice_id',
        'ci.number as invoice_number',
        'ci.invoice_date',
        'ci.total_amount',
        'ci.outstanding_amount',
      ])
      .execute();

    return { ...payment, allocations };
  }

  // ----------------------------------------------------------------
  // CREATE PAYMENT + ALLOCATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreatePaymentReceiptDto,
    createdBy: number,
  ) {
    const customer = await db
      .selectFrom('customers')
      .where('id', '=', dto.customerId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!customer) throw new NotFoundException('Customer tidak ditemukan');

    if (!dto.allocations.length) {
      throw new BadRequestException('Minimal satu alokasi invoice diperlukan');
    }

    const invoiceIds = dto.allocations
      .map((allocation) => allocation.invoiceId)
      .sort((a, b) => a - b);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new BadRequestException(
        'Satu invoice hanya boleh muncul sekali dalam alokasi pembayaran',
      );
    }

    // Validasi total alokasi = amount payment
    const paymentAmount = dto.allocations.reduce((s, a) => s + a.amount, 0);

    // Validasi setiap invoice
    for (const alloc of dto.allocations) {
      const invoice = await db
        .selectFrom('customer_invoices')
        .where('id', '=', alloc.invoiceId)
        .where('customer_id', '=', dto.customerId)
        .where('status', 'in', ['unpaid', 'partial'])
        .select(['id', 'outstanding_amount'])
        .executeTakeFirst();

      if (!invoice) {
        throw new NotFoundException(
          `Invoice ${alloc.invoiceId} tidak ditemukan atau sudah lunas`,
        );
      }

      const outstanding = Number(invoice.outstanding_amount ?? 0);
      if (alloc.amount > outstanding) {
        throw new BadRequestException(
          `Alokasi untuk invoice ${alloc.invoiceId} melebihi outstanding. ` +
            `Outstanding: ${outstanding}, dialokasikan: ${alloc.amount}`,
        );
      }
    }

    return db.transaction().execute(async (trx) => {
      const lockedInvoices = await trx
        .selectFrom('customer_invoices')
        .where('id', 'in', invoiceIds)
        .where('customer_id', '=', dto.customerId)
        .where('status', 'in', ['unpaid', 'partial'])
        .select(['id', 'outstanding_amount'])
        .orderBy('id')
        .forUpdate()
        .execute();
      const invoiceById = new Map(
        lockedInvoices.map((invoice) => [Number(invoice.id), invoice]),
      );

      for (const allocation of dto.allocations) {
        const invoice = invoiceById.get(allocation.invoiceId);
        if (!invoice) {
          throw new NotFoundException(
            `Invoice ${allocation.invoiceId} tidak ditemukan atau sudah lunas`,
          );
        }
        const outstanding = Number(invoice.outstanding_amount ?? 0);
        if (allocation.amount > outstanding + 0.01) {
          throw new BadRequestException(
            `Alokasi untuk invoice ${allocation.invoiceId} melebihi outstanding. ` +
              `Outstanding: ${outstanding}, dialokasikan: ${allocation.amount}`,
          );
        }
      }

      const number = await this.docNumber.generate(trx, 'PAY');

      const [payment] = await trx
        .insertInto('payment_receipts')
        .values({
          number,
          customer_id: dto.customerId,
          payment_date: dto.paymentDate
            ? new Date(dto.paymentDate)
            : new Date(),
          payment_method: dto.paymentMethod,
          reference_no: dto.referenceNo ?? null,
          amount: paymentAmount,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Insert alokasi - using payment_id
      await trx
        .insertInto('payment_receipt_allocations')
        .values(
          dto.allocations.map((alloc) => ({
            payment_id: payment.id,
            invoice_id: alloc.invoiceId,
            amount: alloc.amount,
          })),
        )
        .execute();

      // Update paid_amount per invoice
      for (const alloc of dto.allocations) {
        // Hitung total paid setelah alokasi baru
        const totalPaid = await trx
          .selectFrom('payment_receipt_allocations')
          .where('invoice_id', '=', alloc.invoiceId)
          .select(trx.fn.sum<number>('amount').as('total'))
          .executeTakeFirst();

        await this.invoiceService.updatePaidAmount(
          trx,
          alloc.invoiceId,
          Number(totalPaid?.total ?? 0),
        );
      }

      // Auto-post Journal Entry (Kas/Bank vs Piutang Usaha)
      const cashAccount = await this.accountService.getSystemAccount(
        trx,
        'cash',
      );
      const arAccount = await this.accountService.getSystemAccount(trx, 'ar');

      await this.journalService.autoPost(
        trx,
        {
          entryDate: (dto.paymentDate
            ? new Date(dto.paymentDate)
            : new Date()
          ).toISOString(),
          entryType: JournalEntryType.PAYMENT,
          description: `Penerimaan Pembayaran - ${payment.number}`,
          folio: payment.number,
          referenceType: 'payment_receipt',
          referenceId: payment.id,
          lines: [
            {
              accountId: cashAccount.id,
              lineNumber: 1,
              debit: paymentAmount,
              credit: 0,
              description: `Penerimaan Kas/Bank ${payment.number}`,
            },
            {
              accountId: arAccount.id,
              lineNumber: 2,
              debit: 0,
              credit: paymentAmount,
              description: `Pelunasan Piutang ${payment.number}`,
            },
          ],
        },
        createdBy,
      );

      return this.findOne(trx, payment.id);
    });
  }
}
