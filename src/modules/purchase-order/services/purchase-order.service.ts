import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CancelPoDto,
  PaginationDto,
} from '../dto/purchase-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class PurchaseOrderService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('purchase_orders as po')
      .innerJoin('suppliers as s', 's.id', 'po.supplier_id')
      .innerJoin('warehouses as w', 'w.id', 'po.warehouse_id')
      .select([
        'po.id',
        'po.number',
        'po.po_date',
        'po.expected_date',
        'po.status',
        'po.total_amount',
        'po.notes',
        'po.created_at',
        'po.confirmed_at',
        's.code as supplier_code',
        's.name as supplier_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('po.status', '=', status as any);
    if (dateFrom) query = query.where('po.po_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('po.po_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('po.number', 'ilike', `%${search}%`),
          eb('s.name', 'ilike', `%${search}%`),
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
      .orderBy('po.po_date', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, poId: number) {
    const po = await db
      .selectFrom('purchase_orders as po')
      .innerJoin('suppliers as s', 's.id', 'po.supplier_id')
      .innerJoin('warehouses as w', 'w.id', 'po.warehouse_id')
      .where('po.id', '=', poId)
      .select([
        'po.id',
        'po.number',
        'po.po_date',
        'po.expected_date',
        'po.status',
        'po.subtotal',
        'po.tax_amount',
        'po.discount_amount',
        'po.total_amount',
        'po.payment_term_days',
        'po.shipping_address',
        'po.notes',
        'po.terms_conditions',
        'po.created_by',
        'po.created_at',
        'po.confirmed_by',
        'po.confirmed_at',
        'po.cancelled_by',
        'po.cancelled_at',
        'po.cancellation_notes',
        's.id as supplier_id',
        's.code as supplier_code',
        's.name as supplier_name',
        's.phone as supplier_phone',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!po) throw new NotFoundException('Purchase Order tidak ditemukan');

    const items = await db
      .selectFrom('purchase_order_items as poi')
      .innerJoin('product_variants as pv', 'pv.id', 'poi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'poi.uom_id')
      .where('poi.po_id', '=', poId)
      .select([
        'poi.id',
        'poi.quantity',
        'poi.unit_price',
        'poi.discount_pct',
        'poi.tax_pct',
        'poi.subtotal',
        'poi.quantity_received',
        'poi.quantity_pending',
        'poi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    return { ...po, items };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreatePurchaseOrderDto,
    createdBy: number,
  ) {
    // Validasi supplier
    const supplier = await db
      .selectFrom('suppliers')
      .where('id', '=', dto.supplierId)
      .where('is_active', '=', true)
      .select(['id', 'payment_term'])
      .executeTakeFirst();

    if (!supplier) throw new NotFoundException('Supplier tidak ditemukan');

    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.warehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    if (!dto.items.length) {
      throw new BadRequestException('Minimal satu item diperlukan');
    }

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'PO');

      // Hitung totals
      const { subtotal, taxAmount, discountAmount, totalAmount } =
        this.calculateTotals(dto.items);

      const [po] = await trx
        .insertInto('purchase_orders')
        .values({
          number,
          supplier_id: dto.supplierId,
          rfq_supplier_quote_id: dto.rfqSupplierQuoteId ?? null,
          po_date: new Date(),
          expected_date: dto.expectedDate ? new Date(dto.expectedDate) : null,
          warehouse_id: dto.warehouseId,
          status: 'draft',
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          payment_term_days:
            dto.paymentTermDays ?? Number(supplier.payment_term),
          shipping_address: dto.shippingAddress ?? null,
          notes: dto.notes ?? null,
          terms_conditions: dto.termsConditions ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('purchase_order_items')
        .values(
          dto.items.map((item) => {
            const lineSubtotal = this.calcLineSubtotal(
              item.quantity,
              item.unitPrice,
              item.discountPct ?? 0,
              item.taxPct ?? 0,
            );
            return {
              po_id: po.id,
              variant_id: item.variantId,
              rfq_quote_item_id: item.rfqQuoteItemId ?? null,
              quantity: item.quantity,
              uom_id: item.uomId,
              unit_price: item.unitPrice,
              discount_pct: item.discountPct ?? 0,
              tax_pct: item.taxPct ?? 0,
              subtotal: lineSubtotal,
              notes: item.notes ?? null,
            };
          }),
        )
        .execute();

      return this.findOne(trx, po.id);
    });
  }

  // ----------------------------------------------------------------
  // UPDATE (hanya saat draft)
  // ----------------------------------------------------------------

  async update(
    db: Kysely<TenantSchema>,
    poId: number,
    dto: UpdatePurchaseOrderDto,
  ) {
    const po = await this.getPoOrThrow(db, poId);

    if (po.status !== 'draft') {
      throw new ConflictException('Hanya PO berstatus draft yang bisa diubah');
    }

    return db.transaction().execute(async (trx) => {
      // Update items jika ada
      if (dto.items?.length) {
        for (const item of dto.items) {
          const lineSubtotal = this.calcLineSubtotal(
            item.quantity ?? 0,
            item.unitPrice ?? 0,
            item.discountPct ?? 0,
            item.taxPct ?? 0,
          );

          await trx
            .updateTable('purchase_order_items')
            .set({
              ...(item.quantity ? { quantity: item.quantity } : {}),
              ...(item.unitPrice ? { unit_price: item.unitPrice } : {}),
              ...(item.discountPct !== undefined
                ? { discount_pct: item.discountPct }
                : {}),
              ...(item.taxPct !== undefined ? { tax_pct: item.taxPct } : {}),
              subtotal: lineSubtotal,
              updated_at: new Date(),
            })
            .where('id', '=', item.itemId)
            .where('po_id', '=', poId)
            .execute();
        }

        // Recalculate totals
        const items = await trx
          .selectFrom('purchase_order_items')
          .where('po_id', '=', poId)
          .select(['quantity', 'unit_price', 'discount_pct', 'tax_pct'])
          .execute();

        const totals = this.calculateTotals(
          items.map((i) => ({
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            discountPct: Number(i.discount_pct),
            taxPct: Number(i.tax_pct),
          })),
        );

        await trx
          .updateTable('purchase_orders')
          .set({
            subtotal: totals.subtotal,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
          })
          .where('id', '=', poId)
          .execute();
      }

      await trx
        .updateTable('purchase_orders')
        .set({
          ...(dto.expectedDate
            ? { expected_date: new Date(dto.expectedDate) }
            : {}),
          ...(dto.paymentTermDays !== undefined
            ? { payment_term_days: dto.paymentTermDays }
            : {}),
          ...(dto.shippingAddress !== undefined
            ? { shipping_address: dto.shippingAddress ?? null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', poId)
        .execute();

      return this.findOne(trx, poId);
    });
  }

  // ----------------------------------------------------------------
  // CONFIRM (draft → confirmed)
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    poId: number,
    confirmedBy: number,
  ) {
    const po = await this.getPoOrThrow(db, poId);

    if (po.status !== 'draft') {
      throw new ConflictException(
        `Hanya PO berstatus draft yang bisa dikonfirmasi. Status: ${po.status}`,
      );
    }

    const [updated] = await db
      .updateTable('purchase_orders')
      .set({
        status: 'confirmed',
        confirmed_by: confirmedBy,
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', poId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // CANCEL
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    poId: number,
    cancelledBy: number,
    dto: CancelPoDto,
  ) {
    const po = await this.getPoOrThrow(db, poId);

    if (!['draft', 'confirmed'].includes(po.status)) {
      throw new ConflictException(
        `PO berstatus ${po.status} tidak bisa dibatalkan`,
      );
    }

    const [updated] = await db
      .updateTable('purchase_orders')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date(),
        cancellation_notes: dto.cancellationNotes,
        updated_at: new Date(),
      })
      .where('id', '=', poId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // Update quantity_received (dipanggil internal oleh GR service)
  // ----------------------------------------------------------------

  async updateReceivedQuantity(
    db: Kysely<TenantSchema>,
    poId: number,
  ) {
    // Hitung total received per PO item dari semua GR confirmed
    const received = await db
      .selectFrom('goods_receipt_items as gri')
      .innerJoin('goods_receipts as gr', 'gr.id', 'gri.gr_id')
      .where('gr.po_id', '=', poId)
      .where('gr.status', '=', 'confirmed')
      .groupBy('gri.po_item_id')
      .select([
        'gri.po_item_id',
        db.fn.sum<number>('gri.quantity_received' as any).as('total_received'),
      ])
      .execute();

    const receivedMap: Record<number, number> = Object.fromEntries(
      received.map((r) => [r.po_item_id, Number(r.total_received)]),
    );

    // Update quantity_received per item
    const items = await db
      .selectFrom('purchase_order_items')
      .where('po_id', '=', poId)
      .select(['id', 'quantity'])
      .execute();

    for (const item of items) {
      await db
        .updateTable('purchase_order_items')
        .set({
          quantity_received: receivedMap[item.id] ?? 0,
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .execute();
    }

    // Update PO status
    const allItems = await db
      .selectFrom('purchase_order_items')
      .where('po_id', '=', poId)
      .select(['quantity', 'quantity_received'])
      .execute();

    const allReceived = allItems.every(
      (i) => Number(i.quantity_received) >= Number(i.quantity),
    );
    const anyReceived = allItems.some(
      (i) => Number(i.quantity_received) > 0,
    );

    const newStatus = allReceived
      ? 'received'
      : anyReceived
        ? 'partial'
        : undefined;

    if (newStatus) {
      await db
        .updateTable('purchase_orders')
        .set({ status: newStatus, updated_at: new Date() })
        .where('id', '=', poId)
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
    let subtotal = 0;
    let discountAmount = 0;
    let taxAmount = 0;

    for (const item of items) {
      const gross = item.quantity * item.unitPrice;
      const discount = gross * ((item.discountPct ?? 0) / 100);
      const afterDiscount = gross - discount;
      const tax = afterDiscount * ((item.taxPct ?? 0) / 100);

      subtotal += afterDiscount;
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

  private calcLineSubtotal(
    qty: number,
    price: number,
    discPct: number,
    taxPct: number,
  ): number {
    const gross = qty * price;
    const afterDisc = gross * (1 - discPct / 100);
    const withTax = afterDisc * (1 + taxPct / 100);
    return Math.round(withTax * 100) / 100;
  }

  private async getPoOrThrow(db: Kysely<TenantSchema>, poId: number) {
    const po = await db
      .selectFrom('purchase_orders')
      .where('id', '=', poId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!po) throw new NotFoundException('Purchase Order tidak ditemukan');
    return po;
  }
}
