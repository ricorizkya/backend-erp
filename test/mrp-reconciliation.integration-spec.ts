import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Kysely } from 'kysely';
import { Pool } from 'pg';
jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
import { DatabaseService } from '../src/database/database.service';
import { MrpReconciliationService } from '../src/modules/production/services/mrp-reconciliation.service';
import { TenantSchema } from '../src/types/database.types';
import { getTestEnvironment } from './helpers/test-environment';
import {
  createMigratedTenantSchema,
  dropTestTenantSchema,
} from './helpers/migrated-tenant';

const schema = 'tenant_test_mrp_reconciliation';

type ReconciliationInternals = {
  reconcileTenant(db: Kysely<TenantSchema>, tenantCode: string): Promise<void>;
};

type FakeJobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';

class FakeJob {
  constructor(
    private readonly jobs: Map<string, FakeJob>,
    readonly id: string,
    state: FakeJobState,
  ) {
    this.state = state;
  }

  state: FakeJobState;

  getState(): Promise<FakeJobState> {
    return Promise.resolve(this.state);
  }

  isActive(): Promise<boolean> {
    return Promise.resolve(this.state === 'active');
  }

  remove(): Promise<void> {
    this.jobs.delete(this.id);
    return Promise.resolve();
  }
}

class FakeQueue {
  readonly jobs = new Map<string, FakeJob>();
  readonly add = jest.fn(
    (_name: string, _payload: unknown, options: { jobId: string }) => {
      const job = new FakeJob(this.jobs, options.jobId, 'waiting');
      this.jobs.set(options.jobId, job);
      return Promise.resolve(job);
    },
  );

  getJob(jobId: string): Promise<FakeJob | undefined> {
    return Promise.resolve(this.jobs.get(jobId));
  }
}

describe('MRP reconciliation state machine', () => {
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

  beforeAll(async () => {
    await createMigratedTenantSchema(pool, schema);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE "${schema}".mrp_runs RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await dropTestTenantSchema(pool, schema);
    await pool.end();
  });

  async function tenantDb() {
    return database.getTenantDb('test_mrp_reconciliation');
  }

  function service(queue: FakeQueue): ReconciliationInternals {
    return new MrpReconciliationService(
      queue as unknown as Queue,
      database,
    ) as unknown as ReconciliationInternals;
  }

  async function insertRun(
    status: 'pending' | 'running' | 'failed',
    retryCount = 0,
  ): Promise<number> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}".mrp_runs
        (run_date, plan_from, plan_to, status, triggered_by,
         retry_count, job_schema_version, created_at, started_at)
       VALUES (CURRENT_DATE, NOW(), NOW() + INTERVAL '7 days', $1::varchar, 1,
               $2::integer, 1, NOW() - INTERVAL '10 minutes',
               CASE WHEN $1::varchar = 'running' THEN NOW() - INTERVAL '10 minutes' END)
       RETURNING id::text`,
      [status, retryCount],
    );
    return Number(result.rows[0].id);
  }

  it('requeues an orphan pending run without incrementing retry_count', async () => {
    const runId = await insertRun('pending');
    const queue = new FakeQueue();
    const tenant = await tenantDb();
    try {
      await service(queue).reconcileTenant(
        tenant.db,
        'test_mrp_reconciliation',
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.jobs.has(`mrp-test_mrp_reconciliation-run-${runId}`)).toBe(
        true,
      );
      await expect(
        tenant.db
          .selectFrom('mrp_runs')
          .where('id', '=', runId)
          .select(['status', 'retry_count'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({ status: 'pending', retry_count: 0 });
    } finally {
      await tenant.release();
    }
  });

  it('retries failed runs three times and then marks them permanent', async () => {
    const runId = await insertRun('failed');
    const queue = new FakeQueue();
    const reconciliation = service(queue);
    const tenant = await tenantDb();
    try {
      for (let retry = 1; retry <= 3; retry += 1) {
        await reconciliation.reconcileTenant(
          tenant.db,
          'test_mrp_reconciliation',
        );
        await expect(
          tenant.db
            .selectFrom('mrp_runs')
            .where('id', '=', runId)
            .select(['status', 'retry_count'])
            .executeTakeFirst(),
        ).resolves.toMatchObject({ status: 'pending', retry_count: retry });

        const job = queue.jobs.get(`mrp-test_mrp_reconciliation-run-${runId}`);
        if (job) job.state = 'failed';
        await tenant.db
          .updateTable('mrp_runs')
          .set({ status: 'failed' })
          .where('id', '=', runId)
          .where('status', '=', 'pending')
          .execute();
      }

      await reconciliation.reconcileTenant(
        tenant.db,
        'test_mrp_reconciliation',
      );
      await expect(
        tenant.db
          .selectFrom('mrp_runs')
          .where('id', '=', runId)
          .select(['status', 'retry_count'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({ status: 'failed_permanent', retry_count: 3 });
    } finally {
      await tenant.release();
    }
  });

  it('does not retry a stuck run while its queue job is active', async () => {
    const runId = await insertRun('running', 1);
    const queue = new FakeQueue();
    const jobId = `mrp-test_mrp_reconciliation-run-${runId}`;
    queue.jobs.set(jobId, new FakeJob(queue.jobs, jobId, 'active'));
    const tenant = await tenantDb();
    try {
      await service(queue).reconcileTenant(
        tenant.db,
        'test_mrp_reconciliation',
      );
      await expect(
        tenant.db
          .selectFrom('mrp_runs')
          .where('id', '=', runId)
          .select(['status', 'retry_count'])
          .executeTakeFirst(),
      ).resolves.toMatchObject({ status: 'running', retry_count: 1 });
    } finally {
      await tenant.release();
    }
  });

  it('uses the stable job ID to prevent duplicate jobs from two reconcilers', async () => {
    const runId = await insertRun('pending');
    const redis = new IORedis(environment.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue(`mrp-reconciliation-${Date.now()}`, {
      connection: redis,
    });
    await queue.obliterate({ force: true });
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      const firstService = new MrpReconciliationService(
        queue,
        database,
      ) as unknown as ReconciliationInternals;
      const secondService = new MrpReconciliationService(
        queue,
        database,
      ) as unknown as ReconciliationInternals;
      await Promise.all([
        firstService.reconcileTenant(first.db, 'test_mrp_reconciliation'),
        secondService.reconcileTenant(second.db, 'test_mrp_reconciliation'),
      ]);

      expect(await queue.getJobCounts('waiting', 'delayed', 'active')).toEqual(
        expect.objectContaining({ waiting: 1 }),
      );
      expect(
        await queue.getJob(`mrp-test_mrp_reconciliation-run-${runId}`),
      ).toBeDefined();
    } finally {
      await first.release();
      await second.release();
      await queue.obliterate({ force: true });
      await queue.close();
      redis.disconnect();
    }
  });
});
