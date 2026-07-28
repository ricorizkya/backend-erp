import { SetMetadata } from '@nestjs/common';
import { SKIP_HASHID_KEY } from './hashid.constants';

/**
 * @SkipHashId() — Skip HashID encoding/decoding untuk route ini.
 *
 * Gunakan di controller atau handler yang tidak perlu encode IDs,
 * misalnya auth routes atau internal endpoints.
 *
 * Contoh:
 *   @SkipHashId()
 *   @Controller('auth')
 *   export class AuthController { ... }
 */
export const SkipHashId = () => SetMetadata(SKIP_HASHID_KEY, true);
