import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from '../dto/product.dto';

@Injectable()
export class ProductCategoryService {
  // Kembalikan sebagai flat list dengan informasi parent
  // Frontend yang bertanggung jawab membangun tree UI
  async findAll(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('product_categories as pc')
      .leftJoin('product_categories as parent', 'parent.id', 'pc.parent_id')
      .select([
        'pc.id',
        'pc.name',
        'pc.parent_id',
        'parent.name as parent_name',
        'pc.created_at',
      ])
      .orderBy('pc.name', 'asc')
      .execute();
  }

  async create(db: Kysely<TenantSchema>, dto: CreateProductCategoryDto) {
    if (dto.parentId) {
      const parent = await db
        .selectFrom('product_categories')
        .where('id', '=', dto.parentId)
        .select('id')
        .executeTakeFirst();

      if (!parent) {
        throw new NotFoundException('Kategori parent tidak ditemukan');
      }
    }

    const [category] = await db
      .insertInto('product_categories')
      .values({
        name: dto.name,
        parent_id: dto.parentId ?? null,
      })
      .returningAll()
      .execute();

    return category;
  }

  async update(
    db: Kysely<TenantSchema>,
    categoryId: number,
    dto: UpdateProductCategoryDto,
  ) {
    const category = await db
      .selectFrom('product_categories')
      .where('id', '=', categoryId)
      .select('id')
      .executeTakeFirst();

    if (!category) throw new NotFoundException('Kategori tidak ditemukan');

    // Cegah kategori menjadi child dari dirinya sendiri
    if (dto.parentId === categoryId) {
      throw new BadRequestException(
        'Kategori tidak bisa menjadi parent dari dirinya sendiri',
      );
    }

    const [updated] = await db
      .updateTable('product_categories')
      .set({
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined
          ? { parent_id: dto.parentId ?? null }
          : {}),
      })
      .where('id', '=', categoryId)
      .returningAll()
      .execute();

    return updated;
  }

  async delete(db: Kysely<TenantSchema>, categoryId: number) {
    // Cek apakah ada subcategory
    const hasChildren = await db
      .selectFrom('product_categories')
      .where('parent_id', '=', categoryId)
      .select('id')
      .executeTakeFirst();

    if (hasChildren) {
      throw new ConflictException('Kategori ini masih memiliki sub-kategori');
    }

    // Cek apakah ada produk
    const hasProducts = await db
      .selectFrom('products')
      .where('category_id', '=', categoryId)
      .select('id')
      .executeTakeFirst();

    if (hasProducts) {
      throw new ConflictException('Kategori ini masih digunakan oleh produk');
    }

    await db
      .deleteFrom('product_categories')
      .where('id', '=', categoryId)
      .execute();

    return { message: 'Kategori berhasil dihapus' };
  }
}
