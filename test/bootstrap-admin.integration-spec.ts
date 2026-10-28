import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { BootstrapAdminService } from '../src/database/bootstrap-admin.service';
import { getTestEnvironment } from './helpers/test-environment';
import { ensurePublicTestSchema } from './helpers/migrated-tenant';

describe('BootstrapAdminService integration', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 2,
  });
  const tenantCode = 'test_bootstrap_admin';
  const email = 'bootstrap-admin@test.invalid';
  const password = 'StrongBootstrap123';

  beforeAll(async () => {
    await ensurePublicTestSchema(pool);
    await pool.query('BEGIN');
    try {
      const tenant = await pool.query<{ id: string }>(
        `INSERT INTO public.tenants (name, code, is_active)
         VALUES ('Bootstrap Test', $1, true)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenantCode],
      );
      await pool.query(
        `INSERT INTO public.tenant_secrets (tenant_id, hash_salt)
         VALUES ($1, md5(random()::text) || md5(random()::text))
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenant.rows[0].id],
      );
      await pool.query(
        `INSERT INTO public.roles (tenant_id, name, permissions)
         SELECT $1, 'Super Administrator', '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM public.roles
           WHERE tenant_id = $1 AND name = 'Super Administrator'
         )`,
        [tenant.rows[0].id],
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.users WHERE email = $1', [email]);
    await pool.query(
      `DELETE FROM public.roles
       WHERE tenant_id = (SELECT id FROM public.tenants WHERE code = $1)`,
      [tenantCode],
    );
    await pool.query('DELETE FROM public.tenants WHERE code = $1', [
      tenantCode,
    ]);
    await pool.end();
  });

  it('creates a usable administrator once and remains idempotent', async () => {
    const config = new ConfigService({
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: password,
      BOOTSTRAP_ADMIN_FULL_NAME: 'Bootstrap Administrator',
      BOOTSTRAP_ADMIN_TENANT_CODE: tenantCode,
    });
    const bootstrap = new BootstrapAdminService(pool, config);

    await bootstrap.onApplicationBootstrap();
    await bootstrap.onApplicationBootstrap();

    const result = await pool.query<{
      password_hash: string;
      user_count: string;
      role_count: string;
    }>(
      `SELECT min(u.password_hash) AS password_hash,
              count(DISTINCT u.id)::text AS user_count,
              count(DISTINCT ur.role_id)::text AS role_count
       FROM public.users u
       JOIN public.user_roles ur ON ur.user_id = u.id
       JOIN public.tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND t.code = $2`,
      [email, tenantCode],
    );

    expect(result.rows[0].user_count).toBe('1');
    expect(result.rows[0].role_count).toBe('1');
    await expect(
      bcrypt.compare(password, result.rows[0].password_hash),
    ).resolves.toBe(true);
  });
});
