import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateInventoryMovementDto,
  MovementFilterDto,
} from '../dto/inventory.dto';

@Injectable()
export class InventoryMovementService {
  private readonly logger = new Logger(InventoryMovementService.name);

  // ----------------------------------------------------------------
  // LIST MOVEMENTS
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: MovementFilterDto) {
    const {
      page,
      limit,
      movementTypeCode,
      status,
      dateFrom,
      dateTo,
      warehouseId,
    } = filter;

    let query = db
      .selectFrom('inventory_movements as im')
      .innerJoin(
        'inventory_movement_types as imt',
        'imt.id',
        'im.movement_type_id',
      )
      .select([
        'im.id',
        'im.movement_date',
        'im.status',
        'im.reference_type',
        'im.reference_id',
        'im.notes',
        'im.created_at',
        'im.created_by',
        'im.confirmed_at',
        'imt.code as movement_type_code',
        'imt.name as movement_type_name',
        'imt.direction',
      ]);

    if (status) {
      query = query.where('im.status', '=', status as any);
    }
    if (movementTypeCode) {
      query = query.where('imt.code', '=', movementTypeCode);
    }
    if (dateFrom) {
      query = query.where('im.movement_date', '>=', new Date(dateFrom));
    }
    if (dateTo) {
      query = query.where('im.movement_date', '<=', new Date(dateTo));
    }
    if (warehouseId) {
      // Filter berdasarkan warehouse di items
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('inventory_movement_items as imi')
            .whereRef('imi.movement_id', '=', 'im.id')
            .where((eb2) =>
              eb2.or([
                eb2('imi.from_warehouse_id', '=', warehouseId),
                eb2('imi.to_warehouse_id', '=', warehouseId),
              ]),
            )
            .select('imi.id'),
        ),
      );
    }

    const countResult = await query
      .clearSelect()
      .select(db.fn.countAll<number>().as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total ?? 0);

    const offset = (page - 1) * limit;
    const data = await query
      .orderBy('im.movement_date', 'desc')
      .orderBy('im.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // GET DETAIL MOVEMENT + ITEMS
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, movementId: number) {
    const movement = await db
      .selectFrom('inventory_movements as im')
      .innerJoin(
        'inventory_movement_types as imt',
        'imt.id',
        'im.movement_type_id',
      )
      .where('im.id', '=', movementId)
      .select([
        'im.id',
        'im.movement_date',
        'im.status',
        'im.reference_type',
        'im.reference_id',
        'im.notes',
        'im.created_at',
        'im.created_by',
        'im.confirmed_by',
        'im.confirmed_at',
        'im.cancelled_by',
        'im.cancelled_at',
        'imt.code as movement_type_code',
        'imt.name as movement_type_name',
        'imt.direction',
      ])
      .executeTakeFirst();

    if (!movement)
      throw new NotFoundException('Transaksi inventory tidak ditemukan');

    const items = await db
      .selectFrom('inventory_movement_items as imi')
      .innerJoin('product_variants as pv', 'pv.id', 'imi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'imi.uom_id')
      .leftJoin('batches as b', 'b.id', 'imi.batch_id')
      .leftJoin('warehouses as fw', 'fw.id', 'imi.from_warehouse_id')
      .leftJoin('warehouses as tw', 'tw.id', 'imi.to_warehouse_id')
      .where('imi.movement_id', '=', movementId)
      .select([
        'imi.id',
        'imi.quantity',
        'imi.unit_cost',
        'imi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
        'b.batch_number',
        'fw.code as from_warehouse_code',
        'fw.name as from_warehouse_name',
        'tw.code as to_warehouse_code',
        'tw.name as to_warehouse_name',
      ])
      .execute();

    return { ...movement, items };
  }

  // ----------------------------------------------------------------
  // CREATE MOVEMENT (status: draft)
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateInventoryMovementDto,
    createdBy: number,
  ) {
    // Validasi movement type
    const movementType = await db
      .selectFrom('inventory_movement_types')
      .where('code', '=', dto.movementTypeCode)
      .select(['id', 'code', 'direction'])
      .executeTakeFirst();

    if (!movementType) {
      throw new NotFoundException(
        `Movement type "${dto.movementTypeCode}" tidak ditemukan`,
      );
    }

    if (!dto.items.length) {
      throw new BadRequestException('Minimal satu item diperlukan');
    }

    // Validasi setiap item sesuai direction
    await this.validateMovementItems(db, dto.items, movementType.direction);

    return db.transaction().execute(async (trx) => {
      // Buat header movement
      const [movement] = await trx
        .insertInto('inventory_movements')
        .values({
          movement_type_id: movementType.id,
          movement_date: dto.movementDate
            ? new Date(dto.movementDate)
            : new Date(),
          notes: dto.notes ?? null,
          status: 'draft',
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Insert items
      await trx
        .insertInto('inventory_movement_items')
        .values(
          dto.items.map((item) => ({
            movement_id: movement.id,
            variant_id: item.variantId,
            batch_id: item.batchId ?? null,
            from_warehouse_id: item.fromWarehouseId ?? null,
            from_location_id: item.fromLocationId ?? null,
            to_warehouse_id: item.toWarehouseId ?? null,
            to_location_id: item.toLocationId ?? null,
            quantity: item.quantity,
            uom_id: item.uomId,
            unit_cost: item.unitCost ?? 0,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, movement.id);
    });
  }

  // ----------------------------------------------------------------
  // CONFIRM MOVEMENT
  // Saat confirmed: update stock_summary + update PO/GR/SO status jika perlu
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    movementId: number,
    confirmedBy: number,
  ) {
    const movement = await db
      .selectFrom('inventory_movements as im')
      .innerJoin(
        'inventory_movement_types as imt',
        'imt.id',
        'im.movement_type_id',
      )
      .where('im.id', '=', movementId)
      .select(['im.id', 'im.status', 'imt.direction', 'imt.code'])
      .executeTakeFirst();

    if (!movement) {
      throw new NotFoundException('Transaksi inventory tidak ditemukan');
    }
    if (movement.status !== 'draft') {
      throw new ConflictException(
        `Hanya movement berstatus draft yang bisa dikonfirmasi. Status saat ini: ${movement.status}`,
      );
    }

    // Kalau direction 'out' atau 'transfer' — validasi stok mencukupi
    if (movement.direction === 'out' || movement.direction === 'transfer') {
      await this.validateSufficientStock(db, movementId);
    }

    return db.transaction().execute(async (trx) => {
      // Update status ke confirmed
      await trx
        .updateTable('inventory_movements')
        .set({
          status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', movementId)
        .execute();

      // Refresh materialized view stock_summary
      await this.refreshStockSummary(trx);

      this.logger.log(`Movement confirmed: ${movementId} by ${confirmedBy}`);

      return this.findOne(trx, movementId);
    });
  }

  // ----------------------------------------------------------------
  // CANCEL MOVEMENT
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    movementId: number,
    cancelledBy: number,
    reason: string,
  ) {
    const movement = await db
      .selectFrom('inventory_movements')
      .where('id', '=', movementId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!movement) {
      throw new NotFoundException('Transaksi inventory tidak ditemukan');
    }
    if (movement.status === 'confirmed') {
      throw new ConflictException(
        'Movement yang sudah confirmed tidak bisa dibatalkan langsung. Buat adjustment movement untuk koreksi.',
      );
    }
    if (movement.status === 'cancelled') {
      throw new ConflictException('Movement ini sudah dibatalkan sebelumnya');
    }

    const [cancelled] = await db
      .updateTable('inventory_movements')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date(),
        notes: reason,
        updated_at: new Date(),
      })
      .where('id', '=', movementId)
      .returningAll()
      .execute();

    return cancelled;
  }

  // ----------------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------------

  private async validateMovementItems(
    db: Kysely<TenantSchema>,
    items: CreateInventoryMovementDto['items'],
    direction: string,
  ) {
    for (const item of items) {
      // Validasi variant exists
      const variant = await db
        .selectFrom('product_variants')
        .where('id', '=', item.variantId)
        .where('is_active', '=', true)
        .select('id')
        .executeTakeFirst();

      if (!variant) {
        throw new NotFoundException(
          `Variant ${item.variantId} tidak ditemukan`,
        );
      }

      // Validasi warehouse sesuai direction
      if (direction === 'in' && !item.toWarehouseId) {
        throw new BadRequestException(
          'Movement masuk (in) harus memiliki to_warehouse_id',
        );
      }
      if (direction === 'out' && !item.fromWarehouseId) {
        throw new BadRequestException(
          'Movement keluar (out) harus memiliki from_warehouse_id',
        );
      }
      if (direction === 'transfer') {
        if (!item.fromWarehouseId || !item.toWarehouseId) {
          throw new BadRequestException(
            'Transfer harus memiliki from_warehouse_id dan to_warehouse_id',
          );
        }
        if (item.fromWarehouseId === item.toWarehouseId) {
          throw new BadRequestException(
            'Gudang asal dan tujuan transfer tidak boleh sama',
          );
        }
      }

      // Validasi UoM
      const uom = await db
        .selectFrom('uom')
        .where('id', '=', item.uomId)
        .select('id')
        .executeTakeFirst();

      if (!uom) {
        throw new NotFoundException(`UoM ${item.uomId} tidak ditemukan`);
      }
    }
  }

  private async validateSufficientStock(
    db: Kysely<TenantSchema>,
    movementId: number,
  ) {
    // Ambil semua items yang butuh pengurangan stok
    const items = await db
      .selectFrom('inventory_movement_items as imi')
      .innerJoin('product_variants as pv', 'pv.id', 'imi.variant_id')
      .where('imi.movement_id', '=', movementId)
      .where((eb) => eb.or([eb('imi.from_warehouse_id', 'is not', null)]))
      .select([
        'imi.variant_id',
        'imi.from_warehouse_id',
        'imi.batch_id',
        'imi.quantity',
        'pv.sku',
      ])
      .execute();

    for (const item of items) {
      if (!item.from_warehouse_id) continue;

      // Query stock dari materialized view
      const stockRow = await db
        .selectFrom('stock_summary')
        .where('variant_id', '=', item.variant_id)
        .where('warehouse_id', '=', item.from_warehouse_id)
        .where((eb) =>
          item.batch_id
            ? eb('batch_id', '=', item.batch_id)
            : eb('batch_id', 'is', null),
        )
        .select('quantity_on_hand')
        .executeTakeFirst();

      const onHand = Number(stockRow?.quantity_on_hand ?? 0);

      if (onHand < item.quantity) {
        throw new BadRequestException(
          `Stok tidak mencukupi untuk SKU "${item.sku}". ` +
            `Tersedia: ${onHand}, dibutuhkan: ${item.quantity}`,
        );
      }
    }
  }

  private async refreshStockSummary(db: Kysely<TenantSchema>) {
    // CONCURRENTLY: tidak block query lain saat refresh berlangsung
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(db);
  }
}
