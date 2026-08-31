import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { PlannedOrderFilterDto } from '../dto/mrp-run.dto';
import { ProductionType } from '../dto/production.dto';
import { WorkOrderService } from './work-order.service';
import { PurchaseOrderService } from '../../purchase-order/services/purchase-order.service';

@Injectable()
export class PlannedOrderService {
  constructor(
    private readonly woService: WorkOrderService,
    private readonly poService: PurchaseOrderService,
  ) {}

  // ----------------------------------------------------------------
  // LIST PLANNED ORDERS
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PlannedOrderFilterDto) {
    const { page = 1, limit = 20, mrpRunId, orderType, status } = filter;

    let query = db
      .selectFrom('planned_orders as po')
      .innerJoin('product_variants as pv', 'pv.id', 'po.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'po.uom_id')
      .leftJoin('suppliers as s', 's.id', 'po.suggested_supplier_id')
      .select([
        'po.id',
        'po.mrp_run_id',
        'po.variant_id',
        'po.order_type',
        'po.quantity',
        'po.planned_start',
        'po.planned_finish',
        'po.bom_version_id',
        'po.suggested_supplier_id',
        'po.status',
        'po.work_order_id',
        'po.purchase_order_id',
        'po.notes',
        'po.approved_by',
        'po.approved_at',
        'po.created_at',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
        's.name as suggested_supplier_name',
      ]);

    if (mrpRunId) query = query.where('po.mrp_run_id', '=', mrpRunId);
    if (orderType) query = query.where('po.order_type', '=', orderType as any);
    if (status) query = query.where('po.status', '=', status as any);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('po.planned_start', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL PLANNED ORDER
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, plannedOrderId: number) {
    const plannedOrder = await db
      .selectFrom('planned_orders as po')
      .innerJoin('product_variants as pv', 'pv.id', 'po.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'po.uom_id')
      .leftJoin('suppliers as s', 's.id', 'po.suggested_supplier_id')
      .where('po.id', '=', plannedOrderId)
      .select([
        'po.id',
        'po.mrp_run_id',
        'po.variant_id',
        'po.order_type',
        'po.quantity',
        'po.planned_start',
        'po.planned_finish',
        'po.bom_version_id',
        'po.suggested_supplier_id',
        'po.status',
        'po.work_order_id',
        'po.purchase_order_id',
        'po.notes',
        'po.approved_by',
        'po.approved_at',
        'po.created_at',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
        's.name as suggested_supplier_name',
      ])
      .executeTakeFirst();

    if (!plannedOrder) {
      throw new NotFoundException('Planned Order tidak ditemukan');
    }

    const demands = await db
      .selectFrom('planned_order_demands as pod')
      .innerJoin('mrp_demands as md', 'md.id', 'pod.demand_id')
      .where('pod.planned_order_id', '=', plannedOrderId)
      .select([
        'pod.demand_id',
        'pod.quantity_allocated',
        'md.demand_type',
        'md.so_id',
        'md.needed_date',
      ])
      .execute();

    return {
      ...plannedOrder,
      demands,
    };
  }

  // ----------------------------------------------------------------
  // APPROVE PLANNED ORDER
  // ----------------------------------------------------------------

  async approve(
    db: Kysely<TenantSchema>,
    plannedOrderId: number,
    approvedBy: number,
  ) {
    const plannedOrder = await db
      .selectFrom('planned_orders')
      .where('id', '=', plannedOrderId)
      .selectAll()
      .executeTakeFirst();

    if (!plannedOrder) {
      throw new NotFoundException('Planned Order tidak ditemukan');
    }

    if (plannedOrder.status !== 'proposed') {
      throw new ConflictException(
        `Hanya Planned Order berstatus proposed yang bisa di-approve. Status: ${plannedOrder.status}`,
      );
    }

    return db.transaction().execute(async (trx) => {
      let createdWoId: number | null = null;
      let createdPoId: number | null = null;

      if (plannedOrder.order_type === 'production') {
        if (!plannedOrder.bom_version_id) {
          throw new BadRequestException(
            'BOM Version ID diperlukan untuk membuat Work Order',
          );
        }

        // Ambil default output warehouse (warehouse pertama yang aktif jika tidak dispesifikasikan)
        const warehouse = await trx
          .selectFrom('warehouses')
          .where('is_active', '=', true)
          .select('id')
          .executeTakeFirst();

        if (!warehouse) {
          throw new BadRequestException(
            'Tidak ada gudang aktif yang ditemukan',
          );
        }

        const wo = await this.woService.create(
          trx,
          {
            variantId: plannedOrder.variant_id,
            bomVersionId: plannedOrder.bom_version_id,
            quantityPlanned: Number(plannedOrder.quantity),
            uomId: plannedOrder.uom_id,
            outputWarehouseId: warehouse.id,
            plannedStart: plannedOrder.planned_start
              .toISOString()
              .split('T')[0],
            plannedFinish: plannedOrder.planned_finish
              .toISOString()
              .split('T')[0],
            plannedOrderId: plannedOrder.id,
            productionType: ProductionType.MTS,
            notes: `Auto-generated from Planned Order #${plannedOrder.id}`,
          },
          approvedBy,
        );

        createdWoId = wo.id;
      } else if (plannedOrder.order_type === 'purchase') {
        const supplierId = plannedOrder.suggested_supplier_id;
        if (!supplierId) {
          throw new BadRequestException(
            'Supplier ID diperlukan untuk approve Planned Purchase Order',
          );
        }

        const warehouse = await trx
          .selectFrom('warehouses')
          .where('is_active', '=', true)
          .select('id')
          .executeTakeFirst();

        if (!warehouse) {
          throw new BadRequestException(
            'Tidak ada gudang aktif yang ditemukan',
          );
        }

        const variant = await trx
          .selectFrom('product_variants')
          .where('id', '=', plannedOrder.variant_id)
          .select(['cost_price'])
          .executeTakeFirst();

        const unitPrice = Number(variant?.cost_price ?? 0);

        const po = await this.poService.create(
          trx,
          {
            supplierId,
            warehouseId: warehouse.id,
            expectedDate: plannedOrder.planned_finish
              .toISOString()
              .split('T')[0],
            notes: `Auto-generated from Planned Order #${plannedOrder.id}`,
            items: [
              {
                variantId: plannedOrder.variant_id,
                quantity: Number(plannedOrder.quantity),
                unitPrice: unitPrice > 0 ? unitPrice : 1,
                uomId: plannedOrder.uom_id,
              },
            ],
          },
          approvedBy,
        );

        createdPoId = po.id;
      }

      await trx
        .updateTable('planned_orders')
        .set({
          status: 'approved',
          work_order_id: createdWoId,
          purchase_order_id: createdPoId,
          approved_by: approvedBy,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', plannedOrderId)
        .execute();

      return this.findOne(trx, plannedOrderId);
    });
  }

  // ----------------------------------------------------------------
  // BULK APPROVE
  // ----------------------------------------------------------------

  async bulkApprove(
    db: Kysely<TenantSchema>,
    mrpRunId: number,
    approvedBy: number,
  ) {
    const proposed = await db
      .selectFrom('planned_orders')
      .where('mrp_run_id', '=', mrpRunId)
      .where('status', '=', 'proposed')
      .select('id')
      .execute();

    const results: Array<{
      id: number;
      success: boolean;
      result?: unknown;
      error?: string;
    }> = [];
    for (const po of proposed) {
      try {
        const res = await this.approve(db, po.id, approvedBy);
        results.push({ id: po.id, success: true, result: res });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({ id: po.id, success: false, error: errMsg });
      }
    }

    return {
      total: proposed.length,
      approved: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
    };
  }

  // ----------------------------------------------------------------
  // CANCEL PLANNED ORDER
  // ----------------------------------------------------------------

  async cancel(db: Kysely<TenantSchema>, plannedOrderId: number) {
    const plannedOrder = await db
      .selectFrom('planned_orders')
      .where('id', '=', plannedOrderId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!plannedOrder) {
      throw new NotFoundException('Planned Order tidak ditemukan');
    }

    if (plannedOrder.status !== 'proposed') {
      throw new ConflictException(
        `Hanya Planned Order berstatus proposed yang bisa dibatalkan`,
      );
    }

    await db
      .updateTable('planned_orders')
      .set({
        status: 'cancelled',
        updated_at: new Date(),
      })
      .where('id', '=', plannedOrderId)
      .execute();

    return { message: `Planned Order #${plannedOrderId} berhasil dibatalkan` };
  }
}
