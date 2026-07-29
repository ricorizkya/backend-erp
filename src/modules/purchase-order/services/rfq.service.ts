import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateRfqDto,
  SubmitRfqQuoteDto,
  PaginationDto,
} from '../dto/purchase-order.dto';
import { DocumentNumberService } from './document-number.service';

@Injectable()
export class RfqService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('rfqs')
      .select([
        'id',
        'number',
        'rfq_date',
        'deadline_date',
        'status',
        'notes',
        'created_by',
        'created_at',
      ]);

    if (status) query = query.where('status', '=', status as any);
    if (dateFrom) query = query.where('rfq_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('rfq_date', '<=', new Date(dateTo));
    if (search) query = query.where('number', 'ilike', `%${search}%`);

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('rfq_date', 'desc')
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

  async findOne(db: Kysely<TenantSchema>, rfqId: number) {
    const rfq = await db
      .selectFrom('rfqs')
      .where('id', '=', rfqId)
      .selectAll()
      .executeTakeFirst();

    if (!rfq) throw new NotFoundException('RFQ tidak ditemukan');

    // Items
    const items = await db
      .selectFrom('rfq_items as ri')
      .innerJoin('product_variants as pv', 'pv.id', 'ri.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'ri.uom_id')
      .where('ri.rfq_id', '=', rfqId)
      .select([
        'ri.id',
        'ri.quantity',
        'ri.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'u.symbol as uom_symbol',
      ])
      .execute();

    // Supplier quotes
    const quotes = await db
      .selectFrom('rfq_supplier_quotes as rsq')
      .innerJoin('suppliers as s', 's.id', 'rsq.supplier_id')
      .where('rsq.rfq_id', '=', rfqId)
      .select([
        'rsq.id',
        'rsq.supplier_id',
        'rsq.quote_date',
        'rsq.valid_until',
        'rsq.status',
        'rsq.notes',
        's.code as supplier_code',
        's.name as supplier_name',
      ])
      .execute();

    // Quote items per quote
    const quoteIds = quotes.map((q) => q.id);
    const quoteItems =
      quoteIds.length > 0
        ? await db
            .selectFrom('rfq_supplier_quote_items as rsqi')
            .innerJoin('rfq_items as ri', 'ri.id', 'rsqi.rfq_item_id')
            .innerJoin('uom as u', 'u.id', 'rsqi.uom_id')
            .where('rsqi.quote_id', 'in', quoteIds)
            .select([
              'rsqi.id',
              'rsqi.quote_id',
              'rsqi.rfq_item_id',
              'rsqi.unit_price',
              'rsqi.quantity',
              'rsqi.lead_time_days',
              'rsqi.notes',
              'u.symbol as uom_symbol',
            ])
            .execute()
        : [];

    const quotesWithItems = quotes.map((q) => ({
      ...q,
      items: quoteItems.filter((qi) => qi.quote_id === q.id),
    }));

    return { ...rfq, items, quotes: quotesWithItems };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateRfqDto,
    createdBy: number,
  ) {
    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'RFQ');

      const [rfq] = await trx
        .insertInto('rfqs')
        .values({
          number,
          rfq_date: new Date(),
          deadline_date: dto.deadlineDate ? new Date(dto.deadlineDate) : null,
          status: 'draft',
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Insert items
      const rfqItems = await trx
        .insertInto('rfq_items')
        .values(
          dto.items.map((item) => ({
            rfq_id: rfq.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            uom_id: item.uomId,
            notes: item.notes ?? null,
          })),
        )
        .returningAll()
        .execute();

      // Map PR items ke RFQ items jika ada
      const mappings = dto.items
        .flatMap((item, idx) => {
          const rfqItem = rfqItems[idx];
          return (item.prItemIds ?? []).map((prItemId) => ({
            rfq_item_id: rfqItem.id,
            pr_item_id: prItemId,
          }));
        })
        .filter((m) => m.rfq_item_id && m.pr_item_id);

      if (mappings.length > 0) {
        await trx
          .insertInto('rfq_item_pr_items')
          .values(mappings)
          .execute();
      }

      return this.findOne(trx, rfq.id);
    });
  }

  // ----------------------------------------------------------------
  // SEND (draft → sent)
  // ----------------------------------------------------------------

  async send(db: Kysely<TenantSchema>, rfqId: number) {
    const rfq = await this.getRfqOrThrow(db, rfqId);

    if (rfq.status !== 'draft') {
      throw new ConflictException(
        `Hanya RFQ berstatus draft yang bisa dikirim. Status: ${rfq.status}`,
      );
    }

    const [updated] = await db
      .updateTable('rfqs')
      .set({ status: 'sent', updated_at: new Date() })
      .where('id', '=', rfqId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // SUBMIT SUPPLIER QUOTE
  // Supplier reply dengan penawaran harga
  // ----------------------------------------------------------------

  async submitQuote(
    db: Kysely<TenantSchema>,
    rfqId: number,
    dto: SubmitRfqQuoteDto,
  ) {
    const rfq = await this.getRfqOrThrow(db, rfqId);

    if (!['sent', 'draft'].includes(rfq.status)) {
      throw new ConflictException(
        'Quote hanya bisa disubmit untuk RFQ berstatus draft atau sent',
      );
    }

    // Validasi supplier
    const supplier = await db
      .selectFrom('suppliers')
      .where('id', '=', dto.supplierId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!supplier) throw new NotFoundException('Supplier tidak ditemukan');

    // Cek apakah supplier sudah punya quote untuk RFQ ini
    const existing = await db
      .selectFrom('rfq_supplier_quotes')
      .where('rfq_id', '=', rfqId)
      .where('supplier_id', '=', dto.supplierId)
      .select('id')
      .executeTakeFirst();

    return db.transaction().execute(async (trx) => {
      let quoteId: number;

      if (existing) {
        // Update quote yang sudah ada
        const [updated] = await trx
          .updateTable('rfq_supplier_quotes')
          .set({
            status: 'received',
            quote_date: new Date(),
            valid_until: dto.validUntil ? new Date(dto.validUntil) : null,
            notes: dto.notes ?? null,
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .returningAll()
          .execute();

        quoteId = updated.id;

        // Hapus quote items lama
        await trx
          .deleteFrom('rfq_supplier_quote_items')
          .where('quote_id', '=', quoteId)
          .execute();
      } else {
        // Insert quote baru
        const [quote] = await trx
          .insertInto('rfq_supplier_quotes')
          .values({
            rfq_id: rfqId,
            supplier_id: dto.supplierId,
            quote_date: new Date(),
            valid_until: dto.validUntil ? new Date(dto.validUntil) : null,
            status: 'received',
            notes: dto.notes ?? null,
          })
          .returningAll()
          .execute();

        quoteId = quote.id;
      }

      // Insert quote items
      await trx
        .insertInto('rfq_supplier_quote_items')
        .values(
          dto.items.map((item) => ({
            quote_id: quoteId,
            rfq_item_id: item.rfqItemId,
            unit_price: item.unitPrice,
            quantity: item.quantity,
            uom_id: item.uomId,
            lead_time_days: item.leadTimeDays ?? 0,
            notes: item.notes ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, rfqId);
    });
  }

  // ----------------------------------------------------------------
  // SELECT QUOTE (tandai quote terpilih, reject sisanya)
  // ----------------------------------------------------------------

  async selectQuote(
    db: Kysely<TenantSchema>,
    rfqId: number,
    quoteId: number,
  ) {
    await this.getRfqOrThrow(db, rfqId);

    const quote = await db
      .selectFrom('rfq_supplier_quotes')
      .where('id', '=', quoteId)
      .where('rfq_id', '=', rfqId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!quote) throw new NotFoundException('Quote tidak ditemukan');

    if (quote.status !== 'received') {
      throw new ConflictException('Hanya quote berstatus received yang bisa dipilih');
    }

    return db.transaction().execute(async (trx) => {
      // Set semua quote lain jadi rejected
      await trx
        .updateTable('rfq_supplier_quotes')
        .set({ status: 'rejected', updated_at: new Date() })
        .where('rfq_id', '=', rfqId)
        .where('id', '!=', quoteId)
        .execute();

      // Set quote ini jadi selected
      await trx
        .updateTable('rfq_supplier_quotes')
        .set({ status: 'selected', updated_at: new Date() })
        .where('id', '=', quoteId)
        .execute();

      // Close RFQ
      await trx
        .updateTable('rfqs')
        .set({ status: 'closed', updated_at: new Date() })
        .where('id', '=', rfqId)
        .execute();

      return this.findOne(trx, rfqId);
    });
  }

  private async getRfqOrThrow(db: Kysely<TenantSchema>, rfqId: number) {
    const rfq = await db
      .selectFrom('rfqs')
      .where('id', '=', rfqId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!rfq) throw new NotFoundException('RFQ tidak ditemukan');
    return rfq;
  }
}
