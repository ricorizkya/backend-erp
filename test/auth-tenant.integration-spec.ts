import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import IORedis from 'ioredis';
import { Pool } from 'pg';
jest.mock('@nestjs-modules/ioredis', () => ({
  InjectRedis: () => () => undefined,
}));
import { DatabaseService } from '../src/database/database.service';
import { HashIdService } from '../src/common/hashid/hashid.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { BCRYPT_ROUNDS } from '../src/modules/auth/auth.constants';
import { getTestEnvironment } from './helpers/test-environment';
import { ensurePublicTestSchema } from './helpers/migrated-tenant';

describe('authenticated two-tenant isolation', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 4,
  });
  const database = new DatabaseService(pool);
  const redis = new IORedis(environment.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const hashIds = new HashIdService();
  const auth = new AuthService(
    database,
    new JwtService(),
    new ConfigService({
      JWT_ACCESS_SECRET: environment.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: environment.JWT_REFRESH_SECRET,
    }),
    hashIds,
    redis,
  );
  const password = 'StrongTestPassword123';
  const tenantCodes = ['test_auth_a', 'test_auth_b'];
  const emails = ['admin-a@test.invalid', 'admin-b@test.invalid'];

  beforeAll(async () => {
    await ensurePublicTestSchema(pool);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    for (let index = 0; index < tenantCodes.length; index += 1) {
      const tenant = await pool.query<{ id: string }>(
        `INSERT INTO public.tenants (name, code, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (code) DO UPDATE SET is_active = true
         RETURNING id::text`,
        [`Test Auth ${index}`, tenantCodes[index]],
      );
      const tenantId = tenant.rows[0].id;
      await pool.query(
        `INSERT INTO public.tenant_secrets (tenant_id, hash_salt)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE SET hash_salt = EXCLUDED.hash_salt`,
        [tenantId, `${String(index + 1).repeat(64)}`],
      );
      const user = await pool.query<{ id: string }>(
        `INSERT INTO public.users
          (tenant_id, email, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, is_active = true
         RETURNING id::text`,
        [tenantId, emails[index], passwordHash, `Admin ${index}`],
      );
      const role = await pool.query<{ id: string }>(
        `INSERT INTO public.roles (tenant_id, name, permissions)
         VALUES ($1, 'Super Administrator', '{"inventory":["read"]}')
         RETURNING id::text`,
        [tenantId],
      );
      await pool.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.rows[0].id, role.rows[0].id],
      );
    }
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM public.refresh_tokens
       WHERE user_id IN (SELECT id FROM public.users WHERE email = ANY($1))`,
      [emails],
    );
    await pool.query(`DELETE FROM public.users WHERE email = ANY($1)`, [
      emails,
    ]);
    await pool.query(
      `DELETE FROM public.roles
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE code = ANY($1))`,
      [tenantCodes],
    );
    await pool.query(`DELETE FROM public.tenants WHERE code = ANY($1)`, [
      tenantCodes,
    ]);
    await redis.flushdb();
    redis.disconnect();
    await pool.end();
  });

  it('logs in both tenants, isolates credentials, and uses different hash salts', async () => {
    const first = await auth.login(
      { tenantCode: tenantCodes[0], email: emails[0], password },
      '127.0.0.10',
      'jest',
    );
    const second = await auth.login(
      { tenantCode: tenantCodes[1], email: emails[1], password },
      '127.0.0.11',
      'jest',
    );

    expect(first.user.tenantCode).toBe(tenantCodes[0]);
    expect(second.user.tenantCode).toBe(tenantCodes[1]);
    expect(first.user.id).not.toBe(second.user.id);
    expect(
      new JwtService().verify(first.accessToken, {
        secret: environment.JWT_ACCESS_SECRET,
      }),
    ).toMatchObject({ tenantCode: tenantCodes[0], email: emails[0] });
    await expect(
      auth.login(
        { tenantCode: tenantCodes[1], email: emails[0], password },
        '127.0.0.12',
        'jest',
      ),
    ).rejects.toThrow('tidak valid');

    const salts = await pool.query<{ hash_salt: string }>(
      `SELECT ts.hash_salt
       FROM public.tenant_secrets ts
       JOIN public.tenants t ON t.id = ts.tenant_id
       WHERE t.code = ANY($1) ORDER BY t.code`,
      [tenantCodes],
    );
    expect(hashIds.encode(1, salts.rows[0].hash_salt)).not.toBe(
      hashIds.encode(1, salts.rows[1].hash_salt),
    );
  });

  it('fails explicitly when a tenant has no hash salt', async () => {
    await pool.query(
      `DELETE FROM public.tenant_secrets
       WHERE tenant_id = (SELECT id FROM public.tenants WHERE code = $1)`,
      [tenantCodes[1]],
    );
    await expect(
      auth.login(
        { tenantCode: tenantCodes[1], email: emails[1], password },
        '127.0.0.13',
        'jest',
      ),
    ).rejects.toThrow('Konfigurasi tenant tidak lengkap');
  });
});
