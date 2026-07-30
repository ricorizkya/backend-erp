import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreatePurchaseRequestDto,
  ApprovePrDto,
  RejectPrDto,
  PaginationDto,
} from '../dto/purchase-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';

@Injectable()
export class PurchaseRequestService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('purchase_requests as pr')
      .innerJoin('warehouses as w', 'w.id', 'pr.warehouse_id')
      .select([
        'pr.id',
        'pr.number',
        'pr.request_date',
        'pr.needed_date',
        'pr.status',
        'pr.notes',
        'pr.created_by',
        'pr.created_at',
        'pr.approved_at',
        'pr.rejected_at',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('pr.status', '=', status as any);
    if (dateFrom) query = query.where('pr.request_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('pr.request_date', '<=', new Date(dateTo));
    if (search) query = query.where('pr.number', 'ilike', `%${search}%`);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('pr.request_date', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, prId: number) {
    const pr = await db
      .selectFrom('purchase_requests as pr')
      .innerJoin('warehouses as w', 'w.id', 'pr.warehouse_id')
      .where('pr.id', '=', prId)
      .select([
        'pr.id',
        'pr.number',
        'pr.request_date',
        'pr.needed_date',
        'pr.status',
        'pr.notes',
        'pr.rejection_notes',
        'pr.created_by',
        'pr.created_at',
        'pr.submitted_by',
        'pr.submitted_at',
        'pr.approved_by',
        'pr.approved_at',
        'pr.rejected_by',
        'pr.rejected_at',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!pr) throw new NotFoundException('Purchase Request tidak ditemukan');

    const items = await db
      .selectFrom('purchase_request_items as pri')
      .innerJoin('product_variants as pv', 'pv.id', 'pri.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'pri.uom_id')
      .where('pri.pr_id', '=', prId)
      .select([
        'pri.id',
        'pri.quantity',
        'pri.estimated_price',
        'pri.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    return { ...pr, items };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreatePurchaseRequestDto,
    createdBy: number,
  ) {
    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.warehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'PR');

      const [pr] = await trx
        .insertInto('purchase_requests')
        .values({
          number,
          warehouse_id: dto.warehouseId,
          request_date: new Date(),
          needed_date: dto.neededDate ? new Date(dto.neededDate) : null,
          status: 'draft',
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('purchase_request_items')
        .values(
          dto.items.map((item) => ({
            pr_id: pr.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            uom_id: item.uomId,
            estimated_price: item.estimatedPrice ?? 0,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, pr.id);
    });
  }

  // ----------------------------------------------------------------
  // SUBMIT (draft → submitted)
  // ----------------------------------------------------------------

  async submit(
    db: Kysely<TenantSchema>,
    prId: number,
    submittedBy: number,
  ) {
    const pr = await this.getPrOrThrow(db, prId);

    if (pr.status !== 'draft') {
      throw new ConflictException(
        `Hanya PR berstatus draft yang bisa disubmit. Status: ${pr.status}`,
      );
    }

    const [updated] = await db
      .updateTable('purchase_requests')
      .set({
        status: 'submitted',
        submitted_by: submittedBy,
        submitted_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', prId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // APPROVE (submitted → approved)
  // ----------------------------------------------------------------

  async approve(
    db: Kysely<TenantSchema>,
    prId: number,
    approvedBy: number,
    dto: ApprovePrDto,
  ) {
    const pr = await this.getPrOrThrow(db, prId);

    if (pr.status !== 'submitted') {
      throw new ConflictException(
        `Hanya PR berstatus submitted yang bisa diapprove. Status: ${pr.status}`,
      );
    }

    const [updated] = await db
      .updateTable('purchase_requests')
      .set({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date(),
        notes: dto.notes ?? pr.notes,
        updated_at: new Date(),
      })
      .where('id', '=', prId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // REJECT (submitted → rejected)
  // ----------------------------------------------------------------

  async reject(
    db: Kysely<TenantSchema>,
    prId: number,
    rejectedBy: number,
    dto: RejectPrDto,
  ) {
    const pr = await this.getPrOrThrow(db, prId);

    if (pr.status !== 'submitted') {
      throw new ConflictException(
        `Hanya PR berstatus submitted yang bisa direject. Status: ${pr.status}`,
      );
    }

    const [updated] = await db
      .updateTable('purchase_requests')
      .set({
        status: 'rejected',
        rejected_by: rejectedBy,
        rejected_at: new Date(),
        rejection_notes: dto.rejectionNotes,
        updated_at: new Date(),
      })
      .where('id', '=', prId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // CLOSE (approved → closed, saat sudah jadi PO)
  // Dipanggil internal oleh PO service
  // ----------------------------------------------------------------

  async close(db: Kysely<TenantSchema>, prId: number) {
    await db
      .updateTable('purchase_requests')
      .set({ status: 'closed', updated_at: new Date() })
      .where('id', '=', prId)
      .execute();
  }

  private async getPrOrThrow(db: Kysely<TenantSchema>, prId: number) {
    const pr = await db
      .selectFrom('purchase_requests')
      .where('id', '=', prId)
      .select(['id', 'status', 'notes'])
      .executeTakeFirst();

    if (!pr) throw new NotFoundException('Purchase Request tidak ditemukan');
    return pr;
  }
}
