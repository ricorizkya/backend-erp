import { Global, Module } from '@nestjs/common';
import { HashIdService } from './hashid.service';
import { HashIdInterceptor } from './hashid.interceptor';
import { HashIdDecodeInterceptor } from './hashid-decode.interceptor';
import { HashIdPipe } from './hashid.pipe';

/**
 * HashIdModule — Module global untuk HashID encoding/decoding.
 *
 * Register sebagai @Global() agar HashIdService dan HashIdPipe
 * bisa dipakai di semua module tanpa perlu import ulang.
 *
 * HashIdPipe di-resolve per request (request-scoped)
 * karena membutuhkan tenant salt dari request context.
 */
@Global()
@Module({
  providers: [HashIdService, HashIdPipe, HashIdInterceptor, HashIdDecodeInterceptor],
  exports: [HashIdService, HashIdPipe, HashIdInterceptor, HashIdDecodeInterceptor],
})
export class HashIdModule {}
