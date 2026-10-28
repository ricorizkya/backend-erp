import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateBomHeaderDto,
  UpdateBomHeaderDto,
  CreateBomVersionDto,
  UpdateBomVersionDto,
  CreateBomItemDto,
  UpdateBomItemDto,
  CreateBomOperationDto,
  UpdateBomOperationDto,
  CreateByProductDto,
  BomFilterDto,
} from '../dto/bom.dto';

@Injectable()
export class BomService {
  // ================================================================
  // BOM HEADERS
  // ================================================================

  async findAllHeaders(db: Kysely<TenantSchema>, filter: BomFilterDto) {
    const { page, limit, search, isActive } = filter;

    let query = db
      .selectFrom('bom_headers as bh')
      .innerJoin('product_variants as pv', 'pv.id', 'bh.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .select([
        'bh.id',
        'bh.name',
        'bh.is_active',
        'bh.created_at',
        'bh.updated_at',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
      ]);

    if (isActive !== undefined) {
      query = query.where('bh.is_active', '=', isActive);
    }
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('bh.name', 'ilike', `%${search}%`),
          eb('pv.sku', 'ilike', `%${search}%`),
          eb('p.name', 'ilike', `%${search}%`),
          eb('p.code', 'ilike', `%${search}%`),
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
      .orderBy('p.name', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneHeader(db: Kysely<TenantSchema>, headerId: number) {
    const header = await db
      .selectFrom('bom_headers as bh')
      .innerJoin('product_variants as pv', 'pv.id', 'bh.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .where('bh.id', '=', headerId)
      .select([
        'bh.id',
        'bh.name',
        'bh.notes',
        'bh.is_active',
        'bh.created_by',
        'bh.created_at',
        'bh.updated_at',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
      ])
      .executeTakeFirst();

    if (!header) throw new NotFoundException('BOM Header tidak ditemukan');

    // Ambil semua versions
    const versions = await db
      .selectFrom('bom_versions as bv')
      .innerJoin('uom as u', 'u.id', 'bv.output_uom_id')
      .where('bv.bom_header_id', '=', headerId)
      .select([
        'bv.id',
        'bv.version_number',
        'bv.version_name',
        'bv.status',
        'bv.output_quantity',
        'bv.effective_from',
        'bv.effective_to',
        'bv.notes',
        'bv.created_at',
        'bv.approved_by',
        'bv.approved_at',
        'u.symbol as output_uom_symbol',
        'u.name as output_uom_name',
      ])
      .orderBy('bv.version_number', 'desc')
      .execute();

    return { ...header, versions };
  }

  async createHeader(
    db: Kysely<TenantSchema>,
    dto: CreateBomHeaderDto,
    createdBy: number,
  ) {
    // Satu produk hanya boleh punya satu BOM header
    const existing = await db
      .selectFrom('bom_headers')
      .where('variant_id', '=', dto.variantId)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        'Produk ini sudah memiliki BOM header. ' +
          'Buat versi baru di BOM yang sudah ada.',
      );
    }

    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', dto.variantId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    const [header] = await db
      .insertInto('bom_headers')
      .values({
        variant_id: dto.variantId,
        name: dto.name,
        notes: dto.notes ?? null,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return header;
  }

  async updateHeader(
    db: Kysely<TenantSchema>,
    headerId: number,
    dto: UpdateBomHeaderDto,
  ) {
    const header = await db
      .selectFrom('bom_headers')
      .where('id', '=', headerId)
      .select('id')
      .executeTakeFirst();

    if (!header) throw new NotFoundException('BOM Header tidak ditemukan');

    const [updated] = await db
      .updateTable('bom_headers')
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', headerId)
      .returningAll()
      .execute();

    return updated;
  }

  // ================================================================
  // BOM VERSIONS
  // ================================================================

  async findOneVersion(db: Kysely<TenantSchema>, versionId: number) {
    const version = await db
      .selectFrom('bom_versions as bv')
      .innerJoin('bom_headers as bh', 'bh.id', 'bv.bom_header_id')
      .innerJoin('uom as u', 'u.id', 'bv.output_uom_id')
      .where('bv.id', '=', versionId)
      .select([
        'bv.id',
        'bv.bom_header_id',
        'bv.version_number',
        'bv.version_name',
        'bv.status',
        'bv.output_quantity',
        'bv.effective_from',
        'bv.effective_to',
        'bv.notes',
        'bv.created_by',
        'bv.created_at',
        'bv.approved_by',
        'bv.approved_at',
        'bh.name as header_name',
        'u.symbol as output_uom_symbol',
      ])
      .executeTakeFirst();

    if (!version) throw new NotFoundException('BOM Version tidak ditemukan');

    // Ambil items sebagai tree
    const items = await this.getItemsTree(db, versionId);
    const ops = await this.getOperations(db, versionId);
    const byProds = await this.getByProducts(db, versionId);

    return { ...version, items, operations: ops, byProducts: byProds };
  }

  async createVersion(
    db: Kysely<TenantSchema>,
    headerId: number,
    dto: CreateBomVersionDto,
    createdBy: number,
  ) {
    const header = await db
      .selectFrom('bom_headers')
      .where('id', '=', headerId)
      .select('id')
      .executeTakeFirst();

    if (!header) throw new NotFoundException('BOM Header tidak ditemukan');

    const uom = await db
      .selectFrom('uom')
      .where('id', '=', dto.outputUomId)
      .select('id')
      .executeTakeFirst();

    if (!uom) throw new NotFoundException('UoM tidak ditemukan');

    // Auto-increment version number
    const lastVersion = await db
      .selectFrom('bom_versions')
      .where('bom_header_id', '=', headerId)
      .select(db.fn.max<number>('version_number').as('max'))
      .executeTakeFirst();

    const nextVersionNumber = Number(lastVersion?.max ?? 0) + 1;

    const [version] = await db
      .insertInto('bom_versions')
      .values({
        bom_header_id: headerId,
        version_number: nextVersionNumber,
        version_name: dto.versionName ?? null,
        status: 'draft',
        output_quantity: dto.outputQuantity,
        output_uom_id: dto.outputUomId,
        effective_from: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
        effective_to: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        notes: dto.notes ?? null,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return version;
  }

  async updateVersion(
    db: Kysely<TenantSchema>,
    versionId: number,
    dto: UpdateBomVersionDto,
  ) {
    const version = await this.getVersionOrThrow(db, versionId);

    if (version.status === 'active') {
      // Versi aktif hanya boleh update effectiveTo dan notes
      const [updated] = await db
        .updateTable('bom_versions')
        .set({
          ...(dto.effectiveTo !== undefined
            ? {
                effective_to: dto.effectiveTo
                  ? new Date(dto.effectiveTo)
                  : null,
              }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', versionId)
        .returningAll()
        .execute();
      return updated;
    }

    const [updated] = await db
      .updateTable('bom_versions')
      .set({
        ...(dto.versionName !== undefined
          ? { version_name: dto.versionName ?? null }
          : {}),
        ...(dto.effectiveTo !== undefined
          ? {
              effective_to: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
            }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', versionId)
      .returningAll()
      .execute();

    return updated;
  }

  // Activate version: set active, obsolete semua versi lain
  async activateVersion(
    db: Kysely<TenantSchema>,
    versionId: number,
    approvedBy: number,
  ) {
    const version = await this.getVersionOrThrow(db, versionId);

    if (version.status === 'active') {
      throw new ConflictException('Versi ini sudah aktif');
    }
    if (version.status === 'obsolete') {
      throw new ConflictException(
        'Versi obsolete tidak bisa diaktifkan kembali',
      );
    }

    // Cek versi ini punya minimal satu item
    const itemCount = await db
      .selectFrom('bom_items')
      .where('bom_version_id', '=', versionId)
      .select(db.fn.countAll<number>().as('c'))
      .executeTakeFirst();

    if (Number(itemCount?.c ?? 0) === 0) {
      throw new BadRequestException(
        'BOM version harus memiliki minimal satu komponen sebelum diaktifkan',
      );
    }

    return db.transaction().execute(async (trx) => {
      // Set versi aktif lain jadi obsolete
      await trx
        .updateTable('bom_versions')
        .set({ status: 'obsolete', updated_at: new Date() })
        .where('bom_header_id', '=', version.bom_header_id)
        .where('status', '=', 'active')
        .execute();

      // Aktifkan versi ini
      const [updated] = await trx
        .updateTable('bom_versions')
        .set({
          status: 'active',
          approved_by: approvedBy,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', versionId)
        .returningAll()
        .execute();

      return updated;
    });
  }

  // ================================================================
  // BOM ITEMS
  // ================================================================

  async addItem(
    db: Kysely<TenantSchema>,
    versionId: number,
    dto: CreateBomItemDto,
  ) {
    const version = await this.getVersionOrThrow(db, versionId);

    if (version.status === 'active') {
      throw new ConflictException(
        'Versi aktif tidak bisa diubah. ' +
          'Buat versi baru untuk mengubah komponen BOM.',
      );
    }

    // Validasi parent item (jika ada)
    let level = 0;
    if (dto.parentItemId) {
      const parent = await db
        .selectFrom('bom_items')
        .where('id', '=', dto.parentItemId)
        .where('bom_version_id', '=', versionId)
        .select(['id', 'level', 'variant_id'])
        .executeTakeFirst();

      if (!parent) {
        throw new NotFoundException(
          'Parent item tidak ditemukan di versi BOM ini',
        );
      }

      // Cegah circular dependency
      if (parent.variant_id === dto.variantId) {
        throw new BadRequestException(
          'Komponen tidak boleh sama dengan parent-nya (circular dependency)',
        );
      }

      level = Number(parent.level) + 1;
    }

    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', dto.variantId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    // quantity_with_scrap = quantity * (1 + scrap_pct / 100)
    const scrapPct = dto.scrapPct ?? 0;
    const quantityWithScrap = dto.quantity * (1 + scrapPct / 100);

    const [item] = await db
      .insertInto('bom_items')
      .values({
        bom_version_id: versionId,
        parent_item_id: dto.parentItemId ?? null,
        variant_id: dto.variantId,
        is_phantom: dto.isPhantom ?? false,
        quantity: dto.quantity,
        uom_id: dto.uomId,
        scrap_pct: scrapPct,
        quantity_with_scrap: quantityWithScrap,
        level,
        sequence: dto.sequence ?? 0,
        notes: dto.notes ?? null,
      })
      .returningAll()
      .execute();

    return item;
  }

  async updateItem(
    db: Kysely<TenantSchema>,
    itemId: number,
    dto: UpdateBomItemDto,
  ) {
    const item = await db
      .selectFrom('bom_items as bi')
      .innerJoin('bom_versions as bv', 'bv.id', 'bi.bom_version_id')
      .where('bi.id', '=', itemId)
      .select(['bi.id', 'bi.quantity', 'bi.scrap_pct', 'bv.status'])
      .executeTakeFirst();

    if (!item) throw new NotFoundException('BOM Item tidak ditemukan');

    if (item.status === 'active') {
      throw new ConflictException(
        'Item pada versi aktif tidak bisa diubah. Buat versi baru.',
      );
    }

    const newQty = dto.quantity ?? Number(item.quantity);
    const newScrapPct = dto.scrapPct ?? Number(item.scrap_pct);
    const newQtyScrap = newQty * (1 + newScrapPct / 100);

    const [updated] = await db
      .updateTable('bom_items')
      .set({
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.uomId !== undefined ? { uom_id: dto.uomId } : {}),
        ...(dto.scrapPct !== undefined ? { scrap_pct: dto.scrapPct } : {}),
        ...(dto.isPhantom !== undefined ? { is_phantom: dto.isPhantom } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        quantity_with_scrap: newQtyScrap,
        updated_at: new Date(),
      })
      .where('id', '=', itemId)
      .returningAll()
      .execute();

    return updated;
  }

  async deleteItem(db: Kysely<TenantSchema>, itemId: number) {
    const item = await db
      .selectFrom('bom_items as bi')
      .innerJoin('bom_versions as bv', 'bv.id', 'bi.bom_version_id')
      .where('bi.id', '=', itemId)
      .select(['bi.id', 'bv.status'])
      .executeTakeFirst();

    if (!item) throw new NotFoundException('BOM Item tidak ditemukan');
    if (item.status === 'active') {
      throw new ConflictException('Item pada versi aktif tidak bisa dihapus');
    }

    // Hapus children dulu
    await db
      .deleteFrom('bom_items')
      .where('parent_item_id', '=', itemId)
      .execute();

    await db.deleteFrom('bom_items').where('id', '=', itemId).execute();

    return { message: 'BOM Item berhasil dihapus' };
  }

  // ================================================================
  // BOM OPERATIONS
  // ================================================================

  async addOperation(
    db: Kysely<TenantSchema>,
    versionId: number,
    dto: CreateBomOperationDto,
  ) {
    const version = await this.getVersionOrThrow(db, versionId);
    if (version.status === 'active') {
      throw new ConflictException(
        'Versi aktif tidak bisa diubah. Buat versi baru.',
      );
    }

    const [op] = await db
      .insertInto('bom_operations')
      .values({
        bom_version_id: versionId,
        sequence: dto.sequence,
        name: dto.name,
        work_center: dto.workCenter ?? null,
        duration_minutes: dto.durationMinutes ?? 0,
        cost_per_minute: dto.costPerMinute ?? 0,
        notes: dto.notes ?? null,
      })
      .returningAll()
      .execute();

    return op;
  }

  async updateOperation(
    db: Kysely<TenantSchema>,
    opId: number,
    dto: UpdateBomOperationDto,
  ) {
    const op = await db
      .selectFrom('bom_operations as bo')
      .innerJoin('bom_versions as bv', 'bv.id', 'bo.bom_version_id')
      .where('bo.id', '=', opId)
      .select(['bo.id', 'bv.status'])
      .executeTakeFirst();

    if (!op) throw new NotFoundException('BOM Operation tidak ditemukan');
    if (op.status === 'active') {
      throw new ConflictException(
        'Operation pada versi aktif tidak bisa diubah',
      );
    }

    const [updated] = await db
      .updateTable('bom_operations')
      .set({
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.workCenter !== undefined
          ? { work_center: dto.workCenter ?? null }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? { duration_minutes: dto.durationMinutes }
          : {}),
        ...(dto.costPerMinute !== undefined
          ? { cost_per_minute: dto.costPerMinute }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      })
      .where('id', '=', opId)
      .returningAll()
      .execute();

    return updated;
  }

  async deleteOperation(db: Kysely<TenantSchema>, opId: number) {
    await db.deleteFrom('bom_operations').where('id', '=', opId).execute();
    return { message: 'BOM Operation berhasil dihapus' };
  }

  // ================================================================
  // BY-PRODUCTS
  // ================================================================

  async addByProduct(
    db: Kysely<TenantSchema>,
    versionId: number,
    dto: CreateByProductDto,
  ) {
    const version = await this.getVersionOrThrow(db, versionId);
    if (version.status === 'active') {
      throw new ConflictException('Versi aktif tidak bisa diubah');
    }

    const [bp] = await db
      .insertInto('bom_by_products')
      .values({
        bom_version_id: versionId,
        variant_id: dto.variantId,
        quantity: dto.quantity,
        uom_id: dto.uomId,
        type: dto.type,
        cost_share_pct: dto.costSharePct ?? 0,
        notes: dto.notes ?? null,
      })
      .returningAll()
      .execute();

    return bp;
  }

  async deleteByProduct(db: Kysely<TenantSchema>, byProductId: number) {
    await db
      .deleteFrom('bom_by_products')
      .where('id', '=', byProductId)
      .execute();
    return { message: 'By-product berhasil dihapus' };
  }

  // ================================================================
  // EXPLODE BOM — flatten multi-level ke satu list
  // Dipakai oleh MRP engine dan cost calculation
  // ================================================================

  async explodeBom(
    db: Kysely<TenantSchema>,
    versionId: number,
    quantity: number = 1,
  ) {
    const version = await db
      .selectFrom('bom_versions')
      .where('id', '=', versionId)
      .select(['id', 'output_quantity'])
      .executeTakeFirst();

    if (!version) throw new NotFoundException('BOM Version tidak ditemukan');

    // Ratio: berapa kali BOM dijalankan untuk quantity yang diminta
    const ratio = quantity / Number(version.output_quantity);

    // Recursive CTE untuk flatten semua level
    const result = await sql<{
      item_id: number;
      parent_item_id: number | null;
      variant_id: number;
      sku: string;
      variant_name: string;
      product_code: string;
      product_name: string;
      quantity: number;
      quantity_with_scrap: number;
      uom_symbol: string;
      scrap_pct: number;
      is_phantom: boolean;
      level: number;
      sequence: number;
    }>`
      WITH RECURSIVE bom_tree AS (
          -- Base case: level 1 items (parent_item_id IS NULL)
          SELECT
              bi.id             AS item_id,
              bi.parent_item_id,
              bi.variant_id,
              pv.sku,
              pv.name           AS variant_name,
              p.code            AS product_code,
              p.name            AS product_name,
              bi.quantity,
              bi.quantity_with_scrap,
              u.symbol          AS uom_symbol,
              bi.scrap_pct,
              bi.is_phantom,
              bi.level,
              bi.sequence
          FROM bom_items bi
          JOIN product_variants pv ON pv.id = bi.variant_id
          JOIN products p          ON p.id  = pv.product_id
          JOIN uom u               ON u.id  = bi.uom_id
          WHERE bi.bom_version_id  = ${versionId}
            AND bi.parent_item_id IS NULL

          UNION ALL

          -- Recursive case: child items
          SELECT
              bi.id,
              bi.parent_item_id,
              bi.variant_id,
              pv.sku,
              pv.name,
              p.code,
              p.name,
              bi.quantity,
              bi.quantity_with_scrap,
              u.symbol,
              bi.scrap_pct,
              bi.is_phantom,
              bi.level,
              bi.sequence
          FROM bom_items bi
          JOIN product_variants pv ON pv.id = bi.variant_id
          JOIN products p          ON p.id  = pv.product_id
          JOIN uom u               ON u.id  = bi.uom_id
          JOIN bom_tree bt         ON bt.item_id = bi.parent_item_id
      )
      SELECT * FROM bom_tree
      ORDER BY level, sequence
    `.execute(db);

    // Kalikan semua quantity dengan ratio
    const exploded = result.rows.map((row) => ({
      ...row,
      quantity_required: Number(row.quantity) * ratio,
      quantity_required_with_scrap: Number(row.quantity_with_scrap) * ratio,
    }));

    return {
      versionId,
      outputQuantity: quantity,
      ratio,
      items: exploded,
    };
  }

  // ================================================================
  // GET ACTIVE VERSION FOR VARIANT
  // Dipakai oleh Production module
  // ================================================================

  async getActiveVersionForVariant(
    db: Kysely<TenantSchema>,
    variantId: number,
  ) {
    const version = await db
      .selectFrom('bom_versions as bv')
      .innerJoin('bom_headers as bh', 'bh.id', 'bv.bom_header_id')
      .where('bh.variant_id', '=', variantId)
      .where('bv.status', '=', 'active')
      .select([
        'bv.id',
        'bv.version_number',
        'bv.output_quantity',
        'bv.output_uom_id',
        'bv.effective_from',
        'bv.effective_to',
        'bh.id as header_id',
      ])
      .executeTakeFirst();

    if (!version) {
      throw new NotFoundException(
        `Tidak ada BOM aktif untuk variant ${variantId}`,
      );
    }

    return version;
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  private async getItemsTree(db: Kysely<TenantSchema>, versionId: number) {
    const items = await db
      .selectFrom('bom_items as bi')
      .innerJoin('product_variants as pv', 'pv.id', 'bi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'bi.uom_id')
      .where('bi.bom_version_id', '=', versionId)
      .select([
        'bi.id',
        'bi.parent_item_id',
        'bi.quantity',
        'bi.quantity_with_scrap',
        'bi.scrap_pct',
        'bi.is_phantom',
        'bi.level',
        'bi.sequence',
        'bi.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'p.can_be_manufactured',
        'u.symbol as uom_symbol',
      ])
      .orderBy('bi.level', 'asc')
      .orderBy('bi.sequence', 'asc')
      .execute();

    // Build tree structure
    return this.buildTree(items);
  }

  private buildTree(
    items: Array<{
      id: number;
      parent_item_id: number | null;
      [key: string]: unknown;
    }>,
  ) {
    const map = new Map<number, (typeof items)[0] & { children: unknown[] }>();
    const roots: unknown[] = [];

    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }

    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parent_item_id) {
        const parent = map.get(item.parent_item_id);
        if (parent) parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async getOperations(db: Kysely<TenantSchema>, versionId: number) {
    return db
      .selectFrom('bom_operations')
      .where('bom_version_id', '=', versionId)
      .selectAll()
      .orderBy('sequence', 'asc')
      .execute();
  }

  private async getByProducts(db: Kysely<TenantSchema>, versionId: number) {
    return db
      .selectFrom('bom_by_products as bp')
      .innerJoin('product_variants as pv', 'pv.id', 'bp.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('uom as u', 'u.id', 'bp.uom_id')
      .where('bp.bom_version_id', '=', versionId)
      .select([
        'bp.id',
        'bp.quantity',
        'bp.type',
        'bp.cost_share_pct',
        'bp.notes',
        'pv.id as variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'u.symbol as uom_symbol',
      ])
      .execute();
  }

  private async getVersionOrThrow(
    db: Kysely<TenantSchema>,
    versionId: number,
  ) {
    const version = await db
      .selectFrom('bom_versions')
      .where('id', '=', versionId)
      .select(['id', 'status', 'bom_header_id'])
      .executeTakeFirst();

    if (!version) throw new NotFoundException('BOM Version tidak ditemukan');
    return version;
  }
}
