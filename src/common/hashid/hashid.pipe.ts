import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { HashIdService } from './hashid.service';
import { HASH_SALT_KEY } from './hashid.constants';

/**
 * HashIdPipe — Menggantikan ParseUUIDPipe.
 *
 * Decode hash string dari URL parameter ke BIGINT number.
 * Salt diambil dari request context (di-set oleh TenantInterceptor).
 *
 * Penggunaan:
 *   @Param('id', HashIdPipe) id: number
 *
 * Catatan:
 *   Pipe ini harus request-scoped karena membutuhkan
 *   tenant salt dari request context.
 */
@Injectable({ scope: Scope.REQUEST })
export class HashIdPipe implements PipeTransform<string, number> {
  constructor(
    private readonly hashIdService: HashIdService,
    @Inject(REQUEST) private readonly request: Record<string, unknown>,
  ) {}

  transform(value: string | number, metadata: ArgumentMetadata): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (!value || typeof value !== 'string') {
      throw new BadRequestException(
        `Parameter "${metadata.data}" harus berupa string hash ID`,
      );
    }

    const salt = this.request ? (this.request[HASH_SALT_KEY] as string | undefined) : undefined;

    if (!salt) {
      throw new BadRequestException(
        'Tenant salt tidak tersedia. Pastikan TenantInterceptor aktif.',
      );
    }

    try {
      return this.hashIdService.decode(value, salt);
    } catch {
      throw new BadRequestException(
        `ID "${value}" tidak valid untuk parameter "${metadata.data}"`,
      );
    }
  }
}
