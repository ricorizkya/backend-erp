import { Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly migrationsBasePath = path.join(__dirname, 'migrations');

  constructor(private pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.runPublicMigrations();
    await this.runMigrationsForAllTenants();
  }

  async runPublicMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.ensureMigrationHistoryTables(client);
      await this.runMigrationsInPath(
        client,
        path.join(this.migrationsBasePath, 'public'),
        'public',
      );
    } finally {
      client.release();
    }
  }

  async runTenantMigrations(tenantCode: string): Promise<void> {
    this.validateTenantCode(tenantCode);
    const schemaName = `tenant_${tenantCode}`;
    const client = await this.pool.connect();

    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await this.runMigrationsInPath(
        client,
        path.join(this.migrationsBasePath, 'tenant'),
        schemaName,
      );
      this.logger.log(`Tenant migrations complete for: ${tenantCode}`);
    } finally {
      client.release();
    }
  }

  async runMigrationsForAllTenants(): Promise<void> {
    const result = await this.pool.query<{ code: string }>(
      `SELECT code FROM tenants WHERE is_active = true`,
    );

    for (const { code } of result.rows) {
      await this.runTenantMigrations(code);
    }
  }

  private async ensureMigrationHistoryTables(
    client: PoolClient,
  ): Promise<void> {
    await client.query(`SET search_path TO public`);

    const bootstrapFile = path.join(
      this.migrationsBasePath,
      'public',
      '000_create_migrations_history.sql',
    );

    if (!fs.existsSync(bootstrapFile)) {
      throw new Error(`Bootstrap migrations not found: ${bootstrapFile}`);
    }

    const sql = fs.readFileSync(bootstrapFile, 'utf8');
    await client.query(sql);
  }

  private async runMigrationsInPath(
    client: PoolClient,
    migrationsPath: string,
    schemaName: string,
  ): Promise<void> {
    if (!fs.existsSync(migrationsPath)) {
      this.logger.warn(`Migration path not found: ${migrationsPath}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const filename of files) {
      if (filename === '000_create_migration_history.sql') continue;
      await this.applyMigration(client, migrationsPath, filename, schemaName);
    }
  }

  private async applyMigration(
    client: PoolClient,
    migrationsPath: string,
    filename: string,
    schemaName: string,
  ): Promise<void> {
    const filePath = path.join(migrationsPath, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = this.computeChecksum(sql);

    const existing = await client.query<{
      filename: string;
      checksum: string;
    }>(
      `SELECT filename, checksum FROM public.migration_history WHERE schema_name = $1 AND filename = $2`,
      [schemaName, filename],
    );

    if (existing.rows.length > 0) {
      const storedChecksum = existing.rows[0].checksum;

      if (storedChecksum !== checksum) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(
            `Migration checksum updated for ${filename} (${schemaName}) in development.`,
          );
          await client.query(
            `UPDATE public.migration_history SET checksum = $1 WHERE schema_name = $2 AND filename = $3`,
            [checksum, schemaName, filename],
          );
          return;
        }

        throw new Error(
          `Migration checksum mismatch: ${filename}` +
            `(schema : ${schemaName}). ` +
            `Do not edit migration file was running. ` +
            `Make new migration for schema.`,
        );
      }
      return;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO public.migration_history (schema_name, filename, checksum) VALUES ($1, $2, $3)`,
        [schemaName, filename, checksum],
      );
      await client.query('COMMIT');
      this.logger.log(`Applied migration: [${schemaName}] ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed migration: [${schemaName}] ${filename}`, error);
      throw error;
    }
  }

  private computeChecksum(content: string): string {
    const normalized = content.replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  private validateTenantCode(code: string): void {
    if (!/^[a-z0-9_]+$/.test(code)) {
      throw new Error(
        `Invalid tenant code: "${code}". ` +
          `Just lowercase, number, and underscore is allowed.`,
      );
    }
  }
}
