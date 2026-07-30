import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateDeliveryOrderDto, PaginationDto } from '../dto/sales-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { SalesOrderService } from './sales-order.service';

@Injectable()
export class DeliveryOrderService {
  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly soService: SalesOrderService,
  ) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('delivery_orders as do_')
      .innerJoin('sales_orders as so', 'so.id', 'do_.so_id')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .innerJoin('warehouses as w', 'w.id', 'do_.warehouse_id')
      .select([
        'do_.id',
        'do_.number',
        'do_.delivery_date',
        'do_.status',
        'do_.receiver_name',
        'do_.notes',
        'do_.created_at',
        'do_.confirmed_at',
        'so.number as so_number',
        'c.name as customer_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('do_.status', '=', status as any);
    if (dateFrom) query = query.where('do_.delivery_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('do_.delivery_date', '<=', new Date(dateTo));
    if (search) query = query.where('do_.number', 'ilike', `%${search}%`);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('do_.delivery_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, doId: number) {
    const do_ = await db
      .selectFrom('delivery_orders as do_')
      .innerJoin('sales_orders as so', 'so.id', 'do_.so_id')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .innerJoin('warehouses as w', 'w.id', 'do_.warehouse_id')
      .where('do_.id', '=', doId)
      .select([
        'do_.id',
        'do_.number',
        'do_.so_id',
        'do_.delivery_date',
        'do_.status',
        'do_.receiver_name',
        'do_.delivery_address',
        'do_.inventory_movement_id',
        'do_.notes',
        'do_.created_by',
        'do_.created_at',
        'do_.confirmed_by',
        'do_.confirmed_at',
        'so.number as so_number',
        'c.id as customer_id',
        'c.name as customer_name',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!do_) throw new NotFoundException('Delivery Order tidak ditemukan');

    const items = await db
      .selectFrom('delivery_order_items as doi')
      .innerJoin('product_variants as pv', 'pv.id', 'doi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'doi.uom_id')
      .leftJoin('batches as b', 'b.id', 'doi.batch_id')
      .where('doi.do_id', '=', doId)
      .select([
        'doi.id',
        'doi.so_item_id',
        'doi.quantity_delivered',
        'doi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
        'b.id as batch_id',
        'b.batch_number',
      ])
      .execute();

    return { ...do_, items };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateDeliveryOrderDto,
    createdBy: number,
  ) {
    const so = await db
      .selectFrom('sales_orders')
      .where('id', '=', dto.soId)
      .where('status', 'in', ['confirmed', 'partial'])
      .select(['id', 'warehouse_id', 'customer_id'])
      .executeTakeFirst();

    if (!so) {
      throw new NotFoundException(
        'Sales Order tidak ditemukan atau belum dikonfirmasi',
      );
    }

    if (!dto.items.length) throw new BadRequestException('Minimal satu item diperlukan');

    // Validasi setiap item
    await this.validateDoItems(db, dto.items, so.warehouse_id);

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'DO');

      const [do_] = await trx
        .insertInto('delivery_orders')
        .values({
          number,
          so_id: dto.soId,
          warehouse_id: so.warehouse_id,
          delivery_date: dto.deliveryDate ? new Date(dto.deliveryDate) : new Date(),
          receiver_name: dto.receiverName ?? null,
          delivery_address: dto.deliveryAddress ?? null,
          status: 'draft',
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('delivery_order_items')
        .values(
          dto.items.map((item) => ({
            do_id: do_.id,
            so_item_id: item.soItemId,
            variant_id: item.variantId,
            batch_id: item.batchId ?? null,
            quantity_delivered: item.quantityDelivered,
            uom_id: item.uomId,
            location_id: item.locationId ?? null,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, do_.id);
    });
  }

  // ----------------------------------------------------------------
  // CONFIRM
  // Trigger: inventory movement SALES_DELIVERY
  //        + update SO delivered quantity
  //        + refresh available_stock
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    doId: number,
    confirmedBy: number,
  ) {
    const do_ = await db
      .selectFrom('delivery_orders')
      .where('id', '=', doId)
      .select(['id', 'status', 'so_id', 'warehouse_id'])
      .executeTakeFirst();

    if (!do_) throw new NotFoundException('Delivery Order tidak ditemukan');
    if (do_.status !== 'draft') {
      throw new ConflictException(
        `Hanya DO berstatus draft yang bisa dikonfirmasi. Status: ${do_.status}`,
      );
    }

    return db.transaction().execute(async (trx) => {
      // 1. Ambil movement type SALES_DELIVERY
      const movType = await trx
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'SALES_DELIVERY')
        .select('id')
        .executeTakeFirst();

      if (!movType) throw new Error('Movement type SALES_DELIVERY tidak ditemukan');

      // 2. Buat inventory movement header
      const [movement] = await trx
        .insertInto('inventory_movements')
        .values({
          movement_type_id: movType.id,
          reference_type: 'delivery_order',
          reference_id: doId,
          movement_date: new Date(),
          status: 'confirmed',
          notes: `DO ${doId}`,
          created_by: confirmedBy,
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      // 3. Ambil DO items dengan unit_cost dari SO
      const doItems = await trx
        .selectFrom('delivery_order_items as doi')
        .innerJoin('sales_order_items as soi', 'soi.id', 'doi.so_item_id')
        .where('doi.do_id', '=', doId)
        .select([
          'doi.variant_id',
          'doi.batch_id',
          'doi.quantity_delivered',
          'doi.uom_id',
          'doi.location_id',
          'soi.unit_price',
        ])
        .execute();

      // 4. Insert inventory movement items (keluar dari gudang)
      await trx
        .insertInto('inventory_movement_items')
        .values(
          doItems.map((item) => ({
            movement_id: movement.id,
            variant_id: item.variant_id,
            batch_id: item.batch_id ?? null,
            from_warehouse_id: do_.warehouse_id,
            from_location_id: item.location_id ?? null,
            quantity: item.quantity_delivered,
            uom_id: item.uom_id,
            unit_cost: Number(item.unit_price),
          })),
        )
        .execute();

      // 5. Update DO status
      await trx
        .updateTable('delivery_orders')
        .set({
          status: 'confirmed',
          inventory_movement_id: movement.id,
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', doId)
        .execute();

      // 6. Refresh stock_summary dan available_stock
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(trx);
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY available_stock`.execute(trx);

      // 7. Update SO delivered quantities + status
      await this.soService.updateDeliveredQuantity(trx, do_.so_id);

      return this.findOne(trx, doId);
    });
  }

  // ----------------------------------------------------------------
  // CANCEL
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    doId: number,
    cancelledBy: number,
  ) {
    const do_ = await db
      .selectFrom('delivery_orders')
      .where('id', '=', doId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!do_) throw new NotFoundException('Delivery Order tidak ditemukan');
    if (do_.status === 'confirmed') {
      throw new ConflictException(
        'DO yang sudah confirmed tidak bisa dibatalkan. ' +
          'Buat adjustment movement untuk koreksi.',
      );
    }

    await db
      .updateTable('delivery_orders')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', doId)
      .execute();

    return { message: 'Delivery Order berhasil dibatalkan' };
  }

  // ----------------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------------

  private async validateDoItems(
    db: Kysely<TenantSchema>,
    items: CreateDeliveryOrderDto['items'],
    warehouseId: number,
  ) {
    for (const item of items) {
      // Validasi SO item
      const soItem = await db
        .selectFrom('sales_order_items')
        .where('id', '=', item.soItemId)
        .select(['quantity_pending', 'variant_id'])
        .executeTakeFirst();

      if (!soItem) {
        throw new NotFoundException(`SO item ${item.soItemId} tidak ditemukan`);
      }

      if (soItem.variant_id !== item.variantId) {
        throw new BadRequestException(
          `Variant tidak sesuai dengan SO item ${item.soItemId}`,
        );
      }

      const pending = Number(soItem.quantity_pending ?? 0);
      if (item.quantityDelivered > pending) {
        throw new BadRequestException(
          `Quantity melebihi sisa pending SO item. ` +
            `Pending: ${pending}, dikirim: ${item.quantityDelivered}`,
        );
      }

      // Cek available stock (soft reservation)
      const avail = await db
        .selectFrom('available_stock')
        .where('variant_id', '=', item.variantId)
        .where('warehouse_id', '=', warehouseId)
        .select('quantity_available')
        .executeTakeFirst();

      const available = Number(avail?.quantity_available ?? 0);

      // Warning jika stock tidak cukup (tidak block — bisa MTO)
      if (available < item.quantityDelivered) {
        throw new BadRequestException(
          `Stok tidak tersedia untuk SKU variant ${item.variantId}. ` +
            `Available: ${available}, dibutuhkan: ${item.quantityDelivered}. ` +
            `Pastikan produksi sudah selesai sebelum membuat Delivery Order.`,
        );
      }
    }
  }
}
