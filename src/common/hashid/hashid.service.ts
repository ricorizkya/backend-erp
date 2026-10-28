import { Injectable } from '@nestjs/common';
import Sqids from 'sqids';

/**
 * HashIdService — Encode/decode BIGINT IDs menggunakan Sqids.
 *
 * Setiap tenant punya salt unik sehingga ID yang sama
 * menghasilkan hash yang berbeda per tenant.
 *
 * Contoh:
 *   Tenant A (salt "abc123"): encode(1) → "Kx9gP2mR"
 *   Tenant B (salt "xyz789"): encode(1) → "Qm4nR7vW"
 */
@Injectable()
export class HashIdService {
  private static readonly MIN_LENGTH = 8;

  /**
   * Cache Sqids instance per salt agar tidak re-create setiap call.
   * Salt jarang berubah, jadi cache ini efektif.
   */
  private readonly sqidsCache = new Map<string, Sqids>();

  /**
   * Encode BIGINT ID ke hash string.
   */
  encode(id: number | bigint, salt: string): string {
    const sqids = this.getSqidsInstance(salt);
    return sqids.encode([Number(id)]);
  }

  /**
   * Decode hash string ke BIGINT ID.
   * Throws error jika hash tidak valid.
   */
  decode(hash: string, salt: string): number {
    const sqids = this.getSqidsInstance(salt);
    const numbers = sqids.decode(hash);

    if (numbers.length === 0) {
      throw new Error(`Invalid hash ID: "${hash}"`);
    }

    return numbers[0];
  }

  /**
   * Encode array of IDs — untuk bulk operations.
   */
  encodeBulk(ids: (number | bigint)[], salt: string): string[] {
    const sqids = this.getSqidsInstance(salt);
    return ids.map((id) => sqids.encode([Number(id)]));
  }

  /**
   * Decode array of hashes — untuk bulk operations.
   */
  decodeBulk(hashes: string[], salt: string): number[] {
    const sqids = this.getSqidsInstance(salt);
    return hashes.map((hash) => {
      const numbers = sqids.decode(hash);
      if (numbers.length === 0) {
        throw new Error(`Invalid hash ID: "${hash}"`);
      }
      return numbers[0];
    });
  }

  /**
   * Rekursif encode semua field 'id' dan '*_id' di object/array.
   * Dipakai oleh HashIdInterceptor untuk auto-encode response.
   */
  encodeObject(data: unknown, salt: string): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.encodeObject(item, salt));
    }

    if (typeof data === 'object' && data !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (
          this.isIdField(key) &&
          (typeof value === 'number' ||
            typeof value === 'bigint' ||
            (typeof value === 'string' && /^\d+$/.test(value)))
        ) {
          result[key] = this.encode(value as number, salt);
        } else if (typeof value === 'object') {
          result[key] = this.encodeObject(value, salt);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Cek apakah field name adalah ID field yang perlu di-encode.
   * Match: 'id', 'userId', 'tenant_id', 'variant_id', dll.
   */
  private isIdField(key: string): boolean {
    // Exact match 'id'
    if (key === 'id') return true;

    // Ends with '_id' (snake_case) — e.g. 'tenant_id', 'variant_id'
    if (key.endsWith('_id')) return true;

    // Ends with 'Id' (camelCase) — e.g. 'tenantId', 'variantId'
    if (key.length > 2 && key.endsWith('Id') && key[key.length - 3] !== 'I') {
      return true;
    }

    return false;
  }

  /**
   * Get atau create cached Sqids instance untuk salt tertentu.
   * Alphabet di-shuffle berdasarkan salt untuk menghasilkan
   * encoding unik per tenant.
   */
  private getSqidsInstance(salt: string): Sqids {
    const cached = this.sqidsCache.get(salt);
    if (cached) return cached;

    const alphabet = this.shuffleAlphabet(salt);
    const sqids = new Sqids({
      alphabet,
      minLength: HashIdService.MIN_LENGTH,
    });

    this.sqidsCache.set(salt, sqids);
    return sqids;
  }

  /**
   * Shuffle default alphabet menggunakan salt.
   * Ini yang membuat encoding berbeda per tenant.
   * Menggunakan Fisher-Yates shuffle dengan seed dari salt.
   */
  private shuffleAlphabet(salt: string): string {
    const defaultAlphabet =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const chars = defaultAlphabet.split('');

    // Simple seeded shuffle berdasarkan salt
    let seed = 0;
    for (let i = 0; i < salt.length; i++) {
      seed = (seed * 31 + salt.charCodeAt(i)) & 0x7fffffff;
    }

    for (let i = chars.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
