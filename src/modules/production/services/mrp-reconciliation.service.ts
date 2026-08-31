import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Pool } from 'pg';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class MrpReconciliationService {
  private readonly logger = new Logger(MrpReconciliationService.name);

  constructor(
    @InjectQueue('mrp-calculation') private readonly mrpQueue: Queue,
    private readonly pool: Pool,
    private readonly databaseService: DatabaseService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileStuckJobs() {
    try {
      // Ambil semua tenant aktif
      const tenantsResult = await this.pool.query<{ code: string }>(
        `SELECT code FROM public.tenants WHERE is_active = true`,
      );

      for (const { code } of tenantsResult.rows) {
        const { db, release } = await this.databaseService.getTenantDb(code);
        try {
          // Cari run yang stuck di 'running' lebih dari 5 menit
          const stuckRuns = await db
            .selectFrom('mrp_runs')
            .where('status', '=', 'running')
            .where(
              'started_at',
              '<',
              new Date(Date.now() - 5 * 60 * 1000), // 5 menit lalu
            )
            .selectAll()
            .execute();

          for (const run of stuckRuns) {
            const runId = Number(run.id);

            // Cek status job di BullMQ — simpan referensi existingJob di
            // outer scope supaya bisa di-remove sebelum push ulang di bawah.
            let isActiveInQueue = false;
            let existingJob: Awaited<ReturnType<Queue['getJob']>> | undefined;
            try {
              existingJob = await this.mrpQueue.getJob(runId.toString());
              if (existingJob) {
                isActiveInQueue = await existingJob.isActive();
              }
            } catch (e: unknown) {
              const errMsg = e instanceof Error ? e.message : String(e);
              this.logger.warn(
                `Failed to check BullMQ job status for runId=${runId}: ${errMsg}`,
              );
            }

            if (isActiveInQueue) {
              this.logger.log(
                `MRP runId=${runId} is still actively processing in worker. Skipping reconciliation.`,
              );
              continue;
            }

            const currentRetries = Number(run.retry_count ?? 0);

            if (currentRetries < 3) {
              this.logger.warn(
                `Reconciling stuck MRP runId=${runId} on tenant=${code}. Retrying (attempt ${currentRetries + 1}/3)...`,
              );

              await db
                .updateTable('mrp_runs')
                .set({
                  status: 'pending',
                  retry_count: currentRetries + 1,
                  started_at: null,
                  error_message: `Stuck job detected. Retry attempt ${currentRetries + 1}`,
                })
                .where('id', '=', runId)
                .execute();

              try {
                // WAJIB: hapus job lama dulu sebelum push ulang dengan jobId
                // yang sama. BullMQ dedupe berdasarkan jobId — karena
                // removeOnComplete/removeOnFail di-set false (untuk audit),
                // job lama yang sudah 'failed' akan tetap ada di Redis.
                // Tanpa remove() ini, add() dengan jobId sama TIDAK akan
                // membuat job baru yang bisa diambil worker dari status
                // 'waiting' — retry jadi silent no-op. Audit trail tetap
                // aman karena retry_count & error_message sudah tercatat
                // di mrp_runs (Postgres), tidak bergantung pada BullMQ
                // menyimpan job lama.
                if (existingJob) {
                  await existingJob.remove();
                }

                await this.mrpQueue.add(
                  'mrp-calculation',
                  {
                    schemaVersion: 1,
                    runId,
                    tenantSchema: `tenant_${code}`,
                    planFrom: run.plan_from.toISOString().split('T')[0],
                    planTo: run.plan_to.toISOString().split('T')[0],
                    triggeredBy: Number(run.triggered_by),
                  },
                  {
                    jobId: runId.toString(),
                    attempts: 1,
                    removeOnComplete: false,
                    removeOnFail: false,
                  },
                );
              } catch (queueErr: unknown) {
                const qMsg =
                  queueErr instanceof Error
                    ? queueErr.message
                    : String(queueErr);
                this.logger.error(
                  `Failed to re-queue MRP runId=${runId}: ${qMsg}`,
                );
              }
            } else {
              this.logger.error(
                `MRP runId=${runId} on tenant=${code} failed permanently after 3 retry attempts.`,
              );

              await db
                .updateTable('mrp_runs')
                .set({
                  status: 'failed_permanent',
                  completed_at: new Date(),
                  error_message:
                    'Job stuck and exceeded maximum retry limit (3 attempts)',
                })
                .where('id', '=', runId)
                .execute();
            }
          }
        } finally {
          release();
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Error during MRP reconciliation cron: ${errMsg}`,
        stack,
      );
    }
  }
}
