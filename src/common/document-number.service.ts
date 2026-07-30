import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { TenantSchema } from '../types/database.types';

export type DocType =
  | 'PR'
  | 'RFQ'
  | 'PO'
  | 'GR'
  | 'VI'
  | 'APV'
  | 'SQ'
  | 'SO'
  | 'DO'
  | 'INV'
  | 'PAY';

@Injectable()
export class DocumentNumberService {
  /**
   * Generate nomor dokumen berikutnya secara atomic.
   * Harus dipanggil di dalam transaksi aktif.
   *
   * Format: {docType}-{YYYY}-{NNNNN}
   * Contoh: PR-2026-00001, PO-2026-00123
   *
   * SELECT FOR UPDATE memastikan hanya satu request
   * yang bisa increment counter di waktu yang sama.
   * Request lain akan menunggu di antrian sampai
   * transaksi ini commit/rollback.
   */
  async generate(
    db: Kysely<TenantSchema>,
    docType: DocType,
  ): Promise<string> {
    const year = new Date().getFullYear();

    // Pastikan row untuk tahun ini sudah ada
    // ON CONFLICT DO NOTHING agar idempotent
    await db
      .insertInto('document_counters')
      .values({ doc_type: docType, year, counter: 0 })
      .onConflict((oc) => oc.columns(['doc_type', 'year']).doNothing())
      .execute();

    // Lock row ini — request lain akan block sampai transaksi selesai
    const result = await sql<{ counter: number }>`
      UPDATE document_counters
      SET    counter    = counter + 1,
             updated_at = NOW()
      WHERE  doc_type = ${docType}
      AND    year     = ${year}
      RETURNING counter
    `.execute(db);

    const counter = result.rows[0]?.counter;
    if (!counter) {
      throw new Error(`Gagal generate nomor dokumen untuk ${docType}`);
    }

    // Format: PR-2026-00001 (5 digit, zero-padded)
    return `${docType}-${year}-${String(counter).padStart(5, '0')}`;
  }
}
