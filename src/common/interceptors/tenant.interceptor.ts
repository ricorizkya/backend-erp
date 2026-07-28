import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../../database/database.service';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { TENANT_DB_KEY } from '../decorators/tenant-db.decorator';
import { HASH_SALT_KEY } from '../hashid/hashid.constants';

/**
 * Interceptor yang mengelola lifecycle koneksi tenant per request.
 *
 * Urutan kerja:
 * 1. Baca tenantCode dari JWT payload (req.user.tenantCode)
 * 2. Buat koneksi tenant db dari pool
 * 3. Simpan db instance di req[TENANT_DB_KEY]
 * 4. Load hash_salt dari tenant_secrets dan simpan di req[HASH_SALT_KEY]
 * 5. Lanjutkan request ke handler
 * 6. Release koneksi setelah response selesai (sukses MAUPUN error)
 *
 * Pasang di level AppModule agar berlaku global,
 * atau di level controller untuk scope lebih sempit.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  /**
   * Cache salt per tenant code agar tidak query setiap request.
   * Salt jarang berubah, jadi caching di memory aman.
   */
  private readonly saltCache = new Map<string, string>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = ctx.switchToHttp().getRequest();

    // Cek apakah route/controller di-skip dari tenant interceptor
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (skipTenant) {
      return next.handle();
    }

    // Ambil tenantCode dari JWT payload
    // AuthGuard harus sudah jalan sebelum interceptor ini
    const tenantCode: string | undefined = request.user?.tenantCode;

    if (!tenantCode) {
      throw new UnauthorizedException(
        'Tenant tidak teridentifikasi. Token tidak valid.',
      );
    }

    // Buat koneksi dan simpan di request
    const { db, release } = await this.databaseService.getTenantDb(tenantCode);
    request[TENANT_DB_KEY] = db;

    // Load hash salt dari cache atau database
    let salt = this.saltCache.get(tenantCode);
    if (!salt) {
      const publicDb = this.databaseService.getPublicDb();
      const tenant = await publicDb
        .selectFrom('tenants')
        .where('code', '=', tenantCode)
        .select('id')
        .executeTakeFirst();

      if (tenant) {
        const secret = await publicDb
          .selectFrom('tenant_secrets')
          .where('tenant_id', '=', tenant.id)
          .select('hash_salt')
          .executeTakeFirst();

        if (secret) {
          salt = secret.hash_salt;
          this.saltCache.set(tenantCode, secret.hash_salt);
        }
      }
    }

    request[HASH_SALT_KEY] = salt;

    // finalize() dipanggil baik saat sukses maupun error
    // ini yang menjamin tidak ada connection leak
    return next.handle().pipe(
      finalize(() => {
        release();
        this.logger.debug(`Connection released for tenant: ${tenantCode}`);
      }),
    );
  }
}
