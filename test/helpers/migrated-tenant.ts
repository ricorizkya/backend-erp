import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { assertSafeTestTenantSchema } from './test-environment';

const migrationsPath = path.resolve(
  __dirname,
  '../../src/database/migrations/tenant',
);
const publicMigrationsPath = path.resolve(
  __dirname,
  '../../src/database/migrations/public',
);

export async function ensurePublicTestSchema(pool: Pool): Promise<void> {
  const existing = await pool.query<{ tenants: string | null }>(
    `SELECT to_regclass('public.tenants')::text AS tenants`,
  );
  if (existing.rows[0].tenants) return;

  const client = await pool.connect();
  try {
    const migrations = (await fs.readdir(publicMigrationsPath))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const migration of migrations) {
      await client.query(
        await fs.readFile(path.join(publicMigrationsPath, migration), 'utf8'),
      );
    }
  } finally {
    client.release();
  }
}

export async function createMigratedTenantSchema(
  pool: Pool,
  schema: string,
): Promise<void> {
  assertSafeTestTenantSchema(schema);
  const client = await pool.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);

    const migrations = (await fs.readdir(migrationsPath))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const migration of migrations) {
      await client.query(
        await fs.readFile(path.join(migrationsPath, migration), 'utf8'),
      );
    }
  } finally {
    client.release();
  }
}

export async function dropTestTenantSchema(
  pool: Pool,
  schema: string,
): Promise<void> {
  assertSafeTestTenantSchema(schema);
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}
