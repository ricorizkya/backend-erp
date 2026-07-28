/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateStockOpnameDto, CompleteOpnameDto } from '../dto/inventory.dto';

@Injectable()
export class StockOpnameService {
  private readonly logger = new Logger(StockOpnameService.name);

  // ----------------------------------------------------------------
  // LIST OPNAME
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, warehouseId?: number) {
    let query = db
      .selectFrom('stock_opnames as so')
      .innerJoin('warehouses as w', 'w.id', 'so.warehouse_id')
      .select([
        'so.id',
        'so.opname_date',
        'so.status',
        'so.notes',
        'so.created_by',
        'so.created_at',
        'so.completed_at',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (warehouseId) {
      query = query.where('so.warehouse_id', '=', warehouseId);
    }

    return query.orderBy('so.opname_date', 'desc').execute();
  }

  // ----------------------------------------------------------------
  // DETAIL OPNAME + ITEMS
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, opnameId: number) {
    const opname = await db
      .selectFrom('stock_opnames as so')
      .innerJoin('warehouses as w', 'w.id', 'so.warehouse_id')
      .where('so.id', '=', opnameId)
      .select([
        'so.id',
        'so.warehouse_id',
        'so.opname_date',
        'so.status',
        'so.notes',
        'so.created_by',
        'so.created_at',
        'so.completed_at',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!opname) throw new NotFoundException('Stock opname tidak ditemukan');

    const items = await db
      .selectFrom('stock_opname_items as soi')
      .innerJoin('product_variants as pv', 'pv.id', 'soi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .leftJoin('batches as b', 'b.id', 'soi.batch_id')
      .where('soi.opname_id', '=', opnameId)
      .select([
        'soi.id',
        'soi.variant_id',
        'soi.batch_id',
        'soi.system_quantity',
        'soi.actual_quantity',
        'soi.difference',
        'soi.notes',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'b.batch_number',
      ])
      .orderBy('p.name', 'asc')
      .execute();

    return { ...opname, items };
  }

  // ----------------------------------------------------------------
  // CREATE OPNAME
  // Snapshot stock_summary saat ini sebagai system_quantity
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateStockOpnameDto,
    createdBy: number,
  ) {
    // Cek tidak ada opname aktif di warehouse yang sama
    const activeOpname = await db
      .selectFrom('stock_opnames')
      .where('warehouse_id', '=', dto.warehouseId)
      .where('status', 'in', ['draft', 'counting'])
      .select('id')
      .executeTakeFirst();

    if (activeOpname) {
      throw new ConflictException(
        'Masih ada stock opname yang sedang berjalan di gudang ini. Selesaikan atau batalkan dulu sebelum membuat opname baru.',
      );
    }

    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.warehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    return db.transaction().execute(async (trx) => {
      // Buat header opname
      const [opname] = await trx
        .insertInto('stock_opnames')
        .values({
          warehouse_id: dto.warehouseId,
          opname_date: dto.opnameDate ? new Date(dto.opnameDate) : new Date(),
          status: 'counting',
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Snapshot stock dari materialized view
      // Ambil semua variant yang punya stock > 0 di warehouse ini
      const currentStock = await trx
        .selectFrom('stock_summary')
        .where('warehouse_id', '=', dto.warehouseId)
        .where('quantity_on_hand', '>', 0)
        .select(['variant_id', 'batch_id', 'quantity_on_hand'])
        .execute();

      if (currentStock.length > 0) {
        await trx
          .insertInto('stock_opname_items')
          .values(
            currentStock.map((s) => ({
              opname_id: opname.id,
              variant_id: s.variant_id,
              batch_id: s.batch_id ?? null,
              system_quantity: s.quantity_on_hand,
              actual_quantity: null,
            })),
          )
          .execute();
      }

      this.logger.log(
        `Stock opname dibuat: ${opname.id}, ` +
          `${currentStock.length} item di-snapshot`,
      );

      return this.findOne(trx, opname.id);
    });
  }

  // ----------------------------------------------------------------
  // COMPLETE OPNAME
  // User submit actual quantities →
  // sistem generate adjustment movements untuk selisih
  // ----------------------------------------------------------------

  async complete(
    db: Kysely<TenantSchema>,
    opnameId: number,
    dto: CompleteOpnameDto,
    completedBy: number,
  ) {
    const opname = await db
      .selectFrom('stock_opnames')
      .where('id', '=', opnameId)
      .select(['id', 'warehouse_id', 'status'])
      .executeTakeFirst();

    if (!opname) throw new NotFoundException('Stock opname tidak ditemukan');

    if (opname.status !== 'counting') {
      throw new ConflictException(
        `Opname tidak bisa diselesaikan. Status saat ini: ${opname.status}`,
      );
    }

    // Validasi semua item sudah diisi
    const totalItems = await db
      .selectFrom('stock_opname_items')
      .where('opname_id', '=', opnameId)
      .select(db.fn.countAll<number>().as('count'))
      .executeTakeFirst();

    if (dto.items.length !== Number(totalItems?.count ?? 0)) {
      throw new BadRequestException(
        `Jumlah item tidak sesuai. ` +
          `Dibutuhkan: ${totalItems?.count}, diterima: ${dto.items.length}`,
      );
    }

    return db.transaction().execute(async (trx) => {
      // Update actual quantities
      for (const item of dto.items) {
        await trx
          .updateTable('stock_opname_items')
          .set({
            actual_quantity: item.actualQuantity,
            notes: item.notes ?? null,
          })
          .where('id', '=', item.itemId)
          .where('opname_id', '=', opnameId)
          .execute();
      }

      // Ambil item dengan selisih (difference != 0)
      const itemsWithDiff = await trx
        .selectFrom('stock_opname_items')
        .where('opname_id', '=', opnameId)
        .where('actual_quantity', 'is not', null)
        .where('difference', '!=', 0)
        .select([
          'variant_id',
          'batch_id',
          'system_quantity',
          'actual_quantity',
          'difference',
        ])
        .execute();

      // Buat adjustment movements untuk setiap selisih
      if (itemsWithDiff.length > 0) {
        await this.createAdjustmentMovements(
          trx,
          opname.warehouse_id,
          opnameId,
          itemsWithDiff,
          completedBy,
        );
      }

      // Update status opname
      await trx
        .updateTable('stock_opnames')
        .set({
          status: 'completed',
          completed_by: completedBy,
          completed_at: new Date(),
          notes: dto.notes ?? null,
          updated_at: new Date(),
        })
        .where('id', '=', opnameId)
        .execute();

      // Refresh stock_summary setelah adjustment
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(
        trx,
      );

      this.logger.log(
        `Opname selesai: ${opnameId}, ` +
          `${itemsWithDiff.length} adjustment dibuat`,
      );

      return this.findOne(trx, opnameId);
    });
  }

  // ----------------------------------------------------------------
  // CANCEL OPNAME
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    opnameId: number,
    cancelledBy: number,
  ) {
    const opname = await db
      .selectFrom('stock_opnames')
      .where('id', '=', opnameId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!opname) throw new NotFoundException('Stock opname tidak ditemukan');

    if (opname.status === 'completed') {
      throw new ConflictException(
        'Opname yang sudah selesai tidak bisa dibatalkan',
      );
    }

    await db
      .updateTable('stock_opnames')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', opnameId)
      .execute();

    return { message: 'Stock opname berhasil dibatalkan' };
  }

  // ----------------------------------------------------------------
  // PRIVATE: Buat adjustment movements dari selisih opname
  // ----------------------------------------------------------------

  private async createAdjustmentMovements(
    db: Kysely<TenantSchema>,
    warehouseId: number,
    opnameId: number,
    items: Array<{
      variant_id: number;
      batch_id: number | null;
      system_quantity: number;
      actual_quantity: number | null;
      difference: number | null;
    }>,
    createdBy: number,
  ) {
    // Pre-fetch base_uom_id per variant (satu query, bukan N queries)
    const variantIds = [...new Set(items.map((i) => i.variant_id))];
    const uomRows = await db
      .selectFrom('product_variants as pv')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .where('pv.id', 'in', variantIds as any)
      .select(['pv.id as variant_id', 'p.base_uom_id'])
      .execute();

    const uomMap = Object.fromEntries(
      uomRows.map((r) => [r.variant_id, r.base_uom_id]),
    );

    // Pisahkan item surplus (adj in) dan kekurangan (adj out)
    const adjInItems = items.filter((i) => Number(i.difference) > 0);
    const adjOutItems = items.filter((i) => Number(i.difference) < 0);

    // Ambil movement type IDs
    const [adjInType, adjOutType] = await Promise.all([
      db
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'ADJUSTMENT_IN')
        .select('id')
        .executeTakeFirst(),
      db
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'ADJUSTMENT_OUT')
        .select('id')
        .executeTakeFirst(),
    ]);

    // Buat satu movement IN untuk semua surplus
    if (adjInItems.length > 0 && adjInType) {
      const [movIn] = await db
        .insertInto('inventory_movements')
        .values({
          movement_type_id: adjInType.id,
          movement_date: new Date(),
          reference_type: 'stock_opname',
          reference_id: opnameId,
          notes: 'Penyesuaian dari stock opname (kelebihan fisik)',
          status: 'confirmed',
          created_by: createdBy,
          confirmed_by: createdBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      await db
        .insertInto('inventory_movement_items')
        .values(
          adjInItems.map((item) => ({
            movement_id: movIn.id,
            variant_id: item.variant_id,
            batch_id: item.batch_id ?? null,
            to_warehouse_id: warehouseId,
            quantity: Math.abs(Number(item.difference)),
            uom_id: uomMap[item.variant_id],
            unit_cost: 0,
          })),
        )
        .execute();
    }

    // Buat satu movement OUT untuk semua kekurangan
    if (adjOutItems.length > 0 && adjOutType) {
      const [movOut] = await db
        .insertInto('inventory_movements')
        .values({
          movement_type_id: adjOutType.id,
          movement_date: new Date(),
          reference_type: 'stock_opname',
          reference_id: opnameId,
          notes: 'Penyesuaian dari stock opname (kekurangan fisik)',
          status: 'confirmed',
          created_by: createdBy,
          confirmed_by: createdBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      await db
        .insertInto('inventory_movement_items')
        .values(
          adjOutItems.map((item) => ({
            movement_id: movOut.id,
            variant_id: item.variant_id,
            batch_id: item.batch_id ?? null,
            from_warehouse_id: warehouseId,
            quantity: Math.abs(Number(item.difference)),
            uom_id: uomMap[item.variant_id],
            unit_cost: 0,
          })),
        )
        .execute();
    }
  }
}
