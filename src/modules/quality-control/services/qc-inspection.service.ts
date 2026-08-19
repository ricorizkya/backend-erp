import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateQcInspectionDto,
  CompleteInspectionDto,
  QcInspectionFilterDto,
  InspectionType,
} from '../dto/qc.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class QcInspectionService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: QcInspectionFilterDto) {
    const { page, limit, inspectionType, status, result, variantId } = filter;

    let query = db
      .selectFrom('qc_inspections as qi')
      .innerJoin('qc_checklists as qc', 'qc.id', 'qi.checklist_id')
      .innerJoin('product_variants as pv', 'pv.id', 'qi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'qi.uom_id')
      .select([
        'qi.id',
        'qi.number',
        'qi.inspection_type',
        'qi.inspection_date',
        'qi.status',
        'qi.result',
        'qi.disposition',
        'qi.quantity_to_inspect',
        'qi.quantity_inspected',
        'qi.created_at',
        'qi.completed_at',
        'qc.name as checklist_name',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ]);

    if (inspectionType)
      query = query.where('qi.inspection_type', '=', inspectionType as any);
    if (status) query = query.where('qi.status', '=', status as any);
    if (result) query = query.where('qi.result', '=', result as any);
    if (variantId) query = query.where('qi.variant_id', '=', variantId);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('qi.inspection_date', 'desc')
      .orderBy('qi.created_at', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, inspectionId: number) {
    const inspection = await db
      .selectFrom('qc_inspections as qi')
      .innerJoin('qc_checklists as qc', 'qc.id', 'qi.checklist_id')
      .innerJoin('product_variants as pv', 'pv.id', 'qi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'qi.uom_id')
      .leftJoin('batches as b', 'b.id', 'qi.batch_id')
      .leftJoin('goods_receipts as gr', 'gr.id', 'qi.goods_receipt_id')
      .leftJoin('production_results as pr', 'pr.id', 'qi.production_result_id')
      .where('qi.id', '=', inspectionId)
      .select([
        'qi.id',
        'qi.number',
        'qi.inspection_type',
        'qi.inspection_date',
        'qi.status',
        'qi.result',
        'qi.disposition',
        'qi.quantity_to_inspect',
        'qi.quantity_inspected',
        'qi.notes',
        'qi.created_by',
        'qi.inspected_by',
        'qi.created_at',
        'qi.completed_at',
        'qi.goods_receipt_id',
        'qi.production_result_id',
        'qc.name as checklist_name',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
        'b.batch_number',
        'gr.number as gr_number',
        'pr.id as production_result_id_ref',
      ])
      .executeTakeFirst();

    if (!inspection)
      throw new NotFoundException('QC Inspection tidak ditemukan');

    // Inspection items (hasil per parameter)
    const items = await db
      .selectFrom('qc_inspection_items as qii')
      .innerJoin(
        'qc_checklist_items as qci',
        'qci.id',
        'qii.checklist_item_id',
      )
      .innerJoin('qc_parameters as qp', 'qp.id', 'qii.parameter_id')
      .where('qii.inspection_id', '=', inspectionId)
      .select([
        'qii.id',
        'qii.pass_fail_value',
        'qii.numeric_value',
        'qii.text_value',
        'qii.is_within_spec',
        'qii.notes',
        'qp.code',
        'qp.name as parameter_name',
        'qp.value_type',
        'qp.min_value',
        'qp.max_value',
        'qp.unit',
        'qci.is_required',
        'qci.sequence',
      ])
      .orderBy('qci.sequence', 'asc')
      .execute();

    // Defects
    const defects = await db
      .selectFrom('qc_defects as qd')
      .innerJoin('qc_defect_types as qdt', 'qdt.id', 'qd.defect_type_id')
      .innerJoin('uom as u', 'u.id', 'qd.uom_id')
      .where('qd.inspection_id', '=', inspectionId)
      .select([
        'qd.id',
        'qd.quantity_defective',
        'qd.description',
        'qd.disposition',
        'qdt.code',
        'qdt.name as defect_name',
        'qdt.severity',
        'u.symbol as uom_symbol',
      ])
      .execute();

    return { ...inspection, items, defects };
  }

  // ----------------------------------------------------------------
  // CREATE INSPECTION (status: draft)
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateQcInspectionDto,
    createdBy: number,
  ) {
    // Validasi source constraint
    if (
      dto.inspectionType === InspectionType.INCOMING &&
      !dto.goodsReceiptId
    ) {
      throw new BadRequestException(
        'Incoming QC harus memiliki Goods Receipt ID',
      );
    }
    if (
      dto.inspectionType === InspectionType.FINAL &&
      !dto.productionResultId
    ) {
      throw new BadRequestException(
        'Final QC harus memiliki Production Result ID',
      );
    }

    // Validasi checklist sesuai inspection type
    const checklist = await db
      .selectFrom('qc_checklists')
      .where('id', '=', dto.checklistId)
      .where('is_active', '=', true)
      .select(['id', 'inspection_type'])
      .executeTakeFirst();

    if (!checklist)
      throw new NotFoundException(
        'Checklist tidak ditemukan atau tidak aktif',
      );

    if (checklist.inspection_type !== dto.inspectionType) {
      throw new BadRequestException(
        `Checklist ini untuk tipe inspeksi "${checklist.inspection_type}", ` +
          `bukan "${dto.inspectionType}"`,
      );
    }

    // Validasi GR atau production result exists
    if (dto.goodsReceiptId) {
      const gr = await db
        .selectFrom('goods_receipts')
        .where('id', '=', dto.goodsReceiptId)
        .where('status', '=', 'confirmed')
        .select('id')
        .executeTakeFirst();

      if (!gr) {
        throw new NotFoundException(
          'Goods Receipt tidak ditemukan atau belum dikonfirmasi',
        );
      }
    }

    if (dto.productionResultId) {
      const pr = await db
        .selectFrom('production_results')
        .where('id', '=', dto.productionResultId)
        .select('id')
        .executeTakeFirst();

      if (!pr)
        throw new NotFoundException('Production Result tidak ditemukan');
    }

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'QC');

      const [inspection] = await trx
        .insertInto('qc_inspections')
        .values({
          number,
          checklist_id: dto.checklistId,
          inspection_type: dto.inspectionType,
          goods_receipt_id: dto.goodsReceiptId ?? null,
          production_result_id: dto.productionResultId ?? null,
          variant_id: dto.variantId,
          batch_id: dto.batchId ?? null,
          quantity_to_inspect: dto.quantityToInspect,
          quantity_inspected: 0,
          uom_id: dto.uomId,
          inspection_date: new Date(),
          status: 'draft',
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      return inspection;
    });
  }

  // ----------------------------------------------------------------
  // COMPLETE INSPECTION
  // Submit semua hasil + defects + set result + disposition
  // ----------------------------------------------------------------

  async complete(
    db: Kysely<TenantSchema>,
    inspectionId: number,
    dto: CompleteInspectionDto,
    inspectedBy: number,
  ) {
    const inspection = await db
      .selectFrom('qc_inspections')
      .where('id', '=', inspectionId)
      .select(['id', 'status', 'checklist_id', 'uom_id'])
      .executeTakeFirst();

    if (!inspection)
      throw new NotFoundException('QC Inspection tidak ditemukan');
    if (inspection.status !== 'draft') {
      throw new ConflictException(
        `Inspeksi berstatus ${inspection.status} tidak bisa diselesaikan`,
      );
    }

    // Validasi semua required items harus diisi
    const requiredItems = await db
      .selectFrom('qc_checklist_items')
      .where('checklist_id', '=', inspection.checklist_id)
      .where('is_required', '=', true)
      .select('id')
      .execute();

    const submittedIds = new Set(dto.items.map((i) => i.checklistItemId));
    const missingRequired = requiredItems.filter(
      (ri) => !submittedIds.has(ri.id),
    );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `${missingRequired.length} parameter wajib belum diisi`,
      );
    }

    return db.transaction().execute(async (trx) => {
      // Insert inspection items
      if (dto.items.length > 0) {
        await trx
          .insertInto('qc_inspection_items')
          .values(
            dto.items.map((item) => {
              let isWithinSpec: boolean | null = null;
              if (item.passFailValue !== undefined) {
                isWithinSpec = item.passFailValue;
              } else if (item.numericValue !== undefined) {
                isWithinSpec = true;
              }

              return {
                inspection_id: inspectionId,
                checklist_item_id: item.checklistItemId,
                parameter_id: item.parameterId,
                pass_fail_value: item.passFailValue ?? null,
                numeric_value: item.numericValue ?? null,
                text_value: item.textValue ?? null,
                is_within_spec: isWithinSpec,
                notes: item.notes ?? null,
              };
            }),
          )
          .execute();
      }

      // Insert defects jika ada
      if (dto.defects?.length) {
        await trx
          .insertInto('qc_defects')
          .values(
            dto.defects.map((d) => ({
              inspection_id: inspectionId,
              defect_type_id: d.defectTypeId,
              quantity_defective: d.quantityDefective,
              uom_id: d.uomId ?? inspection.uom_id,
              description: d.description ?? null,
              disposition: d.disposition,
            })),
          )
          .execute();
      }

      // Update inspection
      const [updated] = await trx
        .updateTable('qc_inspections')
        .set({
          status: 'completed',
          result: dto.result,
          disposition: dto.disposition,
          quantity_inspected: dto.quantityInspected,
          notes: dto.notes ?? null,
          inspected_by: inspectedBy,
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', inspectionId)
        .returningAll()
        .execute();

      return updated;
    });
  }

  // ----------------------------------------------------------------
  // CANCEL
  // ----------------------------------------------------------------

  async cancel(db: Kysely<TenantSchema>, inspectionId: number) {
    const inspection = await db
      .selectFrom('qc_inspections')
      .where('id', '=', inspectionId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!inspection)
      throw new NotFoundException('QC Inspection tidak ditemukan');
    if (inspection.status === 'completed') {
      throw new ConflictException(
        'Inspeksi yang sudah selesai tidak bisa dibatalkan',
      );
    }

    await db
      .updateTable('qc_inspections')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', inspectionId)
      .execute();

    return { message: 'QC Inspection berhasil dibatalkan' };
  }

  // ----------------------------------------------------------------
  // STATS — summary defect per periode (untuk dashboard)
  // ----------------------------------------------------------------

  async getDefectSummary(
    db: Kysely<TenantSchema>,
    inspectionType?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    let query = db
      .selectFrom('qc_defects as qd')
      .innerJoin('qc_inspections as qi', 'qi.id', 'qd.inspection_id')
      .innerJoin('qc_defect_types as qdt', 'qdt.id', 'qd.defect_type_id')
      .where('qi.status', '=', 'completed')
      .groupBy(['qdt.id', 'qdt.code', 'qdt.name', 'qdt.severity'])
      .select([
        'qdt.code',
        'qdt.name as defect_name',
        'qdt.severity',
        db.fn.count<number>('qd.id' as any).as('occurrence_count'),
        db.fn.sum<number>('qd.quantity_defective' as any).as('total_quantity'),
      ]);

    if (inspectionType) {
      query = query.where('qi.inspection_type', '=', inspectionType as any);
    }
    if (dateFrom) {
      query = query.where('qi.inspection_date', '>=', new Date(dateFrom));
    }
    if (dateTo) {
      query = query.where('qi.inspection_date', '<=', new Date(dateTo));
    }

    return query.orderBy('total_quantity', 'desc').execute();
  }
}
