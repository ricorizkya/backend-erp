import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateBankAccountDto,
  CreateBankTransactionDto,
  BankReconciliationDto,
  CreateTaxCodeDto,
  CreateOverheadRateDto,
} from '../dto/accounting.dto';

@Injectable()
export class BankService {
  // ================================================================
  // BANK ACCOUNTS
  // ================================================================

  async findAllBankAccounts(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('bank_accounts as ba')
      .innerJoin('accounts as a', 'a.id', 'ba.account_id')
      .where('ba.is_active', '=', true)
      .select([
        'ba.id',
        'ba.name',
        'ba.bank_name',
        'ba.account_number',
        'ba.branch_name',
        'ba.currency',
        'a.code as gl_account_code',
        'a.name as gl_account_name',
      ])
      .execute();
  }

  async createBankAccount(
    db: Kysely<TenantSchema>,
    dto: CreateBankAccountDto,
  ) {
    if (dto.accountNumber) {
      const existing = await db
        .selectFrom('bank_accounts')
        .where('account_number', '=', dto.accountNumber)
        .select('id')
        .executeTakeFirst();

      if (existing) {
        throw new ConflictException(
          `Nomor rekening "${dto.accountNumber}" sudah terdaftar`,
        );
      }
    }

    const [ba] = await db
      .insertInto('bank_accounts')
      .values({
        account_id: dto.accountId,
        name: dto.name,
        bank_name: dto.bankName ?? null,
        account_number: dto.accountNumber ?? null,
        branch_name: dto.branchName ?? null,
        currency: 'IDR',
      })
      .returningAll()
      .execute();

    return ba;
  }

  // ================================================================
  // BANK TRANSACTIONS
  // ================================================================

  async findTransactions(
    db: Kysely<TenantSchema>,
    bankAccountId: number,
    dateFrom?: string,
    dateTo?: string,
  ) {
    let query = db
      .selectFrom('bank_transactions as bt')
      .where('bt.bank_account_id', '=', bankAccountId)
      .select([
        'bt.id',
        'bt.transaction_date',
        'bt.transaction_type',
        'bt.amount',
        'bt.reference_no',
        'bt.description',
        'bt.is_reconciled',
        'bt.created_at',
      ]);

    if (dateFrom)
      query = query.where('bt.transaction_date', '>=', new Date(dateFrom));
    if (dateTo)
      query = query.where('bt.transaction_date', '<=', new Date(dateTo));

    return query.orderBy('bt.transaction_date', 'desc').execute();
  }

  async createTransaction(
    db: Kysely<TenantSchema>,
    dto: CreateBankTransactionDto,
    createdBy: number,
  ) {
    const bankAccount = await db
      .selectFrom('bank_accounts')
      .where('id', '=', dto.bankAccountId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!bankAccount)
      throw new NotFoundException('Bank account tidak ditemukan');

    const [tx] = await db
      .insertInto('bank_transactions')
      .values({
        bank_account_id: dto.bankAccountId,
        transaction_date: new Date(dto.transactionDate),
        transaction_type: dto.transactionType,
        amount: dto.amount,
        reference_no: dto.referenceNo ?? null,
        description: dto.description ?? null,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return tx;
  }

  // ================================================================
  // BANK RECONCILIATION
  // ================================================================

  async findReconciliations(
    db: Kysely<TenantSchema>,
    bankAccountId: number,
  ) {
    return db
      .selectFrom('bank_reconciliations as br')
      .innerJoin('accounting_periods as ap', 'ap.id', 'br.period_id')
      .where('br.bank_account_id', '=', bankAccountId)
      .select([
        'br.id',
        'br.reconciliation_date',
        'br.status',
        'br.statement_balance',
        'br.book_balance',
        'br.difference',
        'br.notes',
        'br.created_at',
        'ap.name as period_name',
      ])
      .orderBy('br.reconciliation_date', 'desc')
      .execute();
  }

  async createReconciliation(
    db: Kysely<TenantSchema>,
    dto: BankReconciliationDto,
    createdBy: number,
  ) {
    const existing = await db
      .selectFrom('bank_reconciliations')
      .where('bank_account_id', '=', dto.bankAccountId)
      .where('period_id', '=', dto.periodId)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        'Rekonsiliasi untuk bank dan periode ini sudah ada',
      );
    }

    const [recon] = await db
      .insertInto('bank_reconciliations')
      .values({
        bank_account_id: dto.bankAccountId,
        period_id: dto.periodId,
        reconciliation_date: new Date(dto.reconciliationDate),
        statement_balance: dto.statementBalance,
        book_balance: dto.bookBalance,
        status: 'draft',
        notes: dto.notes ?? null,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return recon;
  }

  async completeReconciliation(
    db: Kysely<TenantSchema>,
    reconId: number,
    userId: number,
  ) {
    const recon = await db
      .selectFrom('bank_reconciliations')
      .where('id', '=', reconId)
      .select(['id', 'status', 'difference'])
      .executeTakeFirst();

    if (!recon) throw new NotFoundException('Rekonsiliasi tidak ditemukan');
    if (recon.status !== 'draft') {
      throw new ConflictException('Rekonsiliasi sudah selesai');
    }

    if (Math.abs(Number(recon.difference ?? 0)) > 0.01) {
      throw new ConflictException(
        `Rekonsiliasi tidak bisa diselesaikan karena ada selisih: ${recon.difference}. Pastikan semua transaksi sudah dicocokkan.`,
      );
    }

    const [updated] = await db
      .updateTable('bank_reconciliations')
      .set({
        status: 'completed',
        completed_by: userId,
        completed_at: new Date(),
      })
      .where('id', '=', reconId)
      .returningAll()
      .execute();

    await db
      .updateTable('bank_transactions')
      .set({
        is_reconciled: true,
        reconciled_at: new Date(),
        reconciled_by: userId,
      })
      .where('bank_account_id', '=', updated.bank_account_id)
      .where('is_reconciled', '=', false)
      .execute();

    return updated;
  }

  // ================================================================
  // TAX CODES
  // ================================================================

  async findAllTaxCodes(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('tax_codes as tc')
      .innerJoin('accounts as a', 'a.id', 'tc.account_id')
      .where('tc.is_active', '=', true)
      .select([
        'tc.id',
        'tc.code',
        'tc.name',
        'tc.tax_type',
        'tc.rate',
        'a.code as account_code',
        'a.name as account_name',
      ])
      .orderBy('tc.code', 'asc')
      .execute();
  }

  async createTaxCode(db: Kysely<TenantSchema>, dto: CreateTaxCodeDto) {
    const existing = await db
      .selectFrom('tax_codes')
      .where('code', '=', dto.code.toUpperCase())
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Tax code "${dto.code}" sudah ada`);
    }

    const [taxCode] = await db
      .insertInto('tax_codes')
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name,
        tax_type: dto.taxType,
        rate: dto.rate,
        account_id: dto.accountId,
      })
      .returningAll()
      .execute();

    return taxCode;
  }

  // ================================================================
  // OVERHEAD RATES
  // ================================================================

  async findOverheadRates(db: Kysely<TenantSchema>, periodId?: number) {
    let query = db
      .selectFrom('overhead_rates as or_')
      .innerJoin('accounts as a', 'a.id', 'or_.account_id')
      .innerJoin('accounting_periods as ap', 'ap.id', 'or_.period_id')
      .select([
        'or_.id',
        'or_.name',
        'or_.rate_type',
        'or_.rate',
        'ap.name as period_name',
        'a.code as account_code',
        'a.name as account_name',
      ]);

    if (periodId) query = query.where('or_.period_id', '=', periodId);

    return query.execute();
  }

  async createOverheadRate(
    db: Kysely<TenantSchema>,
    dto: CreateOverheadRateDto,
    createdBy: number,
  ) {
    const [rate] = await db
      .insertInto('overhead_rates')
      .values({
        period_id: dto.periodId,
        name: dto.name,
        rate_type: dto.rateType,
        rate: dto.rate,
        account_id: dto.accountId,
        created_by: createdBy,
      })
      .returningAll()
      .execute();

    return rate;
  }
}
