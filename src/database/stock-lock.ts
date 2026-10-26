import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../types/database.types';

export interface StockKey {
  variantId: number;
  warehouseId: number;
  batchId?: number | null;
}

function keyString(key: StockKey): string {
  return `${key.variantId}:${key.warehouseId}:${key.batchId ?? 0}`;
}

export async function lockStockKeys(
  db: Kysely<TenantSchema>,
  keys: readonly StockKey[],
): Promise<void> {
  const uniqueKeys = [
    ...new Map(keys.map((key) => [keyString(key), key])).values(),
  ].sort((left, right) => keyString(left).localeCompare(keyString(right)));

  for (const key of uniqueKeys) {
    await sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          concat(current_schema(), ':', ${key.variantId}, ':', ${key.warehouseId}, ':', ${key.batchId ?? 0}),
          0
        )
      )
    `.execute(db);
  }
}

export async function getStockOnHand(
  db: Kysely<TenantSchema>,
  key: StockKey,
): Promise<number> {
  const result = await sql<{ quantity_on_hand: string | number }>`
    SELECT COALESCE(SUM(
      CASE
        WHEN mt.direction = 'in' AND imi.to_warehouse_id = ${key.warehouseId}
          THEN imi.quantity
        WHEN mt.direction = 'out' AND imi.from_warehouse_id = ${key.warehouseId}
          THEN -imi.quantity
        WHEN mt.direction = 'transfer' AND imi.to_warehouse_id = ${key.warehouseId}
          THEN imi.quantity
        WHEN mt.direction = 'transfer' AND imi.from_warehouse_id = ${key.warehouseId}
          THEN -imi.quantity
        ELSE 0
      END
    ), 0)::numeric AS quantity_on_hand
    FROM inventory_movement_items imi
    JOIN inventory_movements im ON im.id = imi.movement_id
    JOIN inventory_movement_types mt ON mt.id = im.movement_type_id
    WHERE im.status = 'confirmed'
      AND imi.variant_id = ${key.variantId}
      AND (imi.from_warehouse_id = ${key.warehouseId} OR imi.to_warehouse_id = ${key.warehouseId})
      AND ${key.batchId == null ? sql`imi.batch_id IS NULL` : sql`imi.batch_id = ${key.batchId}`}
  `.execute(db);

  return Number(result.rows[0]?.quantity_on_hand ?? 0);
}
