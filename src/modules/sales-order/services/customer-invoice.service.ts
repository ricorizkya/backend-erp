import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateCustomerInvoiceDto,
  CreatePaymentReceiptDto,
  PaginationDto,
} from '../dto/sales-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class CustomerInvoiceService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST INVOICES
  // ----------------------------------------------------------------

  async findAllInvoices(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo, customerId } = filter;

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
    if (dateFrom) query = query.where('ci.invoice_date', '>=', new Date(dateFrom));
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

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
    const so = await db
      .selectFrom('sales_orders')
      .where('id', '=', dto.soId)
      .where('status', 'in', ['confirmed', 'partial', 'delivered'])
      .select(['id', 'customer_id', 'total_amount', 'tax_amount', 'subtotal'])
      .executeTakeFirst();

    if (!so) {
      throw new NotFoundException(
        'Sales Order tidak ditemukan atau belum ada pengiriman',
      );
    }

    if (!dto.doIds.length) {
      throw new BadRequestException('Minimal satu Delivery Order diperlukan');
    }

    // Validasi DO confirmed dan milik SO ini
    const dos = await db
      .selectFrom('delivery_orders')
      .where('id', 'in', dto.doIds)
      .where('so_id', '=', dto.soId)
      .where('status', '=', 'confirmed')
      .select('id')
      .execute();

    if (dos.length !== dto.doIds.length) {
      throw new BadRequestException(
        'Satu atau lebih DO tidak valid atau belum dikonfirmasi',
      );
    }

    // Cek DO belum di-invoice
    const alreadyInvoiced = await db
      .selectFrom('customer_invoice_deliveries as cid')
      .innerJoin('customer_invoices as ci', 'ci.id', 'cid.invoice_id')
      .where('cid.do_id', 'in', dto.doIds)
      .where('ci.status', '!=', 'cancelled')
      .select('cid.do_id')
      .executeTakeFirst();

    if (alreadyInvoiced) {
      throw new ConflictException(
        `DO ${alreadyInvoiced.do_id} sudah ada di invoice lain`,
      );
    }

    return db.transaction().execute(async (trx) => {
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
          subtotal: Number(so.subtotal),
          tax_amount: Number(so.tax_amount),
          total_amount: Number(so.total_amount),
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
          dto.doIds.map((doId) => ({
            invoice_id: invoice.id,
            do_id: doId,
          })),
        )
        .execute();

      // Update SO status ke invoiced
      await trx
        .updateTable('sales_orders')
        .set({ status: 'invoiced', updated_at: new Date() })
        .where('id', '=', dto.soId)
        .execute();

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
      paidAmount >= total
        ? 'paid'
        : paidAmount > 0
          ? 'partial'
          : 'unpaid';

    await db
      .updateTable('customer_invoices')
      .set({ paid_amount: paidAmount, status: newStatus, updated_at: new Date() })
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
    if (dateFrom) query = query.where('pr.payment_date', '>=', new Date(dateFrom));
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

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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

    // Validasi total alokasi = amount payment
    const totalAllocated = dto.allocations.reduce((s, a) => s + a.amount, 0);
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
      const number = await this.docNumber.generate(trx, 'PAY');

      const [payment] = await trx
        .insertInto('payment_receipts')
        .values({
          number,
          customer_id: dto.customerId,
          payment_date: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
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

      return this.findOne(trx, payment.id);
    });
  }
}
