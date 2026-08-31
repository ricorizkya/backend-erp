import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { TriggerMrpRunDto, MrpRunFilterDto } from '../dto/mrp-run.dto';

// Kode error Postgres untuk unique_violation.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class MrpRunService {
  private readonly logger = new Logger(MrpRunService.name);

  constructor(
    @InjectQueue('mrp-calculation') private readonly mrpQueue: Queue,
  ) {}

  // ----------------------------------------------------------------
  // TRIGGER MRP RUN
  // ----------------------------------------------------------------

  async triggerRun(
    db: Kysely<TenantSchema>,
    dto: TriggerMrpRunDto,
    triggeredBy: number,
    tenantCode: string,
  ) {
    if (new Date(dto.planFrom) > new Date(dto.planTo)) {
      throw new BadRequestException(
        'planFrom harus sebelum atau sama dengan planTo',
      );
    }

    // Cek cepat di level aplikasi — memberi pesan error yang jelas di
    // kasus umum (tidak ada race condition). Ini BUKAN satu-satunya
    // pertahanan — lihat try/catch di sekitar INSERT di bawah, yang
    // menangkap unique_violation dari idx_mrp_runs_one_active_per_tenant
    // sebagai pertahanan terakhir kalau ada race condition nyata
    // (dua request trigger bersamaan lolos cek ini sekaligus).
    const activeRun = await db
      .selectFrom('mrp_runs')
      .where('status', 'in', ['pending', 'running'])
      .select(['id', 'status', 'created_at'])
      .executeTakeFirst();

    if (activeRun) {
      throw new ConflictException(
        `MRP Run #${activeRun.id} masih berjalan (status: ${activeRun.status}). Tunggu hingga selesai atau batalkan sebelum menjalankan MRP baru.`,
      );
    }

    const tenantSchema = `tenant_${tenantCode}`;

    // 1. Insert row mrp_runs dengan status 'pending'
    const insertMrpRun = () =>
      db
        .insertInto('mrp_runs')
        .values({
          plan_from: new Date(dto.planFrom),
          plan_to: new Date(dto.planTo),
          status: 'pending',
          triggered_by: triggeredBy,
          job_schema_version: 1,
          retry_count: 0,
        })
        .returningAll()
        .execute();

    let run: Awaited<ReturnType<typeof insertMrpRun>>[number];

    try {
      const [inserted] = await insertMrpRun();
      run = inserted;
    } catch (err: unknown) {
      // Pertahanan terakhir terhadap race condition: idx_mrp_runs_one_active_per_tenant
      // (partial unique index, migration 012) menahan INSERT kalau ada
      // request lain yang lolos cek activeRun di atas hampir bersamaan.
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'MRP Run lain baru saja mulai berjalan untuk tenant ini. Tunggu hingga selesai sebelum mencoba lagi.',
        );
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to insert mrp_runs row: ${errMsg}`);
      throw err;
    }

    const runId = Number(run.id);

    // 2. Push job ke BullMQ queue 'mrp-calculation'
    try {
      await this.mrpQueue.add(
        'mrp-calculation',
        {
          schemaVersion: 1,
          runId,
          tenantSchema,
          planFrom: dto.planFrom,
          planTo: dto.planTo,
          triggeredBy,
        },
        {
          jobId: runId.toString(),
          attempts: 1, // Retry dimatikan di BullMQ — di-handle oleh reconciliation service
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      this.logger.log(
        `Queued MRP Calculation runId=${runId} for schema=${tenantSchema}`,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Failed to add MRP job to BullMQ queue: ${errMsg}`,
        stack,
      );
      await db
        .updateTable('mrp_runs')
        .set({
          status: 'failed',
          error_message: `Queue error: ${errMsg}`,
        })
        .where('id', '=', runId)
        .execute();

      throw new ConflictException(
        `Gagal menjadwalkan job MRP ke queue: ${errMsg}`,
      );
    }

    return {
      runId,
      status: run.status,
      planFrom: dto.planFrom,
      planTo: dto.planTo,
      createdAt: run.created_at,
    };
  }

  // ----------------------------------------------------------------
  // LIST MRP RUNS
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: MrpRunFilterDto) {
    const { page = 1, limit = 20, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('mrp_runs')
      .select([
        'id',
        'run_date',
        'plan_from',
        'plan_to',
        'status',
        'total_planned_production',
        'total_planned_purchase',
        'retry_count',
        'started_at',
        'completed_at',
        'duration_ms',
        'error_message',
        'triggered_by',
        'created_at',
      ]);

    if (status) query = query.where('status', '=', status as any);
    if (dateFrom) query = query.where('run_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('run_date', '<=', new Date(dateTo));

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('run_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL MRP RUN
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, runId: number) {
    const run = await db
      .selectFrom('mrp_runs')
      .where('id', '=', runId)
      .selectAll()
      .executeTakeFirst();

    if (!run) throw new NotFoundException('MRP Run tidak ditemukan');

    const plannedOrdersSummary = await db
      .selectFrom('planned_orders')
      .where('mrp_run_id', '=', runId)
      .select([
        'order_type',
        'status',
        db.fn.countAll<number>().as('count'),
        db.fn.sum<number>('quantity').as('total_qty'),
      ])
      .groupBy(['order_type', 'status'])
      .execute();

    return {
      ...run,
      summary: plannedOrdersSummary,
    };
  }

  // ----------------------------------------------------------------
  // CANCEL MRP RUN
  // ----------------------------------------------------------------

  async cancel(db: Kysely<TenantSchema>, runId: number) {
    const run = await db
      .selectFrom('mrp_runs')
      .where('id', '=', runId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!run) throw new NotFoundException('MRP Run tidak ditemukan');
    if (!['pending', 'running'].includes(run.status)) {
      throw new ConflictException(
        `Hanya MRP Run berstatus pending atau running yang bisa dibatalkan. Status saat ini: ${run.status}`,
      );
    }

    await db
      .updateTable('mrp_runs')
      .set({
        status: 'failed',
        error_message: 'Cancelled by user',
      })
      .where('id', '=', runId)
      .execute();

    // Hapus dari BullMQ jika masih di queue
    try {
      const job = await this.mrpQueue.getJob(runId.toString());
      if (job) {
        await job.remove();
      }
    } catch {
      // ignore queue removal error
    }

    return { message: `MRP Run #${runId} berhasil dibatalkan` };
  }
}
