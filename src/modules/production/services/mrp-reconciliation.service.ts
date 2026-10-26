import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../../../database/database.service';
import { TenantSchema } from '../../../types/database.types';
import { Kysely } from 'kysely';

type MrpRun = {
  id: number;
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'failed_permanent'
    | 'cancelled';
  retry_count: number;
  started_at: Date | null;
  plan_from: Date;
  plan_to: Date;
  job_schema_version: number;
  triggered_by: number;
};

@Injectable()
export class MrpReconciliationService {
  private readonly logger = new Logger(MrpReconciliationService.name);

  constructor(
    @InjectQueue('mrp-calculation') private readonly mrpQueue: Queue,
    private readonly databaseService: DatabaseService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileStuckJobs(): Promise<void> {
    try {
      const tenants = await this.databaseService
        .getPublicDb()
        .selectFrom('tenants')
        .select('code')
        .where('is_active', '=', true)
        .execute();

      for (const { code } of tenants) {
        const { db, release } = await this.databaseService.getTenantDb(code);
        try {
          await this.reconcileTenant(db, code);
        } finally {
          await release();
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error during MRP reconciliation cron: ${message}`);
    }
  }

  private async reconcileTenant(
    db: Kysely<TenantSchema>,
    tenantCode: string,
  ): Promise<void> {
    const pending = await db
      .selectFrom('mrp_runs')
      .where('status', '=', 'pending')
      .where('created_at', '<', new Date(Date.now() - 30_000))
      .selectAll()
      .execute();
    for (const run of pending) await this.ensureQueued(tenantCode, run);

    const failed = await db
      .selectFrom('mrp_runs')
      .where('status', '=', 'failed')
      .where('retry_count', '<', 3)
      .selectAll()
      .execute();
    for (const run of failed) {
      const retry = Number(run.retry_count) + 1;
      const updated = await db
        .updateTable('mrp_runs')
        .set({
          status: 'pending',
          retry_count: retry,
          error_message: `Retry attempt ${retry}`,
        })
        .where('id', '=', run.id)
        .where('status', '=', 'failed')
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) === 1) {
        await this.ensureQueued(tenantCode, {
          ...run,
          status: 'pending',
          retry_count: retry,
        });
      }
    }

    await db
      .updateTable('mrp_runs')
      .set({
        status: 'failed_permanent',
        completed_at: new Date(),
        error_message: 'Retry limit exceeded',
      })
      .where('status', '=', 'failed')
      .where('retry_count', '>=', 3)
      .execute();

    const stuck = await db
      .selectFrom('mrp_runs')
      .where('status', '=', 'running')
      .where('started_at', '<', new Date(Date.now() - 5 * 60_000))
      .selectAll()
      .execute();
    for (const run of stuck) {
      const job = await this.mrpQueue.getJob(`mrp-run-${run.id}`);
      if (job && (await job.isActive())) {
        this.triggerAlert(tenantCode, Number(run.id), {
          startedAt: run.started_at,
        });
        continue;
      }
      const retry = Number(run.retry_count) + 1;
      const updated = await db
        .updateTable('mrp_runs')
        .set(
          retry <= 3
            ? {
                status: 'pending',
                retry_count: retry,
                started_at: null,
                error_message: `Stuck job retry ${retry}`,
              }
            : {
                status: 'failed_permanent',
                completed_at: new Date(),
                error_message: 'Stuck job exceeded retry limit',
              },
        )
        .where('id', '=', run.id)
        .where('status', '=', 'running')
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) === 1 && retry <= 3) {
        await this.ensureQueued(tenantCode, {
          ...run,
          status: 'pending',
          retry_count: retry,
          started_at: null,
        });
      }
    }
  }

  private async ensureQueued(tenantCode: string, run: MrpRun): Promise<void> {
    const jobId = `mrp-run-${run.id}`;
    try {
      const existing = await this.mrpQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'waiting' || state === 'delayed' || state === 'active')
          return;
        await existing.remove();
      }
      await this.mrpQueue.add(
        'mrp-calculation',
        {
          schemaVersion: Number(run.job_schema_version),
          runId: Number(run.id),
          tenantSchema: `tenant_${tenantCode}`,
          planFrom: new Date(run.plan_from).toISOString(),
          planTo: new Date(run.plan_to).toISOString(),
          triggeredBy: Number(run.triggered_by),
        },
        { jobId, attempts: 1, removeOnComplete: false, removeOnFail: false },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not enqueue MRP run ${run.id}: ${message}`);
    }
  }

  private triggerAlert(
    tenant: string,
    runId: number,
    details: Record<string, unknown>,
  ): void {
    this.logger.error(
      `[CRITICAL_ALERT:LONG_RUNNING] MRP Run #${runId} on tenant=${tenant}: ${JSON.stringify(details)}`,
    );
  }
}
