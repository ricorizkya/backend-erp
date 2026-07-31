import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateMrpDemandDto, MrpDemandFilterDto } from '../dto/production.dto';

@Injectable()
export class MrpDemandService {
  async findAll(db: Kysely<TenantSchema>, filter: MrpDemandFilterDto) {
    const { page, limit, status, demandType, neededDateFrom, neededDateTo } =
      filter;

    let query = db
      .selectFrom('mrp_demands as md')
      .innerJoin('product_variants as pv', 'pv.id', 'md.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouses as w', 'w.id', 'md.warehouse_id')
      .innerJoin('uom as u', 'u.id', 'md.uom_id')
      .select([
        'md.id',
        'md.demand_type',
        'md.quantity',
        'md.needed_date',
        'md.status',
        'md.notes',
        'md.created_at',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'w.name as warehouse_name',
        'u.symbol as uom_symbol',
      ]);

    if (status) query = query.where('md.status', '=', status as any);
    if (demandType) query = query.where('md.demand_type', '=', demandType as any);
    if (neededDateFrom)
      query = query.where('md.needed_date', '>=', new Date(neededDateFrom));
    if (neededDateTo)
      query = query.where('md.needed_date', '<=', new Date(neededDateTo));

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('md.needed_date', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateMrpDemandDto,
    createdBy: number,
  ) {
    const [demand] = await db
      .insertInto('mrp_demands')
      .values({
        variant_id: dto.variantId,
        demand_type: dto.demandType,
        so_id: dto.soId ?? null,
        so_item_id: dto.soItemId ?? null,
        quantity: dto.quantity,
        uom_id: dto.uomId,
        needed_date: new Date(dto.neededDate),
        warehouse_id: dto.warehouseId,
        status: 'open',
        notes: dto.notes ?? null,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return demand;
  }

  async cancel(db: Kysely<TenantSchema>, demandId: number) {
    const demand = await db
      .selectFrom('mrp_demands')
      .where('id', '=', demandId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!demand) throw new NotFoundException('MRP Demand tidak ditemukan');
    if (demand.status === 'fulfilled') {
      throw new ConflictException(
        'Demand yang sudah fulfilled tidak bisa dibatalkan',
      );
    }

    const [updated] = await db
      .updateTable('mrp_demands')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', demandId)
      .returningAll()
      .execute();

    return updated;
  }

  // Dipanggil saat Sales Order di-confirm (MTO)
  async createFromSalesOrder(
    db: Kysely<TenantSchema>,
    soId: number,
    soItemId: number,
    variantId: number,
    quantity: number,
    uomId: number,
    neededDate: Date,
    warehouseId: number,
    createdBy: number,
  ) {
    // Cek sudah ada demand untuk SO item ini
    const existing = await db
      .selectFrom('mrp_demands')
      .where('so_item_id', '=', soItemId)
      .where('status', '!=', 'cancelled')
      .select('id')
      .executeTakeFirst();

    if (existing) return existing; // Idempotent

    const [demand] = await db
      .insertInto('mrp_demands')
      .values({
        variant_id: variantId,
        demand_type: 'sales_order',
        so_id: soId,
        so_item_id: soItemId,
        quantity,
        uom_id: uomId,
        needed_date: neededDate,
        warehouse_id: warehouseId,
        status: 'open',
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return demand;
  }
}
