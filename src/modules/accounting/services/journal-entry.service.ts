import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { executeInTransaction } from '../../../database/transaction';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateJournalEntryDto,
  JournalEntryType,
  JournalFilterDto,
} from '../dto/accounting.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { FiscalPeriodService } from './fiscal-period.service';

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);

  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly periodService: FiscalPeriodService,
  ) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: JournalFilterDto) {
    const {
      page,
      limit,
      periodId,
      entryType,
      status,
      dateFrom,
      dateTo,
      search,
    } = filter;

    let query = db
      .selectFrom('journal_entries as je')
      .innerJoin('accounting_periods as ap', 'ap.id', 'je.period_id')
      .select([
        'je.id',
        'je.number',
        'je.entry_date',
        'je.entry_type',
        'je.description',
        'je.folio',
        'je.status',
        'je.total_debit',
        'je.total_credit',
        'je.created_by',
        'je.created_at',
        'je.posted_at',
        'ap.name as period_name',
      ]);

    if (periodId) query = query.where('je.period_id', '=', periodId);
    if (entryType) query = query.where('je.entry_type', '=', entryType as any);
    if (status) query = query.where('je.status', '=', status as any);
    if (dateFrom)
      query = query.where('je.entry_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('je.entry_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('je.number', 'ilike', `%${search}%`),
          eb('je.description', 'ilike', `%${search}%`),
          eb('je.folio', 'ilike', `%${search}%`),
        ]),
      );
    }

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('je.entry_date', 'desc')
      .orderBy('je.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, journalId: number) {
    const journal = await db
      .selectFrom('journal_entries as je')
      .innerJoin('accounting_periods as ap', 'ap.id', 'je.period_id')
      .where('je.id', '=', journalId)
      .select([
        'je.id',
        'je.number',
        'je.entry_date',
        'je.entry_type',
        'je.description',
        'je.folio',
        'je.status',
        'je.total_debit',
        'je.total_credit',
        'je.reference_type',
        'je.reference_id',
        'je.reversed_by',
        'je.reversal_of',
        'je.created_by',
        'je.created_at',
        'je.posted_by',
        'je.posted_at',
        'ap.name as period_name',
        'ap.status as period_status',
      ])
      .executeTakeFirst();

    if (!journal) throw new NotFoundException('Journal Entry tidak ditemukan');

    const lines = await db
      .selectFrom('journal_entry_lines as jel')
      .innerJoin('accounts as a', 'a.id', 'jel.account_id')
      .where('jel.journal_entry_id', '=', journalId)
      .select([
        'jel.id',
        'jel.line_number',
        'jel.debit',
        'jel.credit',
        'jel.description',
        'jel.folio',
        'jel.cost_center',
        'a.id as account_id',
        'a.code as account_code',
        'a.name as account_name',
        'a.account_type',
      ])
      .orderBy('jel.line_number', 'asc')
      .execute();

    return { ...journal, lines };
  }

  // ----------------------------------------------------------------
  // CREATE (status: draft)
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateJournalEntryDto,
    createdBy: number,
  ) {
    if (!dto.lines.length) {
      throw new BadRequestException(
        'Journal entry harus memiliki minimal dua baris',
      );
    }

    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit ?? 0), 0);

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      throw new BadRequestException(
        `Journal entry tidak balanced. Total debit: ${totalDebit}, total credit: ${totalCredit}, selisih: ${diff}`,
      );
    }

    for (const line of dto.lines) {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;

      if (debit === 0 && credit === 0) {
        throw new BadRequestException(
          `Baris ${line.lineNumber}: debit dan credit tidak boleh keduanya 0`,
        );
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          `Baris ${line.lineNumber}: tidak boleh ada nilai di debit dan credit sekaligus`,
        );
      }
    }

    return executeInTransaction(db, async (trx) => {
      const period = await trx
        .selectFrom('accounting_periods')
        .where('id', '=', dto.periodId)
        .where('status', '=', 'open')
        .select(['id', 'start_date', 'end_date'])
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new ConflictException(
          'Periode tidak ditemukan atau sudah ditutup/locked',
        );
      }

      const entryDate = new Date(dto.entryDate);
      if (
        entryDate < new Date(period.start_date) ||
        entryDate > new Date(period.end_date)
      ) {
        throw new ConflictException(
          'Tanggal journal berada di luar rentang periode akuntansi',
        );
      }

      const number = await this.docNumber.generate(trx, 'JE');

      const [journal] = await trx
        .insertInto('journal_entries')
        .values({
          number,
          period_id: dto.periodId,
          entry_date: entryDate,
          entry_type: dto.entryType,
          description: dto.description,
          folio: dto.folio ?? null,
          reference_type: dto.referenceType ?? null,
          reference_id: dto.referenceId ?? null,
          status: 'draft',
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      await trx
        .insertInto('journal_entry_lines')
        .values(
          dto.lines.map((line) => ({
            journal_entry_id: journal.id,
            account_id: line.accountId,
            line_number: line.lineNumber,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            description: line.description ?? null,
            cost_center: line.costCenter ?? null,
          })),
        )
        .execute();

      return this.findOne(trx, journal.id);
    });
  }

  // ----------------------------------------------------------------
  // POST JOURNAL — update GL + account_balances
  // ----------------------------------------------------------------

  async post(db: Kysely<TenantSchema>, journalId: number, postedBy: number) {
    return executeInTransaction(db, async (trx) => {
      const journal = await trx
        .selectFrom('journal_entries')
        .where('id', '=', journalId)
        .select([
          'id',
          'status',
          'period_id',
          'entry_date',
          'total_debit',
          'total_credit',
          'number',
        ])
        .forUpdate()
        .executeTakeFirst();

      if (!journal)
        throw new NotFoundException('Journal Entry tidak ditemukan');
      if (journal.status !== 'draft') {
        throw new ConflictException(
          `Hanya journal berstatus draft yang bisa diposting. Status: ${journal.status}`,
        );
      }

      const period = await trx
        .selectFrom('accounting_periods')
        .where('id', '=', journal.period_id)
        .where('status', '=', 'open')
        .select('id')
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new ConflictException(
          'Periode sudah ditutup, tidak bisa posting',
        );
      }

      const lines = await trx
        .selectFrom('journal_entry_lines')
        .where('journal_entry_id', '=', journalId)
        .selectAll()
        .execute();

      const accountIds = [
        ...new Set(lines.map((line) => line.account_id)),
      ].sort((a, b) => a - b);
      if (accountIds.length > 0) {
        await trx
          .selectFrom('accounts')
          .where('id', 'in', accountIds)
          .select('id')
          .orderBy('id')
          .forUpdate()
          .execute();
      }

      for (const line of lines) {
        const lastBalance = await trx
          .selectFrom('general_ledger')
          .where('account_id', '=', line.account_id)
          .where('period_id', '=', journal.period_id)
          .select('balance')
          .orderBy('created_at', 'desc')
          .executeTakeFirst();

        const prevBalance = Number(lastBalance?.balance ?? 0);
        const newBalance =
          prevBalance + Number(line.debit) - Number(line.credit);

        await trx
          .insertInto('general_ledger')
          .values({
            account_id: line.account_id,
            period_id: journal.period_id,
            journal_entry_id: journalId,
            journal_line_id: line.id,
            entry_date: journal.entry_date,
            folio: journal.number,
            debit: line.debit,
            credit: line.credit,
            balance: newBalance,
            description: line.description ?? null,
          })
          .execute();

        await trx
          .updateTable('journal_entry_lines')
          .set({ folio: journal.number })
          .where('id', '=', line.id)
          .execute();

        await trx
          .insertInto('account_balances')
          .values({
            account_id: line.account_id,
            period_id: journal.period_id,
            opening_balance: 0,
            total_debit: Number(line.debit),
            total_credit: Number(line.credit),
            closing_balance: newBalance,
          })
          .onConflict((oc) =>
            oc.columns(['account_id', 'period_id']).doUpdateSet((eb) => ({
              total_debit: eb(
                'account_balances.total_debit',
                '+',
                Number(line.debit),
              ),
              total_credit: eb(
                'account_balances.total_credit',
                '+',
                Number(line.credit),
              ),
              closing_balance: newBalance,
              updated_at: new Date(),
            })),
          )
          .execute();
      }

      const [updated] = await trx
        .updateTable('journal_entries')
        .set({
          status: 'posted',
          posted_by: postedBy,
          posted_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', journalId)
        .returningAll()
        .execute();

      this.logger.log(`Journal posted: ${journal.number} by user ${postedBy}`);
      return updated;
    });
  }

  // ----------------------------------------------------------------
  // REVERSE JOURNAL
  // ----------------------------------------------------------------

  async reverse(
    db: Kysely<TenantSchema>,
    journalId: number,
    reversedBy: number,
    periodId: number,
  ) {
    return executeInTransaction(db, async (trx) => {
      const current = await trx
        .selectFrom('journal_entries')
        .where('id', '=', journalId)
        .select(['id', 'status', 'reversed_by'])
        .forUpdate()
        .executeTakeFirst();

      if (!current)
        throw new NotFoundException('Journal Entry tidak ditemukan');
      if (current.status !== 'posted') {
        throw new ConflictException(
          'Hanya journal yang sudah posted yang bisa di-reverse',
        );
      }
      if (current.reversed_by) {
        throw new ConflictException('Journal ini sudah pernah di-reverse');
      }

      const period = await trx
        .selectFrom('accounting_periods')
        .where('id', '=', periodId)
        .where('status', '=', 'open')
        .select('id')
        .forShare()
        .executeTakeFirst();
      if (!period) throw new ConflictException('Periode reversal tidak open');

      const journal = await this.findOne(trx, journalId);
      const reversalDto: CreateJournalEntryDto = {
        periodId,
        entryDate: new Date().toISOString().split('T')[0],
        entryType: journal.entry_type as JournalEntryType,
        description: `REVERSAL: ${journal.description}`,
        folio: `REV-${journal.number}`,
        referenceType: 'journal_reversal',
        referenceId: journalId,
        lines: journal.lines.map((line) => ({
          accountId: line.account_id,
          lineNumber: line.line_number,
          debit: Number(line.credit),
          credit: Number(line.debit),
          description: line.description ?? undefined,
        })),
      };

      const reversal = await this.create(trx, reversalDto, reversedBy);
      await this.post(trx, reversal.id, reversedBy);

      await trx
        .updateTable('journal_entries')
        .set({
          status: 'reversed',
          reversed_by: reversal.id,
          updated_at: new Date(),
        })
        .where('id', '=', journalId)
        .execute();

      await trx
        .updateTable('journal_entries')
        .set({ reversal_of: journal.number })
        .where('id', '=', reversal.id)
        .execute();

      return reversal;
    });
  }

  // ----------------------------------------------------------------
  // AUTO-POST HELPER — dipanggil internal dari modul lain
  // ----------------------------------------------------------------

  async autoPost(
    db: Kysely<TenantSchema>,
    dto: Omit<CreateJournalEntryDto, 'periodId'> & { periodId?: number },
    postedBy: number,
  ): Promise<number> {
    try {
      return await executeInTransaction(db, async (trx) => {
        let periodId = dto.periodId;
        if (!periodId) {
          const period = await this.periodService.getActivePeriodForDate(
            trx,
            new Date(dto.entryDate),
          );
          periodId = period.id;
        }

        const payload: CreateJournalEntryDto = {
          ...dto,
          periodId,
          lines: dto.lines.map((l, idx) => ({
            ...l,
            lineNumber: l.lineNumber ?? idx + 1,
          })),
        };

        const journal = await this.create(trx, payload, postedBy);
        await this.post(trx, journal.id, postedBy);
        return journal.id;
      });
    } catch (error: unknown) {
      const pgError = error as { code?: string; constraint?: string };
      if (
        pgError.code !== '23505' ||
        pgError.constraint !== 'uq_journal_entry_business_reference' ||
        !dto.referenceType ||
        dto.referenceId === undefined
      ) {
        throw error;
      }

      const existing = await db
        .selectFrom('journal_entries')
        .where('reference_type', '=', dto.referenceType)
        .where('reference_id', '=', dto.referenceId)
        .select(['id', 'status'])
        .executeTakeFirst();

      if (!existing) throw error;
      if (existing.status === 'draft') {
        await this.post(db, existing.id, postedBy);
      } else if (existing.status === 'reversed') {
        throw new ConflictException(
          'Journal dengan referensi bisnis tersebut sudah di-reverse',
        );
      }

      return existing.id;
    }
  }
}
