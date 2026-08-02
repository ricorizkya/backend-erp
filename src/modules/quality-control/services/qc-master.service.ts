import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateQcParameterDto,
  CreateQcChecklistDto,
  CreateDefectTypeDto,
} from '../dto/qc.dto';

@Injectable()
export class QcMasterService {
  // ================================================================
  // QC PARAMETERS
  // ================================================================

  async findAllParameters(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('qc_parameters')
      .where('is_active', '=', true)
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async createParameter(db: Kysely<TenantSchema>, dto: CreateQcParameterDto) {
    const existing = await db
      .selectFrom('qc_parameters')
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Parameter dengan kode "${dto.code}" sudah ada`,
      );
    }

    const [param] = await db
      .insertInto('qc_parameters')
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description ?? null,
        value_type: dto.valueType,
        min_value: dto.minValue !== undefined ? String(dto.minValue) : null,
        max_value: dto.maxValue !== undefined ? String(dto.maxValue) : null,
        unit: dto.unit ?? null,
      })
      .returningAll()
      .execute();

    return param;
  }

  async deactivateParameter(db: Kysely<TenantSchema>, parameterId: number) {
    // Cek apakah parameter masih dipakai di checklist aktif
    const inUse = await db
      .selectFrom('qc_checklist_items as qci')
      .innerJoin('qc_checklists as qc', 'qc.id', 'qci.checklist_id')
      .where('qci.parameter_id', '=', parameterId)
      .where('qc.is_active', '=', true)
      .select('qci.id')
      .executeTakeFirst();

    if (inUse) {
      throw new ConflictException(
        'Parameter masih digunakan di checklist aktif. ' +
          'Nonaktifkan checklist terlebih dahulu.',
      );
    }

    await db
      .updateTable('qc_parameters')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', parameterId)
      .execute();

    return { message: 'Parameter berhasil dinonaktifkan' };
  }

  // ================================================================
  // QC CHECKLISTS
  // ================================================================

  async findAllChecklists(
    db: Kysely<TenantSchema>,
    inspectionType?: string,
  ) {
    let query = db
      .selectFrom('qc_checklists as qc')
      .leftJoin(
        'product_categories as pc',
        'pc.id',
        'qc.product_category_id',
      )
      .where('qc.is_active', '=', true)
      .select([
        'qc.id',
        'qc.name',
        'qc.inspection_type',
        'qc.notes',
        'qc.created_at',
        'pc.name as category_name',
      ]);

    if (inspectionType) {
      query = query.where('qc.inspection_type', '=', inspectionType as any);
    }

    return query.orderBy('qc.name', 'asc').execute();
  }

  async findOneChecklist(db: Kysely<TenantSchema>, checklistId: number) {
    const checklist = await db
      .selectFrom('qc_checklists as qc')
      .leftJoin(
        'product_categories as pc',
        'pc.id',
        'qc.product_category_id',
      )
      .where('qc.id', '=', checklistId)
      .select([
        'qc.id',
        'qc.name',
        'qc.inspection_type',
        'qc.product_category_id',
        'qc.notes',
        'qc.is_active',
        'qc.created_by',
        'qc.created_at',
        'pc.name as category_name',
      ])
      .executeTakeFirst();

    if (!checklist) throw new NotFoundException('Checklist tidak ditemukan');

    const items = await db
      .selectFrom('qc_checklist_items as qci')
      .innerJoin('qc_parameters as qp', 'qp.id', 'qci.parameter_id')
      .where('qci.checklist_id', '=', checklistId)
      .select([
        'qci.id',
        'qci.sequence',
        'qci.is_required',
        'qci.notes',
        'qp.id as parameter_id',
        'qp.code',
        'qp.name',
        'qp.value_type',
        'qp.min_value',
        'qp.max_value',
        'qp.unit',
      ])
      .orderBy('qci.sequence', 'asc')
      .execute();

    return { ...checklist, items };
  }

  async createChecklist(
    db: Kysely<TenantSchema>,
    dto: CreateQcChecklistDto,
    createdBy: number,
  ) {
    if (!dto.items.length) {
      throw new ConflictException(
        'Checklist harus memiliki minimal satu parameter',
      );
    }

    return db.transaction().execute(async (trx) => {
      const [checklist] = await trx
        .insertInto('qc_checklists')
        .values({
          name: dto.name,
          inspection_type: dto.inspectionType,
          product_category_id: dto.productCategoryId ?? null,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('qc_checklist_items')
        .values(
          dto.items.map((item) => ({
            checklist_id: checklist.id,
            parameter_id: item.parameterId,
            sequence: item.sequence,
            is_required: item.isRequired ?? true,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOneChecklist(trx, checklist.id);
    });
  }

  async deactivateChecklist(db: Kysely<TenantSchema>, checklistId: number) {
    await db
      .updateTable('qc_checklists')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', checklistId)
      .execute();

    return { message: 'Checklist berhasil dinonaktifkan' };
  }

  // ================================================================
  // DEFECT TYPES
  // ================================================================

  async findAllDefectTypes(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('qc_defect_types')
      .where('is_active', '=', true)
      .selectAll()
      .orderBy('severity', 'asc')
      .orderBy('name', 'asc')
      .execute();
  }

  async createDefectType(
    db: Kysely<TenantSchema>,
    dto: CreateDefectTypeDto,
  ) {
    const existing = await db
      .selectFrom('qc_defect_types')
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Defect type dengan kode "${dto.code}" sudah ada`,
      );
    }

    const [defectType] = await db
      .insertInto('qc_defect_types')
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name,
        severity: dto.severity,
      })
      .returningAll()
      .execute();

    return defectType;
  }
}
