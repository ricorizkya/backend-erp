import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateGoodsReceiptDto, PaginationDto } from '../dto/purchase-order.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { PurchaseOrderService } from './purchase-order.service';

@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly poService: PurchaseOrderService,
  ) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('goods_receipts as gr')
      .innerJoin('purchase_orders as po', 'po.id', 'gr.po_id')
      .innerJoin('suppliers as s', 's.id', 'po.supplier_id')
      .innerJoin('warehouses as w', 'w.id', 'gr.warehouse_id')
      .select([
        'gr.id',
        'gr.number',
        'gr.receipt_date',
        'gr.status',
        'gr.supplier_do_number',
        'gr.notes',
        'gr.created_at',
        'gr.confirmed_at',
        'po.number as po_number',
        's.name as supplier_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ]);

    if (status) query = query.where('gr.status', '=', status as any);
    if (dateFrom) query = query.where('gr.receipt_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('gr.receipt_date', '<=', new Date(dateTo));
    if (search) query = query.where('gr.number', 'ilike', `%${search}%`);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('gr.receipt_date', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, grId: number) {
    const gr = await db
      .selectFrom('goods_receipts as gr')
      .innerJoin('purchase_orders as po', 'po.id', 'gr.po_id')
      .innerJoin('suppliers as s', 's.id', 'po.supplier_id')
      .innerJoin('warehouses as w', 'w.id', 'gr.warehouse_id')
      .where('gr.id', '=', grId)
      .select([
        'gr.id',
        'gr.number',
        'gr.po_id',
        'gr.receipt_date',
        'gr.status',
        'gr.supplier_do_number',
        'gr.inventory_movement_id',
        'gr.notes',
        'gr.created_by',
        'gr.created_at',
        'gr.confirmed_by',
        'gr.confirmed_at',
        'po.number as po_number',
        's.name as supplier_name',
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
      ])
      .executeTakeFirst();

    if (!gr) throw new NotFoundException('Goods Receipt tidak ditemukan');

    const items = await db
      .selectFrom('goods_receipt_items as gri')
      .innerJoin('product_variants as pv', 'pv.id', 'gri.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'gri.uom_id')
      .leftJoin('batches as b', 'b.id', 'gri.batch_id')
      .where('gri.gr_id', '=', grId)
      .select([
        'gri.id',
        'gri.po_item_id',
        'gri.quantity_received',
        'gri.notes',
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

    return { ...gr, items };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateGoodsReceiptDto,
    createdBy: number,
  ) {
    // Validasi PO
    const po = await db
      .selectFrom('purchase_orders')
      .where('id', '=', dto.poId)
      .where('status', 'in', ['confirmed', 'partial'])
      .select(['id', 'warehouse_id'])
      .executeTakeFirst();

    if (!po) {
      throw new NotFoundException(
        'Purchase Order tidak ditemukan atau belum dikonfirmasi',
      );
    }

    // Validasi setiap item — quantity tidak boleh melebihi pending
    await this.validateGrItems(db, dto.items);

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'GR');

      const [gr] = await trx
        .insertInto('goods_receipts')
        .values({
          number,
          po_id: dto.poId,
          warehouse_id: po.warehouse_id,
          receipt_date: dto.receiptDate
            ? new Date(dto.receiptDate)
            : new Date(),
          supplier_do_number: dto.supplierDoNumber ?? null,
          status: 'draft',
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('goods_receipt_items')
        .values(
          dto.items.map((item) => ({
            gr_id: gr.id,
            po_item_id: item.poItemId,
            variant_id: item.variantId,
            batch_id: item.batchId ?? null,
            quantity_received: item.quantityReceived,
            uom_id: item.uomId,
            location_id: item.locationId ?? null,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, gr.id);
    });
  }

  // ----------------------------------------------------------------
  // CONFIRM
  // Trigger: inventory movement PURCHASE_RECEIPT + update PO status
  // ----------------------------------------------------------------

  async confirm(
    db: Kysely<TenantSchema>,
    grId: number,
    confirmedBy: number,
  ) {
    const gr = await db
      .selectFrom('goods_receipts')
      .where('id', '=', grId)
      .select(['id', 'status', 'po_id', 'warehouse_id'])
      .executeTakeFirst();

    if (!gr) throw new NotFoundException('Goods Receipt tidak ditemukan');

    if (gr.status !== 'draft') {
      throw new ConflictException(
        `Hanya GR berstatus draft yang bisa dikonfirmasi. Status: ${gr.status}`,
      );
    }

    return db.transaction().execute(async (trx) => {
      // 1. Ambil movement type PURCHASE_RECEIPT
      const movType = await trx
        .selectFrom('inventory_movement_types')
        .where('code', '=', 'PURCHASE_RECEIPT')
        .select('id')
        .executeTakeFirst();

      if (!movType)
        throw new Error('Movement type PURCHASE_RECEIPT tidak ditemukan');

      // 2. Buat inventory movement header
      const [movement] = await trx
        .insertInto('inventory_movements')
        .values({
          movement_type_id: movType.id,
          reference_type: 'goods_receipt',
          reference_id: grId,
          movement_date: new Date(),
          status: 'confirmed',
          notes: `GR ${grId}`,
          created_by: confirmedBy,
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
        })
        .returningAll()
        .execute();

      // 3. Ambil GR items + unit_cost dari PO
      const grItems = await trx
        .selectFrom('goods_receipt_items as gri')
        .innerJoin('purchase_order_items as poi', 'poi.id', 'gri.po_item_id')
        .where('gri.gr_id', '=', grId)
        .select([
          'gri.variant_id',
          'gri.batch_id',
          'gri.quantity_received',
          'gri.uom_id',
          'gri.location_id',
          'poi.unit_price as unit_cost',
        ])
        .execute();

      // 4. Insert inventory movement items
      await trx
        .insertInto('inventory_movement_items')
        .values(
          grItems.map((item) => ({
            movement_id: movement.id,
            variant_id: item.variant_id,
            batch_id: item.batch_id ?? null,
            to_warehouse_id: gr.warehouse_id,
            to_location_id: item.location_id ?? null,
            quantity: item.quantity_received,
            uom_id: item.uom_id,
            unit_cost: Number(item.unit_cost),
          })),
        )
        .execute();

      // 5. Update GR status
      await trx
        .updateTable('goods_receipts')
        .set({
          status: 'confirmed',
          inventory_movement_id: movement.id,
          confirmed_by: confirmedBy,
          confirmed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', grId)
        .execute();

      // 6. Refresh stock_summary
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY stock_summary`.execute(
        trx,
      );

      // 7. Update PO received quantities + status
      await this.poService.updateReceivedQuantity(trx, gr.po_id);

      return this.findOne(trx, grId);
    });
  }

  // ----------------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------------

  private async validateGrItems(
    db: Kysely<TenantSchema>,
    items: CreateGoodsReceiptDto['items'],
  ) {
    for (const item of items) {
      const poItem = await db
        .selectFrom('purchase_order_items')
        .where('id', '=', item.poItemId)
        .select(['quantity', 'quantity_pending', 'variant_id'])
        .executeTakeFirst();

      if (!poItem) {
        throw new NotFoundException(
          `PO item ${item.poItemId} tidak ditemukan`,
        );
      }

      // Pastikan variant sesuai dengan PO item
      if (poItem.variant_id !== item.variantId) {
        throw new BadRequestException(
          `Variant tidak sesuai dengan PO item ${item.poItemId}`,
        );
      }

      const pending = Number(poItem.quantity_pending ?? poItem.quantity);
      if (item.quantityReceived > pending) {
        throw new BadRequestException(
          `Quantity melebihi sisa pending PO item. ` +
            `Pending: ${pending}, diterima: ${item.quantityReceived}`,
        );
      }
    }
  }
}
