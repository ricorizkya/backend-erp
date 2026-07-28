import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_KEY = 'SKIP_TENANT';
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);
