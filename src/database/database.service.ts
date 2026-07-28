/* eslint-disable @typescript-eslint/require-await */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { PublicSchema, TenantSchema } from 'src/types/database.types';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;
  private readonly publicDb: Kysely<PublicSchema>;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({
      host: this.config.getOrThrow<string>('DB_HOST'),
      port: this.config.getOrThrow<number>('DB_PORT'),
      database: this.config.getOrThrow<string>('DB_NAME'),
      user: this.config.getOrThrow<string>('DB_USER'),
      password: this.config.getOrThrow<string>('DB_PASSWORD'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    this.pool.on('error', (err) => {
      this.logger.error('PostgreSQL pool error', err);
    });

    this.publicDb = new Kysely<PublicSchema>({
      dialect: new PostgresDialect({ pool: this.pool }),
    });
  }

  getPublicDb(): Kysely<PublicSchema> {
    return this.publicDb;
  }

  async getTenantDb(tenantCode: string): Promise<{
    db: Kysely<TenantSchema>;
    release: () => void;
  }> {
    this.validateTenantCode(tenantCode);
    const schemaName = `tenant_${tenantCode}`;

    const client = await this.pool.connect();

    try {
      await client.query(`SET search_path TO "${schemaName}", public`);
    } catch (error) {
      client.release();
      throw error;
    }

    // Simpan fungsi release asli
    const originalRelease = client.release.bind(client);
    // Kosongkan fungsi release agar Kysely tidak mengembalikan koneksi ke pool setiap selesai 1 query
    client.release = () => {};

    const db = new Kysely<TenantSchema>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => client,
          end: async () => {},
        } as any,
      }),
    });

    return {
      db,
      release: () => originalRelease(),
    };
  }

  async withTenantTransaction<T>(
    tenantCode: string,
    fn: (db: Kysely<TenantSchema>) => Promise<T>,
  ): Promise<T> {
    const { db, release } = await this.getTenantDb(tenantCode);

    try {
      return await db.transaction().execute(fn);
    } finally {
      release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }

  private validateTenantCode(code: string): void {
    if (!/^[a-z0-9_]+$/.test(code)) {
      throw new Error(
        `Invalid tenant code: "${code}". ` +
          `Just lowercase, number, and underscore,`,
      );
    }
  }
}
