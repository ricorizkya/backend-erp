import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  ConsumeMaterialsDto,
  CreateProductionResultDto,
  WorkOrderFilterDto,
} from '../dto/production.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { BomService } from '../../bom/services/bom.service';

@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly bomService: BomService,
  ) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: WorkOrderFilterDto) {
    const {
      page,
      limit,
      search,
      status,
      productionType,
      dateFrom,
      dateTo,
      variantId,
    } = filter;

    let query = db
      .selectFrom('work_orders as wo')
      .innerJoin('product_variants as pv', 'pv.id', 'wo.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouses as w', 'w.id', 'wo.output_warehouse_id')
      .select([
        'wo.id',
        'wo.number',
        'wo.status',
        'wo.production_type',
        'wo.quantity_planned',
        'wo.quantity_produced',
        'wo.planned_start',
        'wo.planned_finish',
        'wo.actual_start',
        'wo.actual_finish',
        'wo.created_at',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('wo.status', '=', status as any);
    if (productionType)
      query = query.where('wo.production_type', '=', productionType as any);
    if (variantId) query = query.where('wo.variant_id', '=', variantId);
    if (dateFrom)
      query = query.where('wo.planned_start', '>=', new Date(dateFrom));
    if (dateTo)
      query = query.where('wo.planned_finish', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('wo.number', 'ilike', `%${search}%`),
          eb('p.name', 'ilike', `%${search}%`),
          eb('pv.sku', 'ilike', `%${search}%`),
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
      .orderBy('wo.planned_start', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, woId: number) {
    const wo = await db
      .selectFrom('work_orders as wo')
      .innerJoin('product_variants as pv', 'pv.id', 'wo.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouses as w', 'w.id', 'wo.output_warehouse_id')
      .innerJoin('bom_versions as bv', 'bv.id', 'wo.bom_version_id')
      .where('wo.id', '=', woId)
      .select([
        'wo.id',
        'wo.number',
        'wo.status',
        'wo.production_type',
        'wo.quantity_planned',
        'wo.quantity_produced',
        'wo.planned_start',
        'wo.planned_finish',
        'wo.actual_start',
        'wo.actual_finish',
        'wo.notes',
        'wo.created_by',
        'wo.created_at',
        'wo.confirmed_by',
        'wo.confirmed_at',
        'wo.so_id',
        'wo.so_item_id',
        'wo.planned_order_id',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
        'bv.version_number',
        'bv.version_name',
      ])
      .executeTakeFirst();

    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');

    // Materials
    const materials = await db
      .selectFrom('work_order_materials as wom')
      .innerJoin('product_variants as pv', 'pv.id', 'wom.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouses as wh', 'wh.id', 'wom.warehouse_id')
      .innerJoin('uom as u', 'u.id', 'wom.uom_id')
      .where('wom.work_order_id', '=', woId)
      .select([
        'wom.id',
        'wom.quantity_planned',
        'wom.quantity_consumed',
        'wom.status',
        'wom.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'wh.name as warehouse_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    // Operations
    const operations = await db
      .selectFrom('work_order_operations')
      .where('work_order_id', '=', woId)
      .selectAll()
      .orderBy('sequence', 'asc')
      .execute();

    // Production results
    const results = await db
      .selectFrom('production_results as pr')
      .leftJoin('batches as b', 'b.id', 'pr.batch_id')
      .where('pr.work_order_id', '=', woId)
      .select([
        'pr.id',
        'pr.quantity_produced',
        'pr.result_date',
        'pr.notes',
        'pr.created_at',
        'b.batch_number',
      ])
      .execute();

    return { ...wo, materials, operations, results };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateWorkOrderDto,
    createdBy: number,
  ) {
    // Validasi BOM version
    const bomVersion = await db
      .selectFrom('bom_versions')
      .where('id', '=', dto.bomVersionId)
      .select(['id', 'status', 'bom_header_id'])
      .executeTakeFirst();

    if (!bomVersion) throw new NotFoundException('BOM Version tidak ditemukan');
    if (bomVersion.status !== 'active') {
      throw new BadRequestException(
        'Hanya BOM version berstatus active yang bisa digunakan',
      );
    }

    // Validasi warehouse
    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.outputWarehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang output tidak ditemukan');

    if (new Date(dto.plannedStart) >= new Date(dto.plannedFinish)) {
      throw new BadRequestException('Tanggal mulai harus sebelum tanggal selesai');
    }

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'WO');

      const [wo] = await trx
        .insertInto('work_orders')
        .values({
          number,
          planned_order_id: dto.plannedOrderId ?? null,
          so_id: dto.soId ?? null,
          so_item_id: dto.soItemId ?? null,
          variant_id: dto.variantId,
          bom_version_id: dto.bomVersionId,
          quantity_planned: dto.quantityPlanned,
          quantity_produced: 0,
          uom_id: dto.uomId,
          output_warehouse_id: dto.outputWarehouseId,
          planned_start: new Date(dto.plannedStart),
          planned_finish: new Date(dto.plannedFinish),
          status: 'draft',
          production_type: dto.productionType,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      return wo;
    });
  }

  // ----------------------------------------------------------------
  // UPDATE (draft only)
  // ----------------------------------------------------------------

  async update(
    db: Kysely<TenantSchema>,
    woId: number,
    dto: UpdateWorkOrderDto,
  ) {
    const wo = await this.getWoOrThrow(db, woId);
    if (wo.status !== 'draft') {
      throw new ConflictException('Hanya WO berstatus draft yang bisa diubah');
    }

    const [updated] = await db
      .updateTable('work_orders')
      .set({
        ...(dto.plannedStart
          ? { planned_start: new Date(dto.plannedStart) }
          : {}),
        ...(dto.plannedFinish
          ? { planned_finish: new Date(dto.plannedFinish) }
          : {}),
        ...(dto.quantityPlanned
          ? { quantity_planned: dto.quantityPlanned }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', woId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // CONFIRM (draft → confirmed)
  // Auto-generate: WO materials dari BOM + WO operations dari BOM
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    woId: number,
    confirmedBy: number,
  ) {
    const wo = await db
      .selectFrom('work_orders')
      .where('id', '=', woId)
      .select([
        'id',
        'status',
        'bom_version_id',
        'quantity_planned',
        'uom_id',
        'output_warehouse_id',
        'variant_id',
      ])
      .executeTakeFirst();

    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (wo.status !== 'draft') {
      throw new ConflictException(
        `WO berstatus ${wo.status} tidak bisa dikonfirmasi`,
      );
    }

    return db.transaction().execute(async (trx) => {
      // Explode BOM untuk kalkulasi material requirements
      const exploded = await this.bomService.explodeBom(
        trx,
        wo.bom_version_id,
        Number(wo.quantity_planned),
      );

      // Ambil raw material (bukan phantom)
      const rawMaterials = exploded.items.filter(
        (item) => !item.is_phantom || item.level > 0,
      );

      // Insert WO materials
      if (rawMaterials.length > 0) {
        await trx
          .insertInto('work_order_materials')
          .values(
            rawMaterials.map((item) => ({
              work_order_id: woId,
              bom_item_id: item.item_id,
              variant_id: item.variant_id,
              quantity_planned: item.quantity_required_with_scrap,
              uom_id: wo.uom_id,
              quantity_consumed: 0,
              warehouse_id: wo.output_warehouse_id,
              status: 'pending',
            })),
          )
          .execute();
      }

      // Ambil BOM operations dan buat WO operations
      const bomOps = await trx
        .selectFrom('bom_operations')
        .where('bom_version_id', '=', wo.bom_version_id)
        .selectAll()
        .orderBy('sequence', 'asc')
        .execute();

      if (bomOps.length > 0) {
        await trx
          .insertInto('work_order_operations')
          .values(
            bomOps.map((op) => ({
              work_order_id: woId,
              bom_operation_id: op.id,
              sequence: op.sequence,
              name: op.name,
              work_center: op.work_center ?? null,
              planned_duration_minutes: op.duration_minutes,
              status: 'pending',
            })),
          )
          .execute();
      }

      // Update WO status
      const [updated] = await trx
        .updateTable('work_orders')
        .set({
          status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', woId)
        .returningAll()
        .execute();

      this.logger.log(
        `WO confirmed: ${woId}, ${rawMaterials.length} materials, ${bomOps.length} operations`,
      );

      return updated;
    });
  }

  // ----------------------------------------------------------------
  // START PRODUCTION (confirmed → in_progress)
  // ----------------------------------------------------------------

  async startProduction(db: Kysely<TenantSchema>, woId: number) {
    const wo = await this.getWoOrThrow(db, woId);
    if (wo.status !== 'confirmed') {
      throw new ConflictException(`WO harus berstatus confirmed untuk dimulai`);
    }

    const [updated] = await db
      .updateTable('work_orders')
      .set({
        status: 'in_progress',
        actual_start: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', woId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // CONSUME MATERIALS
  // ----------------------------------------------------------------

  async consumeMaterials(
    db: Kysely<TenantSchema>,
    woId: number,
    dto: ConsumeMaterialsDto,
    consumedBy: number,
  ) {
    const wo = await this.getWoOrThrow(db, woId);
    if (!['confirmed', 'in_progress'].includes(wo.status)) {
      throw new ConflictException(
        'Konsumsi material hanya bisa dilakukan pada WO confirmed atau in_progress',
      );
    }

    return db.transaction().execute(async (trx) => {
      // Ambil movement type PRODUCTION_OUT
      const movType = await trx
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'PRODUCTION_OUT')
        .select('id')
        .executeTakeFirst();

      if (!movType)
        throw new Error('Movement type PRODUCTION_OUT tidak ditemukan');

      // Buat satu inventory movement untuk semua konsumsi ini
      const [movement] = await trx
        .insertInto('inventory_movements')
        .values({
          movement_type_id: movType.id,
          reference_type: 'work_order',
          reference_id: woId,
          movement_date: new Date(),
          status: 'confirmed',
          notes: `Material consumption WO ${woId}`,
          created_by: consumedBy,
          confirmed_by: consumedBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      for (const item of dto.items) {
        const woMaterial = await trx
          .selectFrom('work_order_materials')
          .where('id', '=', item.woMaterialId)
          .where('work_order_id', '=', woId)
          .select([
            'id',
            'variant_id',
            'quantity_planned',
            'quantity_consumed',
            'warehouse_id',
            'uom_id',
          ])
          .executeTakeFirst();

        if (!woMaterial) {
          throw new NotFoundException(
            `WO Material ${item.woMaterialId} tidak ditemukan`,
          );
        }

        const warehouseId = item.warehouseId ?? woMaterial.warehouse_id;

        await trx
          .insertInto('inventory_movement_items')
          .values({
            movement_id: movement.id,
            variant_id: woMaterial.variant_id,
            batch_id: item.batchId ?? null,
            from_warehouse_id: warehouseId,
            quantity: item.quantityConsumed,
            uom_id: woMaterial.uom_id,
            unit_cost: 0,
          })
          .execute();

        await trx
          .insertInto('work_order_material_lots')
          .values({
            wo_material_id: item.woMaterialId,
            batch_id: item.batchId ?? null,
            quantity_consumed: item.quantityConsumed,
            consumed_at: new Date(),
            consumed_by: consumedBy,
            inventory_movement_id: movement.id,
          })
          .execute();

        const newConsumed =
          Number(woMaterial.quantity_consumed) + item.quantityConsumed;
        const newStatus =
          newConsumed >= Number(woMaterial.quantity_planned)
            ? 'consumed'
            : 'partial';

        await trx
          .updateTable('work_order_materials')
          .set({
            quantity_consumed: newConsumed,
            status: newStatus,
            updated_at: new Date(),
          })
          .where('id', '=', item.woMaterialId)
          .execute();
      }

      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(
        trx,
      );
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY available_stock`.execute(
        trx,
      );

      return this.findOne(trx, woId);
    });
  }

  // ----------------------------------------------------------------
  // RECORD PRODUCTION RESULT
  // ----------------------------------------------------------------

  async recordResult(
    db: Kysely<TenantSchema>,
    woId: number,
    dto: CreateProductionResultDto,
    createdBy: number,
  ) {
    const wo = await db
      .selectFrom('work_orders')
      .where('id', '=', woId)
      .select([
        'id',
        'status',
        'variant_id',
        'quantity_planned',
        'quantity_produced',
        'output_warehouse_id',
        'bom_version_id',
      ])
      .executeTakeFirst();

    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    if (!['confirmed', 'in_progress'].includes(wo.status)) {
      throw new ConflictException(
        'Production result hanya bisa dicatat pada WO confirmed atau in_progress',
      );
    }

    return db.transaction().execute(async (trx) => {
      let batchId: number | null = null;
      if (dto.batchNumber) {
        const [batch] = await trx
          .insertInto('batches')
          .values({
            variant_id: wo.variant_id,
            batch_number: dto.batchNumber,
          })
          .onConflict((oc) =>
            oc
              .columns(['variant_id', 'batch_number'])
              .doUpdateSet({ variant_id: wo.variant_id }),
          )
          .returningAll()
          .execute();
        batchId = batch.id;
      }

      const movType = await trx
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'PRODUCTION_IN')
        .select('id')
        .executeTakeFirst();

      if (!movType)
        throw new Error('Movement type PRODUCTION_IN tidak ditemukan');

      const [movement] = await trx
        .insertInto('inventory_movements')
        .values({
          movement_type_id: movType.id,
          reference_type: 'work_order',
          reference_id: woId,
          movement_date: new Date(),
          status: 'confirmed',
          notes: `Production result WO ${woId}`,
          created_by: createdBy,
          confirmed_by: createdBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('inventory_movement_items')
        .values({
          movement_id: movement.id,
          variant_id: wo.variant_id,
          batch_id: batchId,
          to_warehouse_id: dto.warehouseId,
          quantity: dto.quantityProduced,
          uom_id: dto.uomId,
          unit_cost: 0,
        })
        .execute();

      const [result] = await trx
        .insertInto('production_results')
        .values({
          work_order_id: woId,
          variant_id: wo.variant_id,
          quantity_produced: dto.quantityProduced,
          uom_id: dto.uomId,
          batch_id: batchId,
          warehouse_id: dto.warehouseId,
          inventory_movement_id: movement.id,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      const newProduced =
        Number(wo.quantity_produced) + dto.quantityProduced;
      const newStatus =
        newProduced >= Number(wo.quantity_planned)
          ? 'completed'
          : 'partially_done';

      await trx
        .updateTable('work_orders')
        .set({
          quantity_produced: newProduced,
          status: newStatus,
          actual_finish: newStatus === 'completed' ? new Date() : null,
          updated_at: new Date(),
          ...(newStatus === 'completed'
            ? { completed_by: createdBy, completed_at: new Date() }
            : {}),
        })
        .where('id', '=', woId)
        .execute();

      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(
        trx,
      );
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY available_stock`.execute(
        trx,
      );

      return result;
    });
  }

  // ----------------------------------------------------------------
  // OPERATION TRACKING
  // ----------------------------------------------------------------

  async startOperation(
    db: Kysely<TenantSchema>,
    opId: number,
    userId: number,
  ) {
    const op = await db
      .selectFrom('work_order_operations')
      .where('id', '=', opId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!op) throw new NotFoundException('Operation tidak ditemukan');
    if (op.status !== 'pending') {
      throw new ConflictException(`Operation berstatus ${op.status}`);
    }

    const [updated] = await db
      .updateTable('work_order_operations')
      .set({
        status: 'in_progress',
        actual_start: new Date(),
        operator_id: userId,
        updated_at: new Date(),
      })
      .where('id', '=', opId)
      .returningAll()
      .execute();

    return updated;
  }

  async completeOperation(db: Kysely<TenantSchema>, opId: number) {
    const op = await db
      .selectFrom('work_order_operations')
      .where('id', '=', opId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!op) throw new NotFoundException('Operation tidak ditemukan');
    if (op.status !== 'in_progress') {
      throw new ConflictException(
        'Operation harus in_progress untuk diselesaikan',
      );
    }

    const [updated] = await db
      .updateTable('work_order_operations')
      .set({
        status: 'completed',
        actual_finish: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', opId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // CANCEL WO
  // ----------------------------------------------------------------

  async cancel(
    db: Kysely<TenantSchema>,
    woId: number,
    cancelledBy: number,
    reason: string,
  ) {
    const wo = await this.getWoOrThrow(db, woId);

    if (['completed', 'cancelled'].includes(wo.status)) {
      throw new ConflictException(
        `WO berstatus ${wo.status} tidak bisa dibatalkan`,
      );
    }

    const [updated] = await db
      .updateTable('work_orders')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date(),
        notes: reason,
        updated_at: new Date(),
      })
      .where('id', '=', woId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------------

  private async getWoOrThrow(db: Kysely<TenantSchema>, woId: number) {
    const wo = await db
      .selectFrom('work_orders')
      .where('id', '=', woId)
      .select(['id', 'status', 'quantity_planned', 'quantity_produced'])
      .executeTakeFirst();

    if (!wo) throw new NotFoundException('Work Order tidak ditemukan');
    return wo;
  }
}
