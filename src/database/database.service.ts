import { Injectable, Logger } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { PublicSchema, TenantSchema } from 'src/types/database.types';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly publicDb: Kysely<PublicSchema>;

  constructor(readonly pool: Pool) {
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
    release: () => Promise<void>;
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

    const originalRelease = client.release.bind(client) as unknown as (
      err?: Error | boolean,
    ) => void;
    // Kosongkan fungsi release agar Kysely tidak mengembalikan koneksi ke pool setiap selesai 1 query
    client.release = () => {};

    const db = new Kysely<TenantSchema>({
      dialect: new PostgresDialect({
        pool: {
          connect: () => Promise.resolve(client),
          end: () => Promise.resolve(),
        },
      }),
    });

    let released = false;
    const release = async (): Promise<void> => {
      if (released) return;
      released = true;

      try {
        await client.query('RESET search_path');
        originalRelease();
      } catch (error) {
        // A connection with an unknown session state must never return to the pool.
        originalRelease(true);
        throw error;
      }
    };

    return {
      db,
      release,
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
      await release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.publicDb.destroy();
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
