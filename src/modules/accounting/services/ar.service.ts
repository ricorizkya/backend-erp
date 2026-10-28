import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';

@Injectable()
export class ArService {
  // ----------------------------------------------------------------
  // LIST AR TRANSACTIONS
  // ----------------------------------------------------------------

  async findAllTransactions(
    db: Kysely<TenantSchema>,
    customerId?: number,
    status?: string,
  ) {
    let query = db
      .selectFrom('ar_transactions as art')
      .innerJoin('customer_invoices as ci', 'ci.id', 'art.customer_invoice_id')
      .innerJoin('customers as c', 'c.id', 'art.customer_id')
      .select([
        'art.id',
        'art.transaction_date',
        'art.due_date',
        'art.amount',
        'art.received_amount',
        'art.outstanding_amount',
        'art.status',
        'art.created_at',
        'ci.number as invoice_number',
        'c.code as customer_code',
        'c.name as customer_name',
      ]);

    if (customerId) query = query.where('art.customer_id', '=', customerId);
    if (status) query = query.where('art.status', '=', status as any);

    return query.orderBy('art.due_date', 'asc').execute();
  }

  // ----------------------------------------------------------------
  // CREATE AR TRANSACTION
  // ----------------------------------------------------------------

  async createTransaction(
    db: Kysely<TenantSchema>,
    invoiceId: number,
    customerId: number,
    amount: number,
    transactionDate: Date,
    dueDate: Date,
  ) {
    const existing = await db
      .selectFrom('ar_transactions')
      .where('customer_invoice_id', '=', invoiceId)
      .select('id')
      .executeTakeFirst();

    if (existing) return existing;

    const [art] = await db
      .insertInto('ar_transactions')
      .values({
        customer_invoice_id: invoiceId,
        customer_id: customerId,
        transaction_date: transactionDate,
        due_date: dueDate,
        amount,
        received_amount: 0,
        status: 'open',
      })
      .returningAll()
      .execute();

    return art;
  }

  // ----------------------------------------------------------------
  // UPDATE RECEIVED
  // ----------------------------------------------------------------

  async updateReceived(
    db: Kysely<TenantSchema>,
    arTransactionId: number,
    receivedAmount: number,
  ) {
    const art = await db
      .selectFrom('ar_transactions')
      .where('id', '=', arTransactionId)
      .select(['id', 'amount'])
      .executeTakeFirst();

    if (!art) throw new NotFoundException('AR Transaction tidak ditemukan');

    const newStatus =
      receivedAmount >= Number(art.amount)
        ? 'paid'
        : receivedAmount > 0
          ? 'partial'
          : 'open';

    await db
      .updateTable('ar_transactions')
      .set({
        received_amount: receivedAmount,
        status: newStatus,
        updated_at: new Date(),
      })
      .where('id', '=', arTransactionId)
      .execute();
  }

  // ----------------------------------------------------------------
  // AR AGING
  // ----------------------------------------------------------------

  async getArAging(db: Kysely<TenantSchema>, customerId?: number) {
    const today = new Date();

    let query = db
      .selectFrom('ar_transactions as art')
      .innerJoin('customers as c', 'c.id', 'art.customer_id')
      .where('art.status', 'in', ['open', 'partial']);

    if (customerId) query = query.where('art.customer_id', '=', customerId);

    const transactions = await query
      .select([
        'art.id',
        'art.due_date',
        'art.outstanding_amount',
        'c.name as customer_name',
      ])
      .execute();

    const aging = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };

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
    }

    return {
      aging,
      details: transactions,
      total: Object.values(aging).reduce((s, v) => s + v, 0),
    };
  }
}
