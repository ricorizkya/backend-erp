import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { sql } from 'kysely';
import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { getTestEnvironment } from './helpers/test-environment';
import { dropTestTenantSchema } from './helpers/migrated-tenant';

const schemaA = 'tenant_test_pool_a';
const schemaB = 'tenant_test_pool_b';

type MigrationInternals = {
  applyMigration(
    client: PoolClient,
    migrationsPath: string,
    filename: string,
    schemaName: string,
  ): Promise<void>;
};

describe('tenant connection and migration safety', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 1,
  });
  const database = new DatabaseService(pool);

  beforeAll(async () => {
    await pool.query(`
      DROP SCHEMA IF EXISTS "${schemaA}" CASCADE;
      DROP SCHEMA IF EXISTS "${schemaB}" CASCADE;
      CREATE SCHEMA "${schemaA}";
      CREATE SCHEMA "${schemaB}";
      CREATE TABLE "${schemaA}".tenant_marker (value TEXT NOT NULL);
      CREATE TABLE "${schemaB}".tenant_marker (value TEXT NOT NULL);
      INSERT INTO "${schemaA}".tenant_marker VALUES ('A');
      INSERT INTO "${schemaB}".tenant_marker VALUES ('B');
    `);
  });

  afterAll(async () => {
    await dropTestTenantSchema(pool, schemaA);
    await dropTestTenantSchema(pool, schemaB);
    await pool.end();
  });

  it('resets search_path before returning the physical connection', async () => {
    const tenant = await database.getTenantDb('test_pool_a');
    expect(
      (
        await sql<{ value: string }>`SELECT value FROM tenant_marker`.execute(
          tenant.db,
        )
      ).rows,
    ).toEqual([{ value: 'A' }]);
    await tenant.release();
    await tenant.release();

    const client = await pool.connect();
    try {
      const result = await client.query<{ search_path: string }>(
        'SHOW search_path',
      );
      expect(result.rows[0].search_path).not.toContain(schemaA);
    } finally {
      client.release();
    }
  });

  it('does not leak one tenant into the next tenant on a reused connection', async () => {
    const tenantA = await database.getTenantDb('test_pool_a');
    try {
      await expect(
        sql<{ value: string }>`SELECT value FROM tenant_marker`
          .execute(tenantA.db)
          .then((result) => result.rows),
      ).resolves.toEqual([{ value: 'A' }]);
    } finally {
      await tenantA.release();
    }

    const tenantB = await database.getTenantDb('test_pool_b');
    try {
      await expect(
        sql<{ value: string }>`SELECT value FROM tenant_marker`
          .execute(tenantB.db)
          .then((result) => result.rows),
      ).resolves.toEqual([{ value: 'B' }]);
    } finally {
      await tenantB.release();
    }
  });

  it('returns the pool to idle after 100 failed tenant queries', async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const tenant = await database.getTenantDb('test_pool_a');
      try {
        await expect(
          sql`SELECT * FROM missing_table`.execute(tenant.db),
        ).rejects.toBeDefined();
      } finally {
        await tenant.release();
      }
    }

    expect(pool.totalCount).toBe(1);
    expect(pool.idleCount).toBe(1);
    expect(pool.waitingCount).toBe(0);
  });

  it('rejects changed migration checksums and never rewrites history', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'erp-migration-'),
    );
    const filename = '999_checksum_test.sql';
    const schemaName = 'tenant_test_checksum';
    await fs.writeFile(path.join(directory, filename), 'SELECT 1;\n');
    await pool.query(
      `CREATE TABLE IF NOT EXISTS public.migration_history (
         id SERIAL PRIMARY KEY,
         schema_name VARCHAR(255) NOT NULL,
         filename VARCHAR(255) NOT NULL,
         checksum VARCHAR(255) NOT NULL,
         executed_at TIMESTAMPTZ DEFAULT NOW()
       )`,
    );
    await pool.query(
      `DELETE FROM public.migration_history
       WHERE schema_name = $1 AND filename = $2`,
      [schemaName, filename],
    );
    await pool.query(
      `INSERT INTO public.migration_history (schema_name, filename, checksum)
       VALUES ($1, $2, 'immutable-checksum')`,
      [schemaName, filename],
    );

    const client = await pool.connect();
    try {
      const migration = new MigrationService(
        pool,
      ) as unknown as MigrationInternals;
      await expect(
        migration.applyMigration(client, directory, filename, schemaName),
      ).rejects.toThrow('Migration checksum mismatch');
    } finally {
      client.release();
      await fs.rm(directory, { recursive: true, force: true });
    }

    const history = await pool.query<{ checksum: string }>(
      `DELETE FROM public.migration_history
       WHERE schema_name = $1 AND filename = $2
       RETURNING checksum`,
      [schemaName, filename],
    );
    expect(history.rows).toEqual([{ checksum: 'immutable-checksum' }]);
  });
});
