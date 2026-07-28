import { Module } from '@nestjs/common';
import { TenantInterceptor } from './interceptors/tenant.interceptor';

/**
 * CommonModule menyediakan shared utilities lintas modul.
 * DatabaseModule sudah @Global() jadi tidak perlu di-import ulang.
 */
@Module({
  providers: [TenantInterceptor],
  exports: [TenantInterceptor],
})
export class CommonModule {}
