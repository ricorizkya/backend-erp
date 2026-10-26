import { Pool, PoolClient } from 'pg';
import {
  assertSafeTestTenantSchema,
  getTestEnvironment,
} from './helpers/test-environment';

const schema = 'tenant_test_concurrency';

describe('transactional status transition concurrency', () => {
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
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`
      CREATE TABLE "${schema}".documents (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE "${schema}".effects (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        document_id INTEGER NOT NULL
      );
      INSERT INTO "${schema}".documents (id, status) VALUES (1, 'draft');
    `);
  });

  afterAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  async function confirm(client: PoolClient): Promise<void> {
    await client.query('BEGIN');
    try {
      const result = await client.query<{ status: string }>(
        `SELECT status FROM "${schema}".documents WHERE id = 1 FOR UPDATE`,
      );
      if (result.rows[0]?.status !== 'draft') {
        throw new Error('document is no longer draft');
      }

      await client.query(
        `INSERT INTO "${schema}".effects (document_id) VALUES (1)`,
      );
      await client.query(
        `UPDATE "${schema}".documents SET status = 'confirmed' WHERE id = 1`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  it('allows exactly one side effect for two parallel confirms', async () => {
    const first = await pool.connect();
    const second = await pool.connect();

    try {
      const results = await Promise.allSettled([
        confirm(first),
        confirm(second),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const effects = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "${schema}".effects`,
      );
      expect(effects.rows[0].count).toBe('1');
    } finally {
      first.release();
      second.release();
    }
  });
});
