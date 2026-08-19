import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import { CreateApPaymentDto } from '../dto/accounting.dto';
import { DocumentNumberService } from '../../../common/document-number.service';
import { JournalEntryService } from './journal-entry.service';
import { AccountService } from './account.service';
import { FiscalPeriodService } from './fiscal-period.service';

@Injectable()
export class ApService {
  constructor(
    private readonly docNumber: DocumentNumberService,
    private readonly journalService: JournalEntryService,
    private readonly accountService: AccountService,
    private readonly periodService: FiscalPeriodService,
  ) {}

  // ----------------------------------------------------------------
  // LIST AP TRANSACTIONS
  // ----------------------------------------------------------------

  async findAllTransactions(
    db: Kysely<TenantSchema>,
    supplierId?: number,
    status?: string,
  ) {
    let query = db
      .selectFrom('ap_transactions as apt')
      .innerJoin('vendor_invoices as vi', 'vi.id', 'apt.vendor_invoice_id')
      .innerJoin('suppliers as s', 's.id', 'apt.supplier_id')
      .select([
        'apt.id',
        'apt.transaction_date',
        'apt.due_date',
        'apt.amount',
        'apt.paid_amount',
        'apt.outstanding_amount',
        'apt.status',
        'apt.created_at',
        'vi.number as invoice_number',
        'vi.supplier_invoice_no',
        's.code as supplier_code',
        's.name as supplier_name',
      ]);

    if (supplierId) query = query.where('apt.supplier_id', '=', supplierId);
    if (status) query = query.where('apt.status', '=', status as any);

    return query.orderBy('apt.due_date', 'asc').execute();
  }

  // ----------------------------------------------------------------
  // CREATE AP TRANSACTION
  // ----------------------------------------------------------------

  async createTransaction(
    db: Kysely<TenantSchema>,
    invoiceId: number,
    supplierId: number,
    amount: number,
    transactionDate: Date,
    dueDate: Date,
  ) {
    const existing = await db
      .selectFrom('ap_transactions')
      .where('vendor_invoice_id', '=', invoiceId)
      .select('id')
      .executeTakeFirst();

    if (existing) return existing;

    const [apt] = await db
      .insertInto('ap_transactions')
      .values({
        vendor_invoice_id: invoiceId,
        supplier_id: supplierId,
        transaction_date: transactionDate,
        due_date: dueDate,
        amount,
        paid_amount: 0,
        status: 'open',
      })
      .returningAll()
      .execute();

    return apt;
  }

  // ----------------------------------------------------------------
  // LIST AP PAYMENTS
  // ----------------------------------------------------------------

  async findAllPayments(db: Kysely<TenantSchema>, supplierId?: number) {
    let query = db
      .selectFrom('ap_payments as app')
      .innerJoin('suppliers as s', 's.id', 'app.supplier_id')
      .select([
        'app.id',
        'app.number',
        'app.payment_date',
        'app.payment_method',
        'app.amount',
        'app.reference_no',
        'app.notes',
        'app.created_at',
        's.code as supplier_code',
        's.name as supplier_name',
      ]);

    if (supplierId) query = query.where('app.supplier_id', '=', supplierId);

    return query.orderBy('app.payment_date', 'desc').execute();
  }

  // ----------------------------------------------------------------
  // CREATE AP PAYMENT + JOURNAL ENTRY
  // ----------------------------------------------------------------

  async createPayment(
    db: Kysely<TenantSchema>,
    dto: CreateApPaymentDto,
    createdBy: number,
  ) {
    if (!dto.allocations.length) {
      throw new BadRequestException('Minimal satu alokasi hutang diperlukan');
    }

    const totalAmount = dto.allocations.reduce((s, a) => s + a.amount, 0);

    for (const alloc of dto.allocations) {
      const apt = await db
        .selectFrom('ap_transactions')
        .where('id', '=', alloc.apTransactionId)
        .where('supplier_id', '=', dto.supplierId)
        .where('status', 'in', ['open', 'partial'])
        .select(['id', 'outstanding_amount'])
        .executeTakeFirst();

      if (!apt) {
        throw new NotFoundException(
          `AP Transaction ${alloc.apTransactionId} tidak ditemukan atau sudah lunas`,
        );
      }

      const outstanding = Number(apt.outstanding_amount ?? 0);
      if (alloc.amount > outstanding + 0.01) {
        throw new BadRequestException(
          `Alokasi melebihi outstanding hutang. Outstanding: ${outstanding}, dialokasikan: ${alloc.amount}`,
        );
      }
    }

    const apAccount = await this.accountService.getSystemAccount(db, 'ap');
    const cashAccount = dto.bankAccountId
      ? await db
          .selectFrom('bank_accounts')
          .where('id', '=', dto.bankAccountId)
          .select('account_id')
          .executeTakeFirst()
          .then((ba) =>
            ba ? this.accountService.findOne(db, ba.account_id) : null,
          )
      : await this.accountService.getSystemAccount(db, 'cash');

    if (!cashAccount) throw new BadRequestException('Bank account tidak ditemukan');

    const period = await this.periodService.getActivePeriodForDate(
      db,
      new Date(dto.paymentDate),
    );

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'APV');

      const journalId = await this.journalService.autoPost(
        trx,
        {
          periodId: period.id,
          entryDate: dto.paymentDate,
          entryType: 'payment' as any,
          description: `Pembayaran hutang supplier - ${number}`,
          folio: number,
          referenceType: 'ap_payment',
          lines: [
            {
              accountId: apAccount.id,
              lineNumber: 1,
              debit: totalAmount,
              description: 'Pembayaran hutang usaha',
            },
            {
              accountId: cashAccount.id,
              lineNumber: 2,
              credit: totalAmount,
              description: `Pembayaran via ${dto.paymentMethod}`,
            },
          ],
        },
        createdBy,
      );

      const [payment] = await trx
        .insertInto('ap_payments')
        .values({
          number,
          supplier_id: dto.supplierId,
          payment_date: new Date(dto.paymentDate),
          payment_method: dto.paymentMethod,
          bank_account_id: dto.bankAccountId ?? null,
          reference_no: dto.referenceNo ?? null,
          amount: totalAmount,
          journal_entry_id: journalId,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      for (const alloc of dto.allocations) {
        await trx
          .insertInto('ap_payment_allocations')
          .values({
            ap_payment_id: payment.id,
            ap_transaction_id: alloc.apTransactionId,
            amount: alloc.amount,
          })
          .execute();

        const totalPaid = await trx
          .selectFrom('ap_payment_allocations')
          .where('ap_transaction_id', '=', alloc.apTransactionId)
          .select(trx.fn.sum<number>('amount').as('total'))
          .executeTakeFirst();

        const paidAmount = Number(totalPaid?.total ?? 0);
        const apt = await trx
          .selectFrom('ap_transactions')
          .where('id', '=', alloc.apTransactionId)
          .select(['amount', 'vendor_invoice_id'])
          .executeTakeFirst();

        const newStatus =
          paidAmount >= Number(apt?.amount ?? 0)
            ? 'paid'
            : paidAmount > 0
              ? 'partial'
              : 'open';

        await trx
          .updateTable('ap_transactions')
          .set({
            paid_amount: paidAmount,
            status: newStatus,
            updated_at: new Date(),
          })
          .where('id', '=', alloc.apTransactionId)
          .execute();

        // Update vendor invoice paid_amount jika vendor_invoice_id terhubung
        if (apt?.vendor_invoice_id) {
          await trx
            .updateTable('vendor_invoices')
            .set({
              paid_amount: paidAmount,
              status: newStatus === 'paid' ? 'paid' : newStatus === 'partial' ? 'partial' : 'unpaid',
              updated_at: new Date(),
            })
            .where('id', '=', apt.vendor_invoice_id)
            .execute();
        }
      }

      return payment;
    });
  }

  // ----------------------------------------------------------------
  // AP AGING
  // ----------------------------------------------------------------

  async getApAging(db: Kysely<TenantSchema>, supplierId?: number) {
    const today = new Date();

    let query = db
      .selectFrom('ap_transactions as apt')
      .innerJoin('suppliers as s', 's.id', 'apt.supplier_id')
      .where('apt.status', 'in', ['open', 'partial']);

    if (supplierId) query = query.where('apt.supplier_id', '=', supplierId);

    const transactions = await query
      .select([
        'apt.id',
        'apt.due_date',
        'apt.outstanding_amount',
        's.name as supplier_name',
      ])
      .execute();

    const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    const details: typeof transactions = [];

    for (const t of transactions) {
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(t.due_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const amount = Number(t.outstanding_amount ?? 0);

      if (daysOverdue <= 0) aging.current += amount;
      else if (daysOverdue <= 30) aging.days30 += amount;
      else if (daysOverdue <= 60) aging.days60 += amount;
      else if (daysOverdue <= 90) aging.days90 += amount;
      else aging.over90 += amount;

      details.push(t);
    }

    return {
      aging,
      details,
      total: Object.values(aging).reduce((s, v) => s + v, 0),
    };
  }
}
