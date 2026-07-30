import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateSalesQuotationDto,
  UpdateSalesQuotationDto,
  PaginationDto,
} from '../dto/sales-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class SalesQuotationService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo, customerId } = filter;

    let query = db
      .selectFrom('sales_quotations as sq')
      .innerJoin('customers as c', 'c.id', 'sq.customer_id')
      .select([
        'sq.id',
        'sq.number',
        'sq.quotation_date',
        'sq.valid_until',
        'sq.status',
        'sq.total_amount',
        'sq.notes',
        'sq.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
      ]);

    if (status) query = query.where('sq.status', '=', status as any);
    if (customerId) query = query.where('sq.customer_id', '=', customerId);
    if (dateFrom) query = query.where('sq.quotation_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('sq.quotation_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('sq.number', 'ilike', `%${search}%`),
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
      .orderBy('sq.quotation_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, sqId: number) {
    const sq = await db
      .selectFrom('sales_quotations as sq')
      .innerJoin('customers as c', 'c.id', 'sq.customer_id')
      .where('sq.id', '=', sqId)
      .select([
        'sq.id',
        'sq.number',
        'sq.quotation_date',
        'sq.valid_until',
        'sq.status',
        'sq.subtotal',
        'sq.tax_amount',
        'sq.discount_amount',
        'sq.total_amount',
        'sq.payment_term_days',
        'sq.delivery_address',
        'sq.notes',
        'sq.terms_conditions',
        'sq.created_by',
        'sq.created_at',
        'sq.sent_at',
        'c.id as customer_id',
        'c.code as customer_code',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'c.email as customer_email',
      ])
      .executeTakeFirst();

    if (!sq) throw new NotFoundException('Sales Quotation tidak ditemukan');

    const items = await db
      .selectFrom('sales_quotation_items as sqi')
      .innerJoin('product_variants as pv', 'pv.id', 'sqi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'sqi.uom_id')
      .where('sqi.quotation_id', '=', sqId)
      .select([
        'sqi.id',
        'sqi.quantity',
        'sqi.unit_price',
        'sqi.discount_pct',
        'sqi.tax_pct',
        'sqi.subtotal',
        'sqi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    return { ...sq, items };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateSalesQuotationDto,
    createdBy: number,
  ) {
    const customer = await db
      .selectFrom('customers')
      .where('id', '=', dto.customerId)
      .where('is_active', '=', true)
      .select(['id', 'payment_term'])
      .executeTakeFirst();

    if (!customer) throw new NotFoundException('Customer tidak ditemukan');
    if (!dto.items.length) throw new BadRequestException('Minimal satu item diperlukan');

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'SQ');
      const totals = this.calculateTotals(dto.items);

      const [sq] = await trx
        .insertInto('sales_quotations')
        .values({
          number,
          customer_id: dto.customerId,
          quotation_date: new Date(),
          valid_until: dto.validUntil ? new Date(dto.validUntil) : null,
          status: 'draft',
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          payment_term_days: dto.paymentTermDays ?? Number(customer.payment_term),
          delivery_address: dto.deliveryAddress ?? null,
          notes: dto.notes ?? null,
          terms_conditions: dto.termsConditions ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('sales_quotation_items')
        .values(
          dto.items.map((item) => ({
            quotation_id: sq.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            uom_id: item.uomId,
            unit_price: item.unitPrice,
            discount_pct: item.discountPct ?? 0,
            tax_pct: item.taxPct ?? 0,
            subtotal: this.calcLineSubtotal(
              item.quantity,
              item.unitPrice,
              item.discountPct ?? 0,
              item.taxPct ?? 0,
            ),
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, sq.id);
    });
  }

  // ----------------------------------------------------------------
  // UPDATE (hanya draft)
  // ----------------------------------------------------------------

  async update(
    db: Kysely<TenantSchema>,
    sqId: number,
    dto: UpdateSalesQuotationDto,
  ) {
    const sq = await this.getSqOrThrow(db, sqId);
    if (sq.status !== 'draft') {
      throw new ConflictException('Hanya quotation berstatus draft yang bisa diubah');
    }

    const [updated] = await db
      .updateTable('sales_quotations')
      .set({
        ...(dto.validUntil ? { valid_until: new Date(dto.validUntil) } : {}),
        ...(dto.paymentTermDays !== undefined ? { payment_term_days: dto.paymentTermDays } : {}),
        ...(dto.deliveryAddress !== undefined ? { delivery_address: dto.deliveryAddress ?? null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', sqId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // SEND (draft → sent)
  // ----------------------------------------------------------------

  async send(
    db: Kysely<TenantSchema>,
    sqId: number,
    sentBy: number,
  ) {
    const sq = await this.getSqOrThrow(db, sqId);
    if (sq.status !== 'draft') {
      throw new ConflictException(`Status quotation saat ini: ${sq.status}`);
    }

    const [updated] = await db
      .updateTable('sales_quotations')
      .set({ status: 'sent', sent_by: sentBy, sent_at: new Date(), updated_at: new Date() })
      .where('id', '=', sqId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // ACCEPT (sent → accepted) — trigger SO bisa dibuat
  // ----------------------------------------------------------------

  async accept(db: Kysely<TenantSchema>, sqId: number) {
    const sq = await this.getSqOrThrow(db, sqId);

    if (!['sent', 'draft'].includes(sq.status)) {
      throw new ConflictException(
        `Quotation berstatus ${sq.status} tidak bisa di-accept`,
      );
    }

    const [updated] = await db
      .updateTable('sales_quotations')
      .set({ status: 'accepted', updated_at: new Date() })
      .where('id', '=', sqId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // REJECT / CANCEL
  // ----------------------------------------------------------------

  async reject(db: Kysely<TenantSchema>, sqId: number) {
    const sq = await this.getSqOrThrow(db, sqId);
    if (!['sent', 'draft'].includes(sq.status)) {
      throw new ConflictException(`Status quotation: ${sq.status}`);
    }

    await db
      .updateTable('sales_quotations')
      .set({ status: 'rejected', updated_at: new Date() })
      .where('id', '=', sqId)
      .execute();

    return { message: 'Quotation berhasil ditolak' };
  }

  async cancel(db: Kysely<TenantSchema>, sqId: number) {
    const sq = await this.getSqOrThrow(db, sqId);
    if (sq.status === 'accepted') {
      throw new ConflictException(
        'Quotation yang sudah accepted tidak bisa dibatalkan. ' +
          'Batalkan Sales Order yang dibuat dari quotation ini.',
      );
    }

    await db
      .updateTable('sales_quotations')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', sqId)
      .execute();

    return { message: 'Quotation berhasil dibatalkan' };
  }

  // ----------------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------------

  private calculateTotals(
    items: Array<{
      quantity: number;
      unitPrice: number;
      discountPct?: number;
      taxPct?: number;
    }>,
  ) {
    let subtotal = 0,
      discountAmount = 0,
      taxAmount = 0;
    for (const item of items) {
      const gross = item.quantity * item.unitPrice;
      const discount = gross * ((item.discountPct ?? 0) / 100);
      const after = gross - discount;
      const tax = after * ((item.taxPct ?? 0) / 100);
      subtotal += after;
      discountAmount += discount;
      taxAmount += tax;
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round((subtotal + taxAmount) * 100) / 100,
    };
  }

  private calcLineSubtotal(qty: number, price: number, disc: number, tax: number) {
    return Math.round(qty * price * (1 - disc / 100) * (1 + tax / 100) * 100) / 100;
  }

  private async getSqOrThrow(db: Kysely<TenantSchema>, sqId: number) {
    const sq = await db
      .selectFrom('sales_quotations')
      .where('id', '=', sqId)
      .select(['id', 'status'])
      .executeTakeFirst();
    if (!sq) throw new NotFoundException('Sales Quotation tidak ditemukan');
    return sq;
  }
}
