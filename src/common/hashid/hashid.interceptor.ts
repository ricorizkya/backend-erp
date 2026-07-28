import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { HashIdService } from './hashid.service';
import { HASH_SALT_KEY, SKIP_HASHID_KEY } from './hashid.constants';

/**
 * HashIdInterceptor — Auto-encode semua ID fields di response JSON.
 *
 * Interceptor ini berjalan di akhir pipeline (setelah handler selesai),
 * men-transform semua field 'id' dan '*_id' dari number ke hash string.
 *
 * Alur:
 *   1. Handler return data dengan BIGINT ids → { id: 42, variant_id: 7 }
 *   2. Interceptor encode semua ID fields  → { id: "Kx9gP2mR", variant_id: "Qm4nR7vW" }
 *   3. Client menerima encoded IDs
 *
 * Skip encoding:
 *   - Gunakan @SkipHashId() decorator di controller/handler
 *   - Jika salt tidak tersedia (e.g. auth routes)
 */
@Injectable()
export class HashIdInterceptor implements NestInterceptor {
  constructor(
    private readonly hashIdService: HashIdService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Cek apakah route di-skip dari HashID encoding
    const skipHashId = this.reflector.getAllAndOverride<boolean>(
      SKIP_HASHID_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipHashId) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const salt = request[HASH_SALT_KEY] as string | undefined;

    // Jika salt tidak tersedia, skip encoding (e.g. auth routes tanpa tenant)
    if (!salt) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(
        map((data) => this.hashIdService.encodeObject(data, salt)),
      );
  }
}
