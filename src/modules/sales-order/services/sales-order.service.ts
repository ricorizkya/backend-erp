import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateSalesOrderDto,
  CancelSoDto,
  PaginationDto,
} from '../dto/sales-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class SalesOrderService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo, customerId } = filter;

    let query = db
      .selectFrom('sales_orders as so')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .innerJoin('warehouses as w', 'w.id', 'so.warehouse_id')
      .select([
        'so.id',
        'so.number',
        'so.order_date',
        'so.requested_date',
        'so.status',
        'so.total_amount',
        'so.notes',
        'so.created_at',
        'c.code as customer_code',
        'c.name as customer_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('so.status', '=', status as any);
    if (customerId) query = query.where('so.customer_id', '=', customerId);
    if (dateFrom) query = query.where('so.order_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('so.order_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('so.number', 'ilike', `%${search}%`),
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
      .orderBy('so.order_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, soId: number) {
    const so = await db
      .selectFrom('sales_orders as so')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .innerJoin('warehouses as w', 'w.id', 'so.warehouse_id')
      .where('so.id', '=', soId)
      .select([
        'so.id',
        'so.number',
        'so.order_date',
        'so.requested_date',
        'so.status',
        'so.subtotal',
        'so.tax_amount',
        'so.discount_amount',
        'so.total_amount',
        'so.payment_term_days',
        'so.delivery_address',
        'so.notes',
        'so.terms_conditions',
        'so.created_by',
        'so.created_at',
        'so.confirmed_by',
        'so.confirmed_at',
        'so.cancelled_by',
        'so.cancelled_at',
        'so.cancellation_notes',
        'so.quotation_id',
        'c.id as customer_id',
        'c.code as customer_code',
        'c.name as customer_name',
        'c.phone as customer_phone',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!so) throw new NotFoundException('Sales Order tidak ditemukan');

    const items = await db
      .selectFrom('sales_order_items as soi')
      .innerJoin('product_variants as pv', 'pv.id', 'soi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'soi.uom_id')
      .where('soi.so_id', '=', soId)
      .select([
        'soi.id',
        'soi.quantity',
        'soi.unit_price',
        'soi.discount_pct',
        'soi.tax_pct',
        'soi.subtotal',
        'soi.quantity_delivered',
        'soi.quantity_pending',
        'soi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    // Ambil available stock per item (soft reservation view)
    const variantIds = [...new Set(items.map((i) => i.variant_id))];
    const availStock =
      variantIds.length > 0
        ? await db
            .selectFrom('available_stock')
            .where('variant_id', 'in', variantIds)
            .where('warehouse_id', '=', so.warehouse_id)
            .select([
              'variant_id',
              'quantity_on_hand',
              'quantity_reserved',
              'quantity_available',
            ])
            .execute()
        : [];

    const stockMap = Object.fromEntries(
      availStock.map((s) => [s.variant_id, s]),
    );

    const itemsWithStock = items.map((item) => ({
      ...item,
      stock: stockMap[item.variant_id] ?? {
        quantity_on_hand: 0,
        quantity_reserved: 0,
        quantity_available: 0,
      },
    }));

    return { ...so, items: itemsWithStock };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateSalesOrderDto,
    createdBy: number,
  ) {
    const customer = await db
      .selectFrom('customers')
      .where('id', '=', dto.customerId)
      .where('is_active', '=', true)
      .select(['id', 'payment_term', 'credit_limit'])
      .executeTakeFirst();

    if (!customer) throw new NotFoundException('Customer tidak ditemukan');

    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.warehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    if (!dto.items.length) throw new BadRequestException('Minimal satu item diperlukan');

    // Jika dari quotation, validasi quotation status
    if (dto.quotationId) {
      const sq = await db
        .selectFrom('sales_quotations')
        .where('id', '=', dto.quotationId)
        .select(['id', 'status', 'customer_id'])
        .executeTakeFirst();

      if (!sq) throw new NotFoundException('Sales Quotation tidak ditemukan');
      if (sq.status !== 'accepted') {
        throw new ConflictException(
          'Hanya quotation berstatus accepted yang bisa dijadikan Sales Order',
        );
      }
      if (sq.customer_id !== dto.customerId) {
        throw new BadRequestException('Customer tidak sesuai dengan quotation');
      }
    }

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'SO');
      const totals = this.calculateTotals(dto.items);

      const [so] = await trx
        .insertInto('sales_orders')
        .values({
          number,
          customer_id: dto.customerId,
          quotation_id: dto.quotationId ?? null,
          warehouse_id: dto.warehouseId,
          order_date: new Date(),
          requested_date: dto.requestedDate ? new Date(dto.requestedDate) : null,
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
        .insertInto('sales_order_items')
        .values(
          dto.items.map((item) => ({
            so_id: so.id,
            variant_id: item.variantId,
            quotation_item_id: item.quotationItemId ?? null,
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

      return this.findOne(trx, so.id);
    });
  }

  // ----------------------------------------------------------------
  // CONFIRM (draft → confirmed)
  // Saat confirmed: available_stock view otomatis update
  // karena view membaca SO status = 'confirmed'
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    soId: number,
    confirmedBy: number,
  ) {
    const so = await this.getSoOrThrow(db, soId); // or getSoOrThrow(db, soId)

    if (so.status !== 'draft') {
      throw new ConflictException(
        `Hanya SO berstatus draft yang bisa dikonfirmasi. Status: ${so.status}`,
      );
    }

    const [updated] = await db
      .updateTable('sales_orders')
      .set({
        status: 'confirmed',
        confirmed_by: confirmedBy,
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', soId)
      .returningAll()
      .execute();

    // Refresh available_stock agar soft reservation terupdate
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY available_stock`.execute(db);

    return updated;
  }

  // ----------------------------------------------------------------
  // CANCEL
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    soId: number,
    cancelledBy: number,
    dto: CancelSoDto,
  ) {
    const so = await this.getSoOrThrow(db, soId);

    if (['delivered', 'invoiced'].includes(so.status)) {
      throw new ConflictException(
        `SO berstatus ${so.status} tidak bisa dibatalkan`,
      );
    }

    const [updated] = await db
      .updateTable('sales_orders')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date(),
        cancellation_notes: dto.cancellationNotes,
        updated_at: new Date(),
      })
      .where('id', '=', soId)
      .returningAll()
      .execute();

    // Refresh available_stock — reservation dilepas otomatis
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY available_stock`.execute(db);

    return updated;
  }

  // ----------------------------------------------------------------
  // UPDATE DELIVERED QUANTITY (dipanggil internal dari DO service)
  // ----------------------------------------------------------------

  async updateDeliveredQuantity(db: Kysely<TenantSchema>, soId: number) {
    // Hitung total delivered per SO item dari semua DO confirmed
    const delivered = await db
      .selectFrom('delivery_order_items as doi')
      .innerJoin('delivery_orders as do_', 'do_.id', 'doi.do_id')
      .where('do_.so_id', '=', soId)
      .where('do_.status', '=', 'confirmed')
      .groupBy('doi.so_item_id')
      .select([
        'doi.so_item_id',
        db.fn.sum<number>('doi.quantity_delivered' as any).as('total_delivered'),
      ])
      .execute();

    const deliveredMap = Object.fromEntries(
      delivered.map((d) => [d.so_item_id, Number(d.total_delivered)]),
    );

    const items = await db
      .selectFrom('sales_order_items')
      .where('so_id', '=', soId)
      .select(['id', 'quantity'])
      .execute();

    for (const item of items) {
      await db
        .updateTable('sales_order_items')
        .set({
          quantity_delivered: deliveredMap[item.id] ?? 0,
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .execute();
    }

    // Update SO status
    const allItems = await db
      .selectFrom('sales_order_items')
      .where('so_id', '=', soId)
      .select(['quantity', 'quantity_delivered'])
      .execute();

    const allDelivered = allItems.every(
      (i) => Number(i.quantity_delivered) >= Number(i.quantity),
    );
    const anyDelivered = allItems.some(
      (i) => Number(i.quantity_delivered) > 0,
    );

    const newStatus = allDelivered
      ? 'delivered'
      : anyDelivered
        ? 'partial'
        : undefined;

    if (newStatus) {
      await db
        .updateTable('sales_orders')
        .set({ status: newStatus, updated_at: new Date() })
        .where('id', '=', soId)
        .execute();
    }
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

  private async getSoOrThrow(db: Kysely<TenantSchema>, soId: number) {
    const so = await db
      .selectFrom('sales_orders')
      .where('id', '=', soId)
      .select(['id', 'status'])
      .executeTakeFirst();
    if (!so) throw new NotFoundException('Sales Order tidak ditemukan');
    return so;
  }
}
