import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { BCRYPT_ROUNDS } from '../modules/auth/auth.constants';

interface BootstrapAdminInput {
  email?: string;
  password?: string;
  fullName?: string;
  tenantCode?: string;
}

export interface BootstrapAdminConfig {
  email: string;
  password: string;
  fullName: string;
  tenantCode: string;
}

export function parseBootstrapAdminConfig(
  input: BootstrapAdminInput,
): BootstrapAdminConfig | null {
  const email = input.email?.trim().toLowerCase();
  const password = input.password;

  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together.',
    );
  }
  if (!isEmail(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and contain uppercase, lowercase, and numeric characters.',
    );
  }

  const tenantCode = input.tenantCode?.trim().toLowerCase() || 'admin';
  if (!/^[a-z0-9_]+$/.test(tenantCode)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_TENANT_CODE may contain only lowercase letters, numbers, and underscores.',
    );
  }

  return {
    email,
    password,
    fullName: input.fullName?.trim() || 'System Administrator',
    tenantCode,
  };
}

@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const bootstrap = parseBootstrapAdminConfig({
      email: this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL'),
      password: this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD'),
      fullName: this.config.get<string>('BOOTSTRAP_ADMIN_FULL_NAME'),
      tenantCode: this.config.get<string>('BOOTSTRAP_ADMIN_TENANT_CODE'),
    });

    if (!bootstrap) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const access = await client.query<{ tenant_id: string; role_id: string }>(
        `SELECT t.id AS tenant_id, r.id AS role_id
         FROM public.tenants t
         JOIN public.roles r ON r.tenant_id = t.id
         WHERE t.code = $1 AND r.name = 'Super Administrator'`,
        [bootstrap.tenantCode],
      );
      if (access.rowCount !== 1) {
        throw new Error(
          `Bootstrap tenant or administrator role not found for tenant "${bootstrap.tenantCode}".`,
        );
      }

      const existing = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM public.users WHERE email = $1',
        [bootstrap.email],
      );

      let userId: string;
      if (existing.rowCount) {
        if (existing.rows[0].tenant_id !== access.rows[0].tenant_id) {
          throw new Error(
            `Bootstrap email "${bootstrap.email}" already belongs to another tenant.`,
          );
        }
        userId = existing.rows[0].id;
      } else {
        const passwordHash = await bcrypt.hash(
          bootstrap.password,
          BCRYPT_ROUNDS,
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO public.users
             (tenant_id, email, password_hash, full_name, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [
            access.rows[0].tenant_id,
            bootstrap.email,
            passwordHash,
            bootstrap.fullName,
          ],
        );
        userId = inserted.rows[0].id;
      }

      await client.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, access.rows[0].role_id],
      );
      await client.query('COMMIT');

      this.logger.warn(
        `Bootstrap administrator "${bootstrap.email}" is ready. Remove BOOTSTRAP_ADMIN_* variables now.`,
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
