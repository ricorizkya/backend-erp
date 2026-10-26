import { Pool } from 'pg';
import type { Queue } from 'bullmq';
jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
import { DatabaseService } from '../src/database/database.service';
import { MrpRunService } from '../src/modules/production/services/mrp-run.service';
import { TriggerMrpRunDto } from '../src/modules/production/dto/mrp-run.dto';
import {
  assertSafeTestTenantSchema,
  getTestEnvironment,
} from './helpers/test-environment';

const schema = 'tenant_test_mrp_run';

describe('MRP run workflow against PostgreSQL', () => {
  const environment = getTestEnvironment();
  const pool = new Pool({
    host: environment.DB_HOST,
    port: Number(environment.DB_PORT),
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    max: 8,
  });
  const database = new DatabaseService(pool);
  const dto: TriggerMrpRunDto = {
    planFrom: '2026-01-01T00:00:00.000Z',
    planTo: '2026-01-31T00:00:00.000Z',
  };

  beforeAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`
      CREATE SCHEMA "${schema}";
      CREATE TABLE "${schema}".mrp_runs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        run_date DATE NOT NULL DEFAULT CURRENT_DATE,
        plan_from TIMESTAMPTZ NOT NULL,
        plan_to TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        triggered_by BIGINT NOT NULL,
        job_schema_version INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX mrp_runs_one_active
        ON "${schema}".mrp_runs ((1))
        WHERE status IN ('pending', 'running');
      CREATE TABLE "${schema}".planned_orders (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        mrp_run_id BIGINT NOT NULL,
        order_type TEXT NOT NULL,
        status TEXT NOT NULL,
        quantity NUMERIC NOT NULL
      );
    `);
  });

  afterAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  async function tenantDb() {
    return database.getTenantDb('test_mrp_run');
  }

  function queue(shouldFail = false): Queue {
    const add = jest.fn(() => {
      if (shouldFail) throw new Error('Redis unavailable');
      return Promise.resolve({} as never);
    });
    const getJob = jest.fn(() => Promise.resolve(undefined));
    return { add, getJob } as unknown as Queue;
  }

  async function clearRuns() {
    await pool.query(`TRUNCATE "${schema}".mrp_runs RESTART IDENTITY`);
  }

  it('allows only one parallel trigger and creates one queue job', async () => {
    await clearRuns();
    const service = new MrpRunService(queue());
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      const results = await Promise.allSettled([
        service.triggerRun(first.db, dto, 1, 'test_mrp_run'),
        service.triggerRun(second.db, dto, 1, 'test_mrp_run'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const count = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${schema}".mrp_runs`,
      );
      expect(count.rows[0].count).toBe(1);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('keeps the run pending when queue enqueue fails', async () => {
    await clearRuns();
    const service = new MrpRunService(queue(true));
    const tenant = await tenantDb();
    try {
      const result = await service.triggerRun(
        tenant.db,
        dto,
        1,
        'test_mrp_run',
      );
      expect(result.status).toBe('pending');
      const row = await pool.query<{ status: string; error_message: string }>(
        `SELECT status, error_message FROM "${schema}".mrp_runs`,
      );
      expect(row.rows[0]).toMatchObject({
        status: 'pending',
        error_message: 'Queue error: Redis unavailable',
      });
    } finally {
      await tenant.release();
    }
  });

  it('cancels pending runs and rejects a second cancellation', async () => {
    await clearRuns();
    const q = queue();
    const service = new MrpRunService(q);
    const tenant = await tenantDb();
    try {
      const created = await service.triggerRun(
        tenant.db,
        dto,
        1,
        'test_mrp_run',
      );
      await expect(
        service.cancel(tenant.db, created.runId, 'test_mrp_run'),
      ).resolves.toBeDefined();
      await expect(
        service.cancel(tenant.db, created.runId, 'test_mrp_run'),
      ).rejects.toThrow('tidak dapat dibatalkan');
      const row = await pool.query<{ status: string }>(
        `SELECT status FROM "${schema}".mrp_runs WHERE id = $1`,
        [created.runId],
      );
      expect(row.rows[0].status).toBe('cancelled');
    } finally {
      await tenant.release();
    }
  });
});
