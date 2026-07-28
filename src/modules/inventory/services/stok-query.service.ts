/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { StockQueryDto, StockHistoryDto } from '../dto/inventory.dto';

@Injectable()
export class StockQueryService {
  // ----------------------------------------------------------------
  // STOCK ON HAND
  // Baca dari materialized view stock_summary
  // Lebih cepat dari query SUM langsung ke movement_items
  // ----------------------------------------------------------------

  async getStockOnHand(db: Kysely<TenantSchema>, query: StockQueryDto) {
    let q = db
      .selectFrom('stock_summary as ss')
      .innerJoin('product_variants as pv', 'pv.id', 'ss.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouses as w', 'w.id', 'ss.warehouse_id')
      .innerJoin('uom as u', 'u.id', 'p.base_uom_id')
      .leftJoin('batches as b', 'b.id', 'ss.batch_id')
      .select([
        'ss.variant_id',
        'ss.warehouse_id',
        'ss.batch_id',
        'ss.quantity_on_hand',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
        'w.type as warehouse_type',
        'u.symbol as uom_symbol',
        'b.batch_number',
        'b.expiry_date',
      ]);

    if (query.warehouseId) {
      q = q.where('ss.warehouse_id', '=', query.warehouseId);
    }
    if (query.variantId) {
      q = q.where('ss.variant_id', '=', query.variantId);
    }
    if (query.batchId) {
      q = q.where('ss.batch_id', '=', query.batchId);
    }
    if (query.onlyPositive !== false) {
      q = q.where('ss.quantity_on_hand', '>', 0);
    }

    return q
      .orderBy('p.name', 'asc')
      .orderBy('pv.sku', 'asc')
      .orderBy('w.name', 'asc')
      .execute();
  }

  // ----------------------------------------------------------------
  // STOCK SUMMARY PER PRODUCT
  // Aggregate stock di semua warehouse dan batch untuk satu variant
  // ----------------------------------------------------------------

  async getStockByVariant(db: Kysely<TenantSchema>, variantId: number) {
    const variant = await db
      .selectFrom('product_variants as pv')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .where('pv.id', '=', variantId)
      .select([
        'pv.id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
      ])
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    // Stock per warehouse
    const stockPerWarehouse = await db
      .selectFrom('stock_summary as ss')
      .innerJoin('warehouses as w', 'w.id', 'ss.warehouse_id')
      .leftJoin('batches as b', 'b.id', 'ss.batch_id')
      .where('ss.variant_id', '=', variantId)
      .select([
        'w.id as warehouse_id',
        'w.code as warehouse_code',
        'w.name as warehouse_name',
        'w.type as warehouse_type',
        'ss.batch_id',
        'b.batch_number',
        'b.expiry_date',
        'ss.quantity_on_hand',
      ])
      .orderBy('w.name', 'asc')
      .execute();

    // Total stock semua warehouse
    const total = stockPerWarehouse.reduce(
      (sum, row) => sum + Number(row.quantity_on_hand),
      0,
    );

    return {
      variant,
      totalStock: total,
      stockPerWarehouse,
    };
  }

  // ----------------------------------------------------------------
  // STOCK HISTORY
  // Movement history per variant — untuk audit trail
  // ----------------------------------------------------------------

  async getStockHistory(db: Kysely<TenantSchema>, query: StockHistoryDto) {
    const variant = await db
      .selectFrom('product_variants')
      .where('id', '=', query.variantId)
      .select(['id', 'sku'])
      .executeTakeFirst();

    if (!variant) throw new NotFoundException('Variant tidak ditemukan');

    const { page, limit } = query;
    const offset = (page - 1) * limit;

    let q = db
      .selectFrom('inventory_movement_items as imi')
      .innerJoin('inventory_movements as im', 'im.id', 'imi.movement_id')
      .innerJoin(
        'inventory_movement_types as imt',
        'imt.id',
        'im.movement_type_id',
      )
      .leftJoin('warehouses as fw', 'fw.id', 'imi.from_warehouse_id')
      .leftJoin('warehouses as tw', 'tw.id', 'imi.to_warehouse_id')
      .leftJoin('batches as b', 'b.id', 'imi.batch_id')
      .where('imi.variant_id', '=', query.variantId)
      .where('im.status', '=', 'confirmed');

    if (query.warehouseId) {
      q = q.where((eb) =>
        eb.or([
          eb('imi.from_warehouse_id', '=', query.warehouseId as number),
          eb('imi.to_warehouse_id', '=', query.warehouseId as number),
        ]),
      );
    }
    if (query.dateFrom) {
      q = q.where('im.movement_date', '>=', new Date(query.dateFrom));
    }
    if (query.dateTo) {
      q = q.where('im.movement_date', '<=', new Date(query.dateTo));
    }

    const countResult = await q
      .clearSelect()
      .select(db.fn.countAll<number>().as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total ?? 0);

    const data = await q
      .select([
        'imi.id',
        'imi.quantity',
        'imi.unit_cost',
        'imi.notes',
        'im.movement_date',
        'im.confirmed_at',
        'imt.code as movement_type_code',
        'imt.name as movement_type_name',
        'imt.direction',
        'fw.code as from_warehouse_code',
        'fw.name as from_warehouse_name',
        'tw.code as to_warehouse_code',
        'tw.name as to_warehouse_name',
        'b.batch_number',
        'im.reference_type',
        'im.reference_id',
      ])
      .orderBy('im.movement_date', 'desc')
      .orderBy('im.confirmed_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      variant,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // STOCK PER LOKASI
  // Breakdown stock sampai level warehouse location
  // ----------------------------------------------------------------

  async getStockByLocation(db: Kysely<TenantSchema>, warehouseId: number) {
    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', warehouseId)
      .select(['id', 'code', 'name', 'type'])
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    // Stock yang punya lokasi spesifik
    const stockWithLocation = await db
      .selectFrom('inventory_movement_items as imi')
      .innerJoin('inventory_movements as im', 'im.id', 'imi.movement_id')
      .innerJoin('product_variants as pv', 'pv.id', 'imi.variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('warehouse_locations as wl', 'wl.id', 'imi.to_location_id')
      .leftJoin('batches as b', 'b.id', 'imi.batch_id')
      .where('imi.to_warehouse_id', '=', warehouseId)
      .where('im.status', '=', 'confirmed')
      .where('imi.to_location_id', 'is not', null)
      .groupBy([
        'imi.variant_id',
        'imi.to_location_id',
        'imi.batch_id',
        'pv.sku',
        'pv.name',
        'p.code',
        'p.name',
        'wl.code',
        'wl.name',
        'b.batch_number',
      ])
      .select([
        'imi.variant_id',
        'pv.sku',
        'pv.name as variant_name',
        'p.code as product_code',
        'p.name as product_name',
        'wl.code as location_code',
        'wl.name as location_name',
        'b.batch_number',
        db.fn.sum<number>('imi.quantity' as any).as('quantity'),
      ])
      .orderBy('wl.code', 'asc')
      .orderBy('p.name', 'asc')
      .execute();

    return {
      warehouse,
      stockByLocation: stockWithLocation,
    };
  }

  // ----------------------------------------------------------------
  // REORDER ALERTS
  // Variant dengan stock di bawah min_stock
  // ----------------------------------------------------------------

  async getReorderAlerts(db: Kysely<TenantSchema>, warehouseId?: number) {
    // Ambil semua variant yang punya min_stock > 0
    const variantQuery = db
      .selectFrom('product_variants as pv')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .where('pv.is_active', '=', true)
      .where('p.is_active', '=', true)
      .where('pv.min_stock', '>', 0)
      .select([
        'pv.id',
        'pv.sku',
        'pv.name',
        'pv.min_stock',
        'p.code',
        'p.name as product_name',
      ]);

    const variants = await variantQuery.execute();
    if (!variants.length) return [];

    const variantIds = variants.map((v) => v.id);

    // Ambil stock dari summary per variant per warehouse
    let stockQuery = db
      .selectFrom('stock_summary as ss')
      .innerJoin('warehouses as w', 'w.id', 'ss.warehouse_id')
      .where('ss.variant_id', 'in', variantIds as any)
      .groupBy(['ss.variant_id'])
      .select([
        'ss.variant_id',
        db.fn.sum<number>('ss.quantity_on_hand' as any).as('total_stock'),
      ]);

    if (warehouseId) {
      stockQuery = stockQuery.where('ss.warehouse_id', '=', warehouseId);
    }

    const stocks = await stockQuery.execute();
    const stockMap = Object.fromEntries(
      stocks.map((s) => [s.variant_id, Number(s.total_stock)]),
    );

    // Filter yang di bawah min_stock
    return variants
      .filter((v) => (stockMap[v.id] ?? 0) < Number(v.min_stock))
      .map((v) => ({
        variantId: v.id,
        sku: v.sku,
        variantName: v.name,
        productCode: v.code,
        productName: v.product_name,
        minStock: Number(v.min_stock),
        currentStock: stockMap[v.id] ?? 0,
        shortage: Number(v.min_stock) - (stockMap[v.id] ?? 0),
      }))
      .sort((a, b) => b.shortage - a.shortage);
  }
}
