/**
 * Key untuk menyimpan tenant hash salt di request context.
 * Di-set oleh TenantInterceptor, dipakai oleh HashIdPipe dan HashIdInterceptor.
 */
export const HASH_SALT_KEY = 'hashSalt';

/**
 * Metadata key untuk skip HashID encoding/decoding.
 */
export const SKIP_HASHID_KEY = 'SKIP_HASHID';
