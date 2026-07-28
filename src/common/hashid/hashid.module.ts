import { Global, Module } from '@nestjs/common';
import { HashIdService } from './hashid.service';
import { HashIdInterceptor } from './hashid.interceptor';
import { HashIdDecodeInterceptor } from './hashid-decode.interceptor';

/**
 * HashIdModule — Module global untuk HashID encoding/decoding.
 *
 * Register sebagai @Global() agar HashIdService dan HashIdPipe
 * bisa dipakai di semua module tanpa perlu import ulang.
 *
 * HashIdPipe harus di-resolve per request (request-scoped)
 * karena membutuhkan tenant salt dari request context.
 * Oleh karena itu, pipe TIDAK didaftarkan di sini sebagai provider,
 * melainkan dipakai langsung di controller via @Param('id', HashIdPipe).
 */
@Global()
@Module({
  providers: [HashIdService, HashIdInterceptor, HashIdDecodeInterceptor],
  exports: [HashIdService, HashIdInterceptor, HashIdDecodeInterceptor],
})
export class HashIdModule {}
