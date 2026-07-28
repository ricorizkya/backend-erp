import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductFilterDto,
  CreateVariantDto,
  UpdateVariantDto,
} from '../dto/product.dto';

@Injectable()
export class ProductService {
  // ----------------------------------------------------------------
  // LIST PRODUCTS
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: ProductFilterDto) {
    const {
      page,
      limit,
      search,
      categoryId,
      isActive,
      canBePurchased,
      canBeSold,
      canBeManufactured,
    } = filter;

    let query = db
      .selectFrom('products as p')
      .leftJoin('product_categories as pc', 'pc.id', 'p.category_id')
      .leftJoin('uom as base_uom', 'base_uom.id', 'p.base_uom_id')
      .leftJoin('uom as purchase_uom', 'purchase_uom.id', 'p.purchase_uom_id')
      .leftJoin('uom as sales_uom', 'sales_uom.id', 'p.sales_uom_id')
      .select([
        'p.id',
        'p.code',
        'p.name',
        'p.description',
        'p.has_variant',
        'p.can_be_purchased',
        'p.can_be_sold',
        'p.can_be_manufactured',
        'p.is_active',
        'p.created_at',
        'p.updated_at',
        'pc.name as category_name',
        'base_uom.symbol as base_uom_symbol',
        'base_uom.name as base_uom_name',
        'purchase_uom.symbol as purchase_uom_symbol',
        'sales_uom.symbol as sales_uom_symbol',
      ]);

    // Filters
    if (isActive !== undefined) {
      query = query.where('p.is_active', '=', isActive);
    }
    if (categoryId) {
      query = query.where('p.category_id', '=', categoryId);
    }
    if (canBePurchased !== undefined) {
      query = query.where('p.can_be_purchased', '=', canBePurchased);
    }
    if (canBeSold !== undefined) {
      query = query.where('p.can_be_sold', '=', canBeSold);
    }
    if (canBeManufactured !== undefined) {
      query = query.where('p.can_be_manufactured', '=', canBeManufactured);
    }
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('p.code', 'ilike', `%${search}%`),
          eb('p.name', 'ilike', `%${search}%`),
        ]),
      );
    }

    // Count total untuk pagination
    const countQuery = query
      .clearSelect()
      .select(db.fn.countAll<number>().as('total'));
    const countResult = await countQuery.executeTakeFirst();
    const total = Number(countResult?.total ?? 0);

    // Data dengan pagination
    const offset = (page - 1) * limit;
    const data = await query
      .orderBy('p.name', 'asc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ----------------------------------------------------------------
  // GET DETAIL PRODUCT + VARIANTS
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, productId: number) {
    const product = await db
      .selectFrom('products as p')
      .leftJoin('product_categories as pc', 'pc.id', 'p.category_id')
      .leftJoin('uom as base_uom', 'base_uom.id', 'p.base_uom_id')
      .leftJoin('uom as purchase_uom', 'purchase_uom.id', 'p.purchase_uom_id')
      .leftJoin('uom as sales_uom', 'sales_uom.id', 'p.sales_uom_id')
      .where('p.id', '=', productId)
      .select([
        'p.id',
        'p.code',
        'p.name',
        'p.description',
        'p.category_id',
        'p.base_uom_id',
        'p.purchase_uom_id',
        'p.sales_uom_id',
        'p.has_variant',
        'p.can_be_purchased',
        'p.can_be_sold',
        'p.can_be_manufactured',
        'p.is_active',
        'p.created_at',
        'p.updated_at',
        'pc.name as category_name',
        'base_uom.name as base_uom_name',
        'base_uom.symbol as base_uom_symbol',
        'purchase_uom.name as purchase_uom_name',
        'purchase_uom.symbol as purchase_uom_symbol',
        'sales_uom.name as sales_uom_name',
        'sales_uom.symbol as sales_uom_symbol',
      ])
      .executeTakeFirst();

    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    // Ambil variants beserta attributesnya
    const variants = await this.getVariantsWithAttributes(db, productId);

    return { ...product, variants };
  }

  // ----------------------------------------------------------------
  // CREATE PRODUCT
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateProductDto,
    createdBy: number,
  ) {
    // Cek duplikasi kode
    const existing = await db
      .selectFrom('products')
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Kode produk "${dto.code}" sudah digunakan`);
    }

    // Validasi UoM exists
    await this.validateUomIds(db, [
      dto.baseUomId,
      dto.purchaseUomId,
      dto.salesUomId,
    ]);

    return db.transaction().execute(async (trx) => {
      // Insert product
      const [product] = await trx
        .insertInto('products')
        .values({
          category_id: dto.categoryId ?? null,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          base_uom_id: dto.baseUomId,
          purchase_uom_id: dto.purchaseUomId,
          sales_uom_id: dto.salesUomId,
          can_be_purchased: dto.canBePurchased ?? true,
          can_be_sold: dto.canBeSold ?? true,
          can_be_manufactured: dto.canBeManufactured ?? false,
          has_variant: dto.hasVariant ?? false,
        })
        .returningAll()
        .execute();

      let variants: unknown[] = [];

      if (dto.hasVariant && dto.variants?.length) {
        // Buat variants yang dikirim
        variants = await this.createVariants(trx, product.id, dto.variants);
      } else {
        // Auto-create satu default variant jika tidak ada variant
        const defaultVariant = await this.createDefaultVariant(trx, product);
        variants = [defaultVariant];
      }

      return { ...product, variants };
    });
  }

  // ----------------------------------------------------------------
  // UPDATE PRODUCT
  // ----------------------------------------------------------------

  async update(
    db: Kysely<TenantSchema>,
    productId: number,
    dto: UpdateProductDto,
  ) {
    const product = await db
      .selectFrom('products')
      .where('id', '=', productId)
      .select(['id', 'code'])
      .executeTakeFirst();

    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    if (dto.baseUomId || dto.purchaseUomId || dto.salesUomId) {
      await this.validateUomIds(
        db,
        [dto.baseUomId, dto.purchaseUomId, dto.salesUomId].filter(
          Boolean,
        ) as number[],
      );
    }

    const [updated] = await db
      .updateTable('products')
      .set({
        ...(dto.categoryId !== undefined
          ? { category_id: dto.categoryId ?? null }
          : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? null }
          : {}),
        ...(dto.baseUomId ? { base_uom_id: dto.baseUomId } : {}),
        ...(dto.purchaseUomId ? { purchase_uom_id: dto.purchaseUomId } : {}),
        ...(dto.salesUomId ? { sales_uom_id: dto.salesUomId } : {}),
        ...(dto.canBePurchased !== undefined
          ? { can_be_purchased: dto.canBePurchased }
          : {}),
        ...(dto.canBeSold !== undefined ? { can_be_sold: dto.canBeSold } : {}),
        ...(dto.canBeManufactured !== undefined
          ? { can_be_manufactured: dto.canBeManufactured }
          : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', productId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // SOFT DELETE PRODUCT
  // ----------------------------------------------------------------

  async softDelete(db: Kysely<TenantSchema>, productId: number) {
    const product = await db
      .selectFrom('products')
      .where('id', '=', productId)
      .select('id')
      .executeTakeFirst();

    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    // Cek apakah produk masih digunakan di transaksi aktif
    // (PO, SO, WO yang masih open/confirmed)
    const inUsePo = await db
      .selectFrom('purchase_order_items as poi')
      .innerJoin('purchase_orders as po', 'po.id', 'poi.po_id')
      .innerJoin('product_variants as pv', 'pv.id', 'poi.variant_id')
      .where('pv.product_id', '=', productId)
      .where('po.status', 'in', ['draft', 'confirmed', 'partial'])
      .select('poi.id')
      .executeTakeFirst();

    if (inUsePo) {
      throw new ConflictException(
        'Produk masih memiliki Purchase Order yang aktif',
      );
    }

    await db
      .updateTable('products')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', productId)
      .execute();

    // Nonaktifkan semua variant
    await db
      .updateTable('product_variants')
      .set({ is_active: false, updated_at: new Date() })
      .where('product_id', '=', productId)
      .execute();

    return { message: 'Produk berhasil dinonaktifkan' };
  }

  // ----------------------------------------------------------------
  // VARIANT METHODS
  // ----------------------------------------------------------------

  async findVariants(db: Kysely<TenantSchema>, productId: number) {
    const product = await db
      .selectFrom('products')
      .where('id', '=', productId)
      .select('id')
      .executeTakeFirst();

    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    return this.getVariantsWithAttributes(db, productId);
  }

  async createVariant(
    db: Kysely<TenantSchema>,
    productId: number,
    dto: CreateVariantDto,
  ) {
    const product = await db
      .selectFrom('products')
      .where('id', '=', productId)
      .where('is_active', '=', true)
      .select(['id', 'has_variant'])
      .executeTakeFirst();

    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    if (!product.has_variant) {
      throw new BadRequestException(
        'Produk ini tidak dikonfigurasi untuk menggunakan variant',
      );
    }

    // Cek duplikasi SKU
    const existingSku = await db
      .selectFrom('product_variants')
      .where('sku', '=', dto.sku)
      .select('id')
      .executeTakeFirst();

    if (existingSku) {
      throw new ConflictException(`SKU "${dto.sku}" sudah digunakan`);
    }

    return db.transaction().execute(async (trx) => {
      const [variants] = await this.createVariants(trx, productId, [dto]);
      return variants;
    });
  }

  async updateVariant(
    db: Kysely<TenantSchema>,
    variantId: number,
    dto: UpdateVariantDto,
  ) {
    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', variantId)
      .select('id')
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    const [updated] = await db
      .updateTable('product_variants')
      .set({
        ...(dto.name !== undefined ? { name: dto.name ?? null } : {}),
        ...(dto.costPrice !== undefined ? { cost_price: dto.costPrice } : {}),
        ...(dto.salePrice !== undefined ? { sale_price: dto.salePrice } : {}),
        ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', variantId)
      .returningAll()
      .execute();

    return updated;
  }

  async softDeleteVariant(db: Kysely<TenantSchema>, variantId: number) {
    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', variantId)
      .select(['id', 'product_id'])
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    // Cek minimal harus ada 1 variant aktif per produk
    const activeCount = await db
      .selectFrom('product_variants')
      .where('product_id', '=', variant.product_id)
      .where('is_active', '=', true)
      .where('id', '!=', variantId)
      .select(db.fn.countAll<number>().as('count'))
      .executeTakeFirst();

    if (Number(activeCount?.count ?? 0) === 0) {
      throw new ConflictException(
        'Tidak bisa menghapus variant terakhir yang aktif. Nonaktifkan produknya jika tidak digunakan.',
      );
    }

    await db
      .updateTable('product_variants')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', variantId)
      .execute();

    return { message: 'Variant berhasil dinonaktifkan' };
  }

  // ----------------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------------

  private async getVariantsWithAttributes(
    db: Kysely<TenantSchema>,
    productId: number,
  ) {
    const variants = await db
      .selectFrom('product_variants')
      .where('product_id', '=', productId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    if (variants.length === 0) return [];

    const variantIds = variants.map((v) => v.id);

    // Ambil attributes untuk semua variants sekaligus (N+1 prevention)
    const attrValues = await db
      .selectFrom('product_variant_attributes as pva')
      .innerJoin('attribute_values as av', 'av.id', 'pva.attribute_value_id')
      .innerJoin('attributes as a', 'a.id', 'av.attribute_id')
      .where('pva.variant_id', 'in', variantIds as any)
      .select([
        'pva.variant_id',
        'av.id as value_id',
        'av.value',
        'a.id as attribute_id',
        'a.name as attribute_name',
      ])
      .execute();

    // Group by variant_id
    const attrMap = attrValues.reduce<Record<string, typeof attrValues>>(
      (acc, av) => {
        if (!acc[av.variant_id]) acc[av.variant_id] = [];
        acc[av.variant_id].push(av);
        return acc;
      },
      {},
    );

    return variants.map((v) => ({
      ...v,
      attributes: attrMap[v.id] ?? [],
    }));
  }

  private async createVariants(
    db: Kysely<TenantSchema>,
    productId: number,
    dtos: CreateVariantDto[],
  ) {
    const results: any[] = [];

    for (const dto of dtos) {
      // Cek duplikasi SKU
      const existingSku = await db
        .selectFrom('product_variants')
        .where('sku', '=', dto.sku)
        .select('id')
        .executeTakeFirst();

      if (existingSku) {
        throw new ConflictException(`SKU "${dto.sku}" sudah digunakan`);
      }

      const [variant] = await db
        .insertInto('product_variants')
        .values({
          product_id: productId,
          sku: dto.sku,
          name: dto.name ?? null,
          cost_price: dto.costPrice ?? 0,
          sale_price: dto.salePrice ?? 0,
          min_stock: dto.minStock ?? 0,
        })
        .returningAll()
        .execute();

      // Insert attribute values jika ada
      if (dto.attributeValueIds?.length) {
        await db
          .insertInto('product_variant_attributes')
          .values(
            dto.attributeValueIds.map((avId) => ({
              variant_id: variant.id,
              attribute_value_id: avId,
            })),
          )
          .execute();
      }

      results.push(variant);
    }

    return results;
  }

  private async createDefaultVariant(
    db: Kysely<TenantSchema>,
    product: { id: number; code: string; name: string },
  ) {
    // SKU default = kode produk
    const [variant] = await db
      .insertInto('product_variants')
      .values({
        product_id: product.id,
        sku: product.code,
        name: product.name,
        cost_price: 0,
        sale_price: 0,
        min_stock: 0,
      })
      .returningAll()
      .execute();

    return variant;
  }

  private async validateUomIds(db: Kysely<TenantSchema>, uomIds: number[]) {
    const unique = [...new Set(uomIds)];
    const found = await db
      .selectFrom('uom')
      .where('id', 'in', unique as any)
      .select('id')
      .execute();

    if (found.length !== unique.length) {
      throw new NotFoundException('Satu atau lebih UoM tidak ditemukan');
    }
  }
}
