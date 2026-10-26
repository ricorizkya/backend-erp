import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { DocumentNumberService } from '../src/common/document-number.service';
import { FiscalPeriodService } from '../src/modules/accounting/services/fiscal-period.service';
import { JournalEntryService } from '../src/modules/accounting/services/journal-entry.service';
import {
  JournalEntryType,
  PeriodStatus,
} from '../src/modules/accounting/dto/accounting.dto';
import {
  assertSafeTestTenantSchema,
  getTestEnvironment,
} from './helpers/test-environment';

const schema = 'tenant_test_accounting';

describe('accounting integrity', () => {
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
  const fiscalPeriods = new FiscalPeriodService();
  let journalNumbers = 0;

  beforeAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`
      CREATE SCHEMA "${schema}";
      CREATE TABLE "${schema}".fiscal_years (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE "${schema}".accounting_periods (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        fiscal_year_id BIGINT NOT NULL,
        name TEXT NOT NULL,
        period_number INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE "${schema}".journal_entries (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        period_id BIGINT NOT NULL,
        entry_date DATE NOT NULL,
        entry_type TEXT NOT NULL,
        folio TEXT,
        reference_type TEXT,
        reference_id BIGINT,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        reversed_by BIGINT,
        reversal_of BIGINT,
        total_debit NUMERIC NOT NULL DEFAULT 0,
        total_credit NUMERIC NOT NULL DEFAULT 0,
        created_by BIGINT NOT NULL,
        posted_by BIGINT,
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX uq_journal_entry_business_reference
        ON "${schema}".journal_entries(reference_type, reference_id)
        WHERE reference_id IS NOT NULL;
      CREATE TABLE "${schema}".accounts (
        id BIGINT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL
      );
      CREATE TABLE "${schema}".journal_entry_lines (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        journal_entry_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        line_number INTEGER NOT NULL,
        folio TEXT,
        debit NUMERIC NOT NULL DEFAULT 0,
        credit NUMERIC NOT NULL DEFAULT 0,
        description TEXT,
        cost_center TEXT
      );
      CREATE TABLE "${schema}".general_ledger (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account_id BIGINT NOT NULL,
        period_id BIGINT NOT NULL,
        journal_entry_id BIGINT NOT NULL,
        journal_line_id BIGINT NOT NULL,
        entry_date DATE NOT NULL,
        folio TEXT NOT NULL,
        debit NUMERIC NOT NULL DEFAULT 0,
        credit NUMERIC NOT NULL DEFAULT 0,
        balance NUMERIC NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE "${schema}".account_balances (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account_id BIGINT NOT NULL,
        period_id BIGINT NOT NULL,
        opening_balance NUMERIC NOT NULL DEFAULT 0,
        total_debit NUMERIC NOT NULL DEFAULT 0,
        total_credit NUMERIC NOT NULL DEFAULT 0,
        closing_balance NUMERIC NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(account_id, period_id)
      );
      INSERT INTO "${schema}".fiscal_years
        (name, start_date, end_date, status)
      VALUES ('FY 2026', '2026-01-01', '2026-12-31', 'open');
      INSERT INTO "${schema}".accounting_periods
        (fiscal_year_id, name, period_number, start_date, end_date, status)
      VALUES (1, 'January 2026', 1, '2026-01-01', '2026-01-31', 'open');
      INSERT INTO "${schema}".accounts (id, code, name, account_type)
      VALUES (1, '1-100', 'Cash', 'asset'), (2, '4-100', 'Revenue', 'revenue');
    `);
  });

  afterAll(async () => {
    assertSafeTestTenantSchema(schema);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  async function tenantDb() {
    return database.getTenantDb('test_accounting');
  }

  function journalService(): JournalEntryService {
    const documentNumber = {
      generate: jest.fn(() => `JE-TEST-${++journalNumbers}`),
    } as unknown as DocumentNumberService;
    return new JournalEntryService(documentNumber, fiscalPeriods);
  }

  it('rejects overlapping periods and closing a period with draft journals', async () => {
    const { db, release } = await tenantDb();
    try {
      await expect(
        fiscalPeriods.createPeriod(db, {
          fiscalYearId: 1,
          name: 'January overlap',
          periodNumber: 2,
          startDate: '2026-01-15',
          endDate: '2026-02-15',
        }),
      ).rejects.toThrow('bertabrakan');

      await db
        .insertInto('journal_entries')
        .values({
          number: 'DRAFT-1',
          period_id: 1,
          entry_date: new Date('2026-01-15'),
          entry_type: 'general',
          description: 'draft',
          status: 'draft',
          total_debit: 1,
          total_credit: 1,
          created_by: 1,
        })
        .execute();

      await expect(
        fiscalPeriods.updatePeriodStatus(db, 1, {
          status: PeriodStatus.CLOSED,
        }),
      ).rejects.toThrow('journal draft');

      await db
        .deleteFrom('journal_entries')
        .where('number', '=', 'DRAFT-1')
        .execute();
      await expect(
        fiscalPeriods.updatePeriodStatus(db, 1, {
          status: PeriodStatus.CLOSED,
        }),
      ).resolves.toMatchObject({ status: 'closed' });
    } finally {
      await release();
    }
  });

  it('serializes concurrent period close requests', async () => {
    const first = await tenantDb();
    const second = await tenantDb();
    try {
      await pool.query(
        `UPDATE "${schema}".accounting_periods SET status = 'open' WHERE id = 1`,
      );
      const results = await Promise.allSettled([
        fiscalPeriods.updatePeriodStatus(first.db, 1, {
          status: PeriodStatus.CLOSED,
        }),
        fiscalPeriods.updatePeriodStatus(second.db, 1, {
          status: PeriodStatus.CLOSED,
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('makes concurrent auto-post calls idempotent by business reference', async () => {
    await pool.query(
      `UPDATE "${schema}".accounting_periods SET status = 'open' WHERE id = 1`,
    );
    const first = await tenantDb();
    const second = await tenantDb();
    const service = journalService();
    const dto = {
      entryDate: '2026-01-20',
      entryType: JournalEntryType.GENERAL,
      description: 'Concurrent auto-post',
      referenceType: 'test_document',
      referenceId: 77,
      lines: [
        { accountId: 1, lineNumber: 1, debit: 100 },
        { accountId: 2, lineNumber: 2, credit: 100 },
      ],
    };

    try {
      const results = await Promise.all([
        service.autoPost(first.db, dto, 1),
        service.autoPost(second.db, dto, 1),
      ]);
      expect(results[0]).toBe(results[1]);

      const journals = await pool.query<{ count: string; status: string }>(
        `SELECT count(*)::text AS count, min(status) AS status
         FROM "${schema}".journal_entries
         WHERE reference_type = 'test_document' AND reference_id = 77`,
      );
      expect(journals.rows[0]).toMatchObject({ count: '1', status: 'posted' });

      const ledger = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "${schema}".general_ledger
         WHERE journal_entry_id = $1`,
        [results[0]],
      );
      expect(ledger.rows[0].count).toBe('2');
    } finally {
      await first.release();
      await second.release();
    }
  });

  it('does not create a journal in a closed period', async () => {
    await pool.query(
      `UPDATE "${schema}".accounting_periods SET status = 'closed' WHERE id = 1`,
    );
    const { db, release } = await tenantDb();
    const service = journalService();
    try {
      await expect(
        service.autoPost(
          db,
          {
            periodId: 1,
            entryDate: '2026-01-20',
            entryType: JournalEntryType.GENERAL,
            description: 'Closed period attempt',
            referenceType: 'closed_document',
            referenceId: 88,
            lines: [
              { accountId: 1, lineNumber: 1, debit: 50 },
              { accountId: 2, lineNumber: 2, credit: 50 },
            ],
          },
          1,
        ),
      ).rejects.toThrow('Periode');
    } finally {
      await release();
    }
  });
});
