import { Kysely, Transaction } from 'kysely';
import { executeInTransaction } from './transaction';

interface TestDatabase {
  test: { id: number };
}

describe('executeInTransaction', () => {
  it('reuses an existing transaction', async () => {
    const transaction = { isTransaction: true } as Transaction<TestDatabase>;
    const callback = jest
      .fn<(trx: Transaction<TestDatabase>) => Promise<string>>()
      .mockResolvedValue('ok');

    await expect(executeInTransaction(transaction, callback)).resolves.toBe(
      'ok',
    );
    expect(callback).toHaveBeenCalledWith(transaction);
  });

  it('opens a transaction for a regular database connection', async () => {
    const transaction = { isTransaction: true } as Transaction<TestDatabase>;
    let executions = 0;
    const execute = (
      callback: (trx: Transaction<TestDatabase>) => Promise<boolean>,
    ): Promise<boolean> => {
      executions += 1;
      return callback(transaction);
    };
    const db = {
      isTransaction: false,
      transaction: () => ({ execute }),
    } as unknown as Kysely<TestDatabase>;

    await expect(
      executeInTransaction(db, (trx) => Promise.resolve(trx.isTransaction)),
    ).resolves.toBe(true);
    expect(executions).toBe(1);
  });
});
