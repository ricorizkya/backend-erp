import { Pool, PoolClient } from 'pg';
import {
  assertSafeTestTenantSchema,
  getTestEnvironment,
} from './helpers/test-environment';

const schema = 'tenant_test_stock_lock';

describe('stock-key concurrency protection', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 4,
  });

  beforeAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`
      CREATE SCHEMA "${schema}";
      CREATE TABLE "${schema}".movement_types (
        id INTEGER PRIMARY KEY,
        direction TEXT NOT NULL
      );
      CREATE TABLE "${schema}".movements (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        type_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE "${schema}".items (
        movement_id INTEGER NOT NULL,
        variant_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        quantity NUMERIC NOT NULL
      );
      INSERT INTO "${schema}".movement_types (id, direction)
      VALUES (1, 'in'), (2, 'out');
      INSERT INTO "${schema}".movements (type_id, status) VALUES (1, 'confirmed');
      INSERT INTO "${schema}".items (movement_id, variant_id, warehouse_id, quantity)
      VALUES (1, 10, 20, 10);
    `);
  });

  afterAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  async function consume(client: PoolClient): Promise<void> {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended(concat(current_schema(), ':10:20:0'), 0)
         )`,
      );

      const balance = await client.query<{ quantity: string }>(`
        SELECT COALESCE(SUM(
          CASE WHEN mt.direction = 'in' THEN i.quantity ELSE -i.quantity END
        ), 0)::text AS quantity
        FROM items i
        JOIN movements m ON m.id = i.movement_id
        JOIN movement_types mt ON mt.id = m.type_id
        WHERE m.status = 'confirmed'
          AND i.variant_id = 10
          AND i.warehouse_id = 20
      `);
      if (Number(balance.rows[0].quantity) < 7) {
        throw new Error('insufficient stock');
      }

      const movement = await client.query<{ id: number }>(
        `INSERT INTO movements (type_id, status) VALUES (2, 'confirmed') RETURNING id`,
      );
      await client.query(
        `INSERT INTO items (movement_id, variant_id, warehouse_id, quantity)
         VALUES ($1, 10, 20, 7)`,
        [movement.rows[0].id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  it('allows only one parallel withdrawal when stock is insufficient for both', async () => {
    const first = await pool.connect();
    const second = await pool.connect();

    try {
      const results = await Promise.allSettled([
        consume(first),
        consume(second),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const balance = await pool.query<{ quantity: string }>(`
        SELECT COALESCE(SUM(
          CASE WHEN mt.direction = 'in' THEN i.quantity ELSE -i.quantity END
        ), 0)::text AS quantity
        FROM "${schema}".items i
        JOIN "${schema}".movements m ON m.id = i.movement_id
        JOIN "${schema}".movement_types mt ON mt.id = m.type_id
        WHERE m.status = 'confirmed'
          AND i.variant_id = 10
          AND i.warehouse_id = 20
      `);
      expect(Number(balance.rows[0].quantity)).toBe(3);
    } finally {
      first.release();
      second.release();
    }
  });
});
