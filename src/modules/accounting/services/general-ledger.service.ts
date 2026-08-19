import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { GlQueryDto } from '../dto/accounting.dto';

@Injectable()
export class GeneralLedgerService {
  // ----------------------------------------------------------------
  // GL LEDGER PER ACCOUNT
  // ----------------------------------------------------------------

  async findGlEntries(db: Kysely<TenantSchema>, query: GlQueryDto) {
    const { page, limit, accountId, periodId, dateFrom, dateTo } = query;

    let q = db
      .selectFrom('general_ledger as gl')
      .innerJoin('accounts as a', 'a.id', 'gl.account_id')
      .innerJoin('journal_entries as je', 'je.id', 'gl.journal_entry_id')
      .innerJoin('accounting_periods as ap', 'ap.id', 'gl.period_id')
      .select([
        'gl.id',
        'gl.entry_date',
        'gl.folio',
        'gl.debit',
        'gl.credit',
        'gl.balance',
        'gl.description',
        'gl.created_at',
        'a.code as account_code',
        'a.name as account_name',
        'je.number as journal_number',
        'je.description as journal_description',
        'ap.name as period_name',
      ]);

    if (accountId) q = q.where('gl.account_id', '=', accountId);
    if (periodId) q = q.where('gl.period_id', '=', periodId);
    if (dateFrom) q = q.where('gl.entry_date', '>=', new Date(dateFrom));
    if (dateTo) q = q.where('gl.entry_date', '<=', new Date(dateTo));

    const total = Number(
      (
        await q
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await q
      .orderBy('gl.entry_date', 'asc')
      .orderBy('gl.created_at', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // ACCOUNT BALANCES PER PERIOD
  // ----------------------------------------------------------------

  async getAccountBalances(db: Kysely<TenantSchema>, periodId: number) {
    return db
      .selectFrom('account_balances as ab')
      .innerJoin('accounts as a', 'a.id', 'ab.account_id')
      .where('ab.period_id', '=', periodId)
      .select([
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'ab.opening_balance',
        'ab.total_debit',
        'ab.total_credit',
        'ab.closing_balance',
      ])
      .orderBy('a.code', 'asc')
      .execute();
  }

  // ----------------------------------------------------------------
  // TRIAL BALANCE
  // ----------------------------------------------------------------

  async getTrialBalance(db: Kysely<TenantSchema>, periodId: number) {
    const period = await db
      .selectFrom('accounting_periods as ap')
      .innerJoin('fiscal_years as fy', 'fy.id', 'ap.fiscal_year_id')
      .where('ap.id', '=', periodId)
      .select([
        'ap.name as period_name',
        'ap.start_date',
        'ap.end_date',
        'fy.name as fiscal_year_name',
      ])
      .executeTakeFirst();

    if (!period) throw new NotFoundException('Periode tidak ditemukan');

    const balances = await db
      .selectFrom('general_ledger as gl')
      .innerJoin('accounts as a', 'a.id', 'gl.account_id')
      .where('gl.period_id', '=', periodId)
      .groupBy([
        'a.id',
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
      ])
      .select([
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
        db.fn.sum<number>('debit').as('total_debit'),
        db.fn.sum<number>('credit').as('total_credit'),
      ])
      .orderBy('a.code', 'asc')
      .execute();

    const totalDebit = balances.reduce((s, b) => s + Number(b.total_debit), 0);
    const totalCredit = balances.reduce(
      (s, b) => s + Number(b.total_credit),
      0,
    );

    return {
      period,
      balances,
      totals: {
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
    };
  }

  // ----------------------------------------------------------------
  // PROFIT & LOSS (Income Statement)
  // ----------------------------------------------------------------

  async getProfitLoss(db: Kysely<TenantSchema>, periodId: number) {
    const period = await db
      .selectFrom('accounting_periods')
      .where('id', '=', periodId)
      .select(['id', 'name', 'start_date', 'end_date'])
      .executeTakeFirst();

    if (!period) throw new NotFoundException('Periode tidak ditemukan');

    const rows = await db
      .selectFrom('general_ledger as gl')
      .innerJoin('accounts as a', 'a.id', 'gl.account_id')
      .where('gl.period_id', '=', periodId)
      .where('a.account_type', 'in', ['revenue', 'expense', 'cost_of_goods'])
      .groupBy([
        'a.id',
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
      ])
      .select([
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
        db.fn.sum<number>('debit').as('total_debit'),
        db.fn.sum<number>('credit').as('total_credit'),
      ])
      .orderBy('a.account_type', 'asc')
      .orderBy('a.code', 'asc')
      .execute();

    const revenues: typeof rows = [];
    const cogs: typeof rows = [];
    const expenses: typeof rows = [];

    for (const row of rows) {
      if (row.account_type === 'revenue') revenues.push(row);
      else if (row.account_type === 'cost_of_goods') cogs.push(row);
      else expenses.push(row);
    }

    const totalRevenue = revenues.reduce(
      (s, r) => s + (Number(r.total_credit) - Number(r.total_debit)),
      0,
    );
    const totalCogs = cogs.reduce(
      (s, r) => s + (Number(r.total_debit) - Number(r.total_credit)),
      0,
    );
    const grossProfit = totalRevenue - totalCogs;
    const totalExpense = expenses.reduce(
      (s, r) => s + (Number(r.total_debit) - Number(r.total_credit)),
      0,
    );
    const netIncome = grossProfit - totalExpense;

    return {
      period,
      revenues,
      totalRevenue,
      cogs,
      totalCogs,
      grossProfit,
      expenses,
      totalExpense,
      netIncome,
    };
  }

  // ----------------------------------------------------------------
  // BALANCE SHEET (Neraca)
  // ----------------------------------------------------------------

  async getBalanceSheet(db: Kysely<TenantSchema>, periodId: number) {
    const period = await db
      .selectFrom('accounting_periods')
      .where('id', '=', periodId)
      .select(['id', 'name', 'start_date', 'end_date'])
      .executeTakeFirst();

    if (!period) throw new NotFoundException('Periode tidak ditemukan');

    const rows = await db
      .selectFrom('general_ledger as gl')
      .innerJoin('accounts as a', 'a.id', 'gl.account_id')
      .where('gl.period_id', '=', periodId)
      .where('a.account_type', 'in', ['asset', 'liability', 'equity'])
      .groupBy([
        'a.id',
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
      ])
      .select([
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.level',
        db.fn.sum<number>('debit').as('total_debit'),
        db.fn.sum<number>('credit').as('total_credit'),
      ])
      .orderBy('a.account_type', 'asc')
      .orderBy('a.code', 'asc')
      .execute();

    const assets: typeof rows = [];
    const liabilities: typeof rows = [];
    const equity: typeof rows = [];

    for (const row of rows) {
      if (row.account_type === 'asset') assets.push(row);
      else if (row.account_type === 'liability') liabilities.push(row);
      else equity.push(row);
    }

    const totalAssets = assets.reduce(
      (s, r) => s + (Number(r.total_debit) - Number(r.total_credit)),
      0,
    );
    const totalLiabilities = liabilities.reduce(
      (s, r) => s + (Number(r.total_credit) - Number(r.total_debit)),
      0,
    );
    const totalEquity = equity.reduce(
      (s, r) => s + (Number(r.total_credit) - Number(r.total_debit)),
      0,
    );
    const isBalanced =
      Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

    return {
      period,
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity,
      totalEquity,
      isBalanced,
    };
  }

  // ----------------------------------------------------------------
  // CASH FLOW
  // ----------------------------------------------------------------

  async getCashFlow(db: Kysely<TenantSchema>, periodId: number) {
    const period = await db
      .selectFrom('accounting_periods')
      .where('id', '=', periodId)
      .select(['id', 'name', 'start_date', 'end_date'])
      .executeTakeFirst();

    if (!period) throw new NotFoundException('Periode tidak ditemukan');

    const cashMovements = await db
      .selectFrom('bank_transactions as bt')
      .innerJoin('bank_accounts as ba', 'ba.id', 'bt.bank_account_id')
      .innerJoin('journal_entries as je', 'je.id', 'bt.journal_entry_id')
      .where('je.period_id', '=', periodId)
      .groupBy(['bt.transaction_type'])
      .select([
        'bt.transaction_type',
        db.fn.sum<number>('amount').as('total'),
      ])
      .execute();

    const cashIn = cashMovements.find((m) => m.transaction_type === 'credit');
    const cashOut = cashMovements.find((m) => m.transaction_type === 'debit');

    return {
      period,
      cashInflow: Number(cashIn?.total ?? 0),
      cashOutflow: Number(cashOut?.total ?? 0),
      netCashFlow: Number(cashIn?.total ?? 0) - Number(cashOut?.total ?? 0),
    };
  }
}
