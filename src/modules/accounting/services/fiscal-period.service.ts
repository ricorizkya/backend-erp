import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { executeInTransaction } from '../../../database/transaction';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateFiscalYearDto,
  CreateAccountingPeriodDto,
  PeriodStatus,
  UpdatePeriodStatusDto,
} from '../dto/accounting.dto';

@Injectable()
export class FiscalPeriodService {
  // ================================================================
  // FISCAL YEARS
  // ================================================================

  async findAllFiscalYears(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('fiscal_years')
      .selectAll()
      .orderBy('start_date', 'desc')
      .execute();
  }

  async findOneFiscalYear(db: Kysely<TenantSchema>, yearId: number) {
    const year = await db
      .selectFrom('fiscal_years')
      .where('id', '=', yearId)
      .selectAll()
      .executeTakeFirst();

    if (!year) throw new NotFoundException('Fiscal Year tidak ditemukan');

    const periods = await db
      .selectFrom('accounting_periods')
      .where('fiscal_year_id', '=', yearId)
      .selectAll()
      .orderBy('period_number', 'asc')
      .execute();

    return { ...year, periods };
  }

  async createFiscalYear(
    db: Kysely<TenantSchema>,
    dto: CreateFiscalYearDto,
    createdBy: number,
  ) {
    if (new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException(
        'Tanggal mulai harus sebelum tanggal akhir',
      );
    }

    const [year] = await db
      .insertInto('fiscal_years')
      .values({
        name: dto.name,
        start_date: new Date(dto.startDate),
        end_date: new Date(dto.endDate),
        status: 'open',
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return year;
  }

  async closeFiscalYear(db: Kysely<TenantSchema>, yearId: number) {
    return executeInTransaction(db, async (trx) => {
      const year = await trx
        .selectFrom('fiscal_years')
        .where('id', '=', yearId)
        .select(['id', 'status'])
        .forUpdate()
        .executeTakeFirst();

      if (!year) throw new NotFoundException('Fiscal Year tidak ditemukan');
      if (year.status === 'closed') {
        throw new ConflictException('Fiscal Year sudah ditutup');
      }

      const openPeriods = await trx
        .selectFrom('accounting_periods')
        .where('fiscal_year_id', '=', yearId)
        .where('status', '=', 'open')
        .select('id')
        .forUpdate()
        .executeTakeFirst();

      if (openPeriods) {
        throw new ConflictException(
          'Semua periode akuntansi harus ditutup sebelum menutup fiscal year',
        );
      }

      const [updated] = await trx
        .updateTable('fiscal_years')
        .set({ status: 'closed' })
        .where('id', '=', yearId)
        .where('status', '=', 'open')
        .returningAll()
        .execute();

      return updated;
    });
  }

  // ================================================================
  // ACCOUNTING PERIODS
  // ================================================================

  async findAllPeriods(db: Kysely<TenantSchema>, fiscalYearId?: number) {
    let query = db
      .selectFrom('accounting_periods as ap')
      .innerJoin('fiscal_years as fy', 'fy.id', 'ap.fiscal_year_id')
      .select([
        'ap.id',
        'ap.name',
        'ap.period_number',
        'ap.start_date',
        'ap.end_date',
        'ap.status',
        'fy.name as fiscal_year_name',
      ]);

    if (fiscalYearId) {
      query = query.where('ap.fiscal_year_id', '=', fiscalYearId);
    }

    return query.orderBy('ap.start_date', 'desc').execute();
  }

  async createPeriod(db: Kysely<TenantSchema>, dto: CreateAccountingPeriodDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate >= endDate) {
      throw new BadRequestException(
        'Tanggal mulai periode harus sebelum tanggal akhir',
      );
    }

    return executeInTransaction(db, async (trx) => {
      const fiscalYear = await trx
        .selectFrom('fiscal_years')
        .where('id', '=', dto.fiscalYearId)
        .where('status', '=', 'open')
        .select(['id', 'start_date', 'end_date'])
        .forUpdate()
        .executeTakeFirst();

      if (!fiscalYear) {
        throw new NotFoundException(
          'Fiscal Year tidak ditemukan atau sudah ditutup',
        );
      }
      if (
        startDate < new Date(fiscalYear.start_date) ||
        endDate > new Date(fiscalYear.end_date)
      ) {
        throw new BadRequestException(
          'Rentang periode harus berada di dalam rentang fiscal year',
        );
      }

      const existingNumber = await trx
        .selectFrom('accounting_periods')
        .where('fiscal_year_id', '=', dto.fiscalYearId)
        .where('period_number', '=', dto.periodNumber)
        .select('id')
        .executeTakeFirst();
      if (existingNumber) {
        throw new ConflictException(
          `Period ${dto.periodNumber} sudah ada di fiscal year ini`,
        );
      }

      const existing = await trx
        .selectFrom('accounting_periods')
        .where('fiscal_year_id', '=', dto.fiscalYearId)
        .where((eb) =>
          eb.and([
            eb('start_date', '<', endDate),
            eb('end_date', '>', startDate),
          ]),
        )
        .select('id')
        .executeTakeFirst();

      if (existing) {
        throw new ConflictException(
          'Rentang periode bertabrakan dengan periode yang sudah ada',
        );
      }

      const [period] = await trx
        .insertInto('accounting_periods')
        .values({
          fiscal_year_id: dto.fiscalYearId,
          name: dto.name,
          period_number: dto.periodNumber,
          start_date: startDate,
          end_date: endDate,
          status: 'open',
        })
        .returningAll()
        .execute();

      return period;
    });
  }

  async updatePeriodStatus(
    db: Kysely<TenantSchema>,
    periodId: number,
    dto: UpdatePeriodStatusDto,
  ) {
    return executeInTransaction(db, async (trx) => {
      const period = await trx
        .selectFrom('accounting_periods')
        .where('id', '=', periodId)
        .select(['id', 'status'])
        .forUpdate()
        .executeTakeFirst();

      if (!period) throw new NotFoundException('Periode tidak ditemukan');

      if (period.status === 'locked') {
        throw new ConflictException(
          'Periode yang sudah locked tidak bisa diubah',
        );
      }

      const validTransitions: Record<string, string[]> = {
        open: ['closed', 'locked'],
        closed: ['locked'],
      };

      const allowed = validTransitions[period.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Tidak bisa mengubah status dari "${period.status}" ke "${dto.status}"`,
        );
      }

      if (
        dto.status === PeriodStatus.CLOSED ||
        dto.status === PeriodStatus.LOCKED
      ) {
        const draft = await trx
          .selectFrom('journal_entries')
          .where('period_id', '=', periodId)
          .where('status', '=', 'draft')
          .select('id')
          .executeTakeFirst();
        if (draft) {
          throw new ConflictException(
            'Periode tidak bisa ditutup karena masih memiliki journal draft',
          );
        }
      }

      const [updated] = await trx
        .updateTable('accounting_periods')
        .set({ status: dto.status })
        .where('id', '=', periodId)
        .where('status', '=', period.status)
        .returningAll()
        .execute();

      return updated;
    });
  }

  // Helper: ambil periode aktif (open) untuk tanggal tertentu
  async getActivePeriodForDate(db: Kysely<TenantSchema>, date: Date) {
    const period = await db
      .selectFrom('accounting_periods')
      .innerJoin(
        'fiscal_years',
        'fiscal_years.id',
        'accounting_periods.fiscal_year_id',
      )
      .where('accounting_periods.start_date', '<=', date)
      .where('accounting_periods.end_date', '>=', date)
      .where('accounting_periods.status', '=', 'open')
      .where('fiscal_years.status', '=', 'open')
      .select([
        'accounting_periods.id',
        'accounting_periods.name',
        'accounting_periods.period_number',
      ])
      .executeTakeFirst();

    if (!period) {
      throw new ConflictException(
        `Tidak ada periode akuntansi yang open untuk tanggal ${date.toISOString().split('T')[0]}. Pastikan periode sudah dibuat dan statusnya open.`,
      );
    }

    return period;
  }
}
