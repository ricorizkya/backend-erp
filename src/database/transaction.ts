import { Kysely, Transaction } from 'kysely';

export function executeInTransaction<Database, Result>(
  db: Kysely<Database>,
  callback: (trx: Transaction<Database>) => Promise<Result>,
): Promise<Result> {
  if (db.isTransaction) {
    return callback(db as Transaction<Database>);
  }

  return db.transaction().execute(callback);
}
