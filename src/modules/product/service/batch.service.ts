import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateBatchDto } from '../dto/product.dto';

@Injectable()
export class BatchService {
  async findByVariant(db: Kysely<TenantSchema>, variantId: number) {
    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', variantId)
      .select('id')
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    return db
      .selectFrom('batches')
      .where('variant_id', '=', variantId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async create(db: Kysely<TenantSchema>, dto: CreateBatchDto) {
    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', dto.variantId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!variant) {
      throw new NotFoundException('Variant tidak ditemukan atau tidak aktif');
    }

    // Batch number harus unik per variant
    const existing = await db
      .selectFrom('batches')
      .where('variant_id', '=', dto.variantId)
      .where('batch_number', '=', dto.batchNumber)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Batch number "${dto.batchNumber}" sudah ada untuk variant ini`,
      );
    }

    const [batch] = await db
      .insertInto('batches')
      .values({
        variant_id: dto.variantId,
        batch_number: dto.batchNumber,
        manufacture_date: dto.manufactureDate
          ? new Date(dto.manufactureDate)
          : null,
        expiry_date: dto.expiryDate ? new Date(dto.expiryDate) : null,
        origin: dto.origin ?? null,
        notes: dto.notes ?? null,
      })
      .returningAll()
      .execute();

    return batch;
  }

  async findOne(db: Kysely<TenantSchema>, batchId: number) {
    const batch = await db
      .selectFrom('batches as b')
      .innerJoin('product_variants as pv', 'pv.id', 'b.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .where('b.id', '=', batchId)
      .select([
        'b.id',
        'b.batch_number',
        'b.manufacture_date',
        'b.expiry_date',
        'b.origin',
        'b.notes',
        'b.created_at',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
      ])
      .executeTakeFirst();

    if (!batch) throw new NotFoundException('Batch tidak ditemukan');
    return batch;
  }
}
