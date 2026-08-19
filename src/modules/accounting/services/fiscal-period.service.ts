import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateFiscalYearDto,
  CreateAccountingPeriodDto,
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
      throw new BadRequestException('Tanggal mulai harus sebelum tanggal akhir');
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
    const year = await db
      .selectFrom('fiscal_years')
      .where('id', '=', yearId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!year) throw new NotFoundException('Fiscal Year tidak ditemukan');
    if (year.status === 'closed') {
      throw new ConflictException('Fiscal Year sudah ditutup');
    }

    // Semua periode harus sudah closed
    const openPeriods = await db
      .selectFrom('accounting_periods')
      .where('fiscal_year_id', '=', yearId)
      .where('status', '!=', 'closed')
      .select('id')
      .executeTakeFirst();

    if (openPeriods) {
      throw new ConflictException(
        'Semua periode akuntansi harus ditutup sebelum menutup fiscal year',
      );
    }

    const [updated] = await db
      .updateTable('fiscal_years')
      .set({ status: 'closed' })
      .where('id', '=', yearId)
      .returningAll()
      .execute();

    return updated;
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
    const fiscalYear = await db
      .selectFrom('fiscal_years')
      .where('id', '=', dto.fiscalYearId)
      .where('status', '=', 'open')
      .select('id')
      .executeTakeFirst();

    if (!fiscalYear) {
      throw new NotFoundException('Fiscal Year tidak ditemukan atau sudah ditutup');
    }

    // Cek period number unik dalam fiscal year
    const existing = await db
      .selectFrom('accounting_periods')
      .where('fiscal_year_id', '=', dto.fiscalYearId)
      .where('period_number', '=', dto.periodNumber)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Period ${dto.periodNumber} sudah ada di fiscal year ini`,
      );
    }

    const [period] = await db
      .insertInto('accounting_periods')
      .values({
        fiscal_year_id: dto.fiscalYearId,
        name: dto.name,
        period_number: dto.periodNumber,
        start_date: new Date(dto.startDate),
        end_date: new Date(dto.endDate),
        status: 'open',
      })
      .returningAll()
      .execute();

    return period;
  }

  async updatePeriodStatus(
    db: Kysely<TenantSchema>,
    periodId: number,
    dto: UpdatePeriodStatusDto,
  ) {
    const period = await db
      .selectFrom('accounting_periods')
      .where('id', '=', periodId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!period) throw new NotFoundException('Periode tidak ditemukan');

    if (period.status === 'locked') {
      throw new ConflictException('Periode yang sudah locked tidak bisa diubah');
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

    const [updated] = await db
      .updateTable('accounting_periods')
      .set({ status: dto.status })
      .where('id', '=', periodId)
      .returningAll()
      .execute();

    return updated;
  }

  // Helper: ambil periode aktif (open) untuk tanggal tertentu
  async getActivePeriodForDate(db: Kysely<TenantSchema>, date: Date) {
    const period = await db
      .selectFrom('accounting_periods')
      .where('start_date', '<=', date)
      .where('end_date', '>=', date)
      .where('status', '=', 'open')
      .select(['id', 'name', 'period_number'])
      .executeTakeFirst();

    if (!period) {
      throw new ConflictException(
        `Tidak ada periode akuntansi yang open untuk tanggal ${date.toISOString().split('T')[0]}. Pastikan periode sudah dibuat dan statusnya open.`,
      );
    }

    return period;
  }
}
