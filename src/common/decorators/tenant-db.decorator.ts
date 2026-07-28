/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from 'src/types/database.types';

export const TENANT_DB_KEY = 'tenantDb';

export const TenantDb = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Kysely<TenantSchema> => {
    const request = ctx.switchToHttp().getRequest();
    const db = request[TENANT_DB_KEY];

    if (!db) {
      throw new Error(
        'Tenant Db is available in request context. ' +
          'Make sure TenantInterceptor is applied.',
      );
    }
    return db;
  },
);
