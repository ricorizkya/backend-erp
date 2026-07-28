import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
} from '../dto/product.dto';

@Injectable()
export class AttributeService {
  async findAll(db: Kysely<TenantSchema>) {
    const attributes = await db
      .selectFrom('attributes')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();

    // Ambil values untuk setiap attribute
    const attributeIds = attributes.map((a) => a.id);
    if (attributeIds.length === 0) return [];

    const values = await db
      .selectFrom('attribute_values')
      .whereRef('attribute_id', 'in', attributeIds as any)
      .selectAll()
      .orderBy('value', 'asc')
      .execute();

    // Group values by attribute_id
    const valuesMap = values.reduce<Record<string, typeof values>>((acc, v) => {
      if (!acc[v.attribute_id]) acc[v.attribute_id] = [];
      acc[v.attribute_id].push(v);
      return acc;
    }, {});

    return attributes.map((attr) => ({
      ...attr,
      values: valuesMap[attr.id] ?? [],
    }));
  }

  async create(db: Kysely<TenantSchema>, dto: CreateAttributeDto) {
    const existing = await db
      .selectFrom('attributes')
      .where('name', '=', dto.name)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Atribut "${dto.name}" sudah ada`);
    }

    const [attribute] = await db
      .insertInto('attributes')
      .values({ name: dto.name })
      .returningAll()
      .execute();

    return { ...attribute, values: [] };
  }

  async addValue(
    db: Kysely<TenantSchema>,
    attributeId: number,
    dto: CreateAttributeValueDto,
  ) {
    const attribute = await db
      .selectFrom('attributes')
      .where('id', '=', attributeId)
      .select('id')
      .executeTakeFirst();

    if (!attribute) {
      throw new NotFoundException('Atribut tidak ditemukan');
    }

    const existing = await db
      .selectFrom('attribute_values')
      .where('attribute_id', '=', attributeId)
      .where('value', '=', dto.value)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Nilai "${dto.value}" sudah ada di atribut ini`,
      );
    }

    const [value] = await db
      .insertInto('attribute_values')
      .values({ attribute_id: attributeId, value: dto.value })
      .returningAll()
      .execute();

    return value;
  }

  async deleteValue(db: Kysely<TenantSchema>, valueId: number) {
    // Cek apakah value masih dipakai oleh variant
    const inUse = await db
      .selectFrom('product_variant_attributes')
      .where('attribute_value_id', '=', valueId)
      .select('variant_id')
      .executeTakeFirst();

    if (inUse) {
      throw new ConflictException(
        'Nilai atribut ini masih digunakan oleh variant produk',
      );
    }

    await db.deleteFrom('attribute_values').where('id', '=', valueId).execute();

    return { message: 'Nilai atribut berhasil dihapus' };
  }
}
