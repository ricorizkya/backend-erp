import { Module } from '@nestjs/common';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { DocumentNumberService } from './document-number.service';

/**
 * CommonModule menyediakan shared utilities lintas modul.
 * DatabaseModule sudah @Global() jadi tidak perlu di-import ulang.
 */
@Module({
  providers: [TenantInterceptor, DocumentNumberService],
  exports: [TenantInterceptor, DocumentNumberService],
})
export class CommonModule {}
