import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { HashIdService } from './hashid.service';
import { HASH_SALT_KEY, SKIP_HASHID_KEY } from './hashid.constants';

/**
 * HashIdDecodeInterceptor — Auto-decode semua ID fields di request body/query.
 *
 * Interceptor ini berjalan sebelum validation pipe,
 * men-transform semua field '*Id' dan '*_id' dari hash string ke number.
 */
@Injectable()
export class HashIdDecodeInterceptor implements NestInterceptor {
  constructor(
    private readonly hashIdService: HashIdService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skipHashId = this.reflector.getAllAndOverride<boolean>(
      SKIP_HASHID_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipHashId) {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { [HASH_SALT_KEY]?: string }>();
    const salt = request[HASH_SALT_KEY];

    if (!salt) {
      return next.handle();
    }

    if (request.body && typeof request.body === 'object') {
      try {
        request.body = this.decodeObject(request.body, salt);
      } catch {
        throw new BadRequestException('Invalid hash ID in request body');
      }
    }

    if (request.query && typeof request.query === 'object') {
      try {
        request.query = this.decodeObject(request.query, salt);
      } catch {
        throw new BadRequestException('Invalid hash ID in request query');
      }
    }

    if (request.params && typeof request.params === 'object') {
      try {
        request.params = this.decodeObject(request.params, salt);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BadRequestException(`Params decode error: ${message}`);
      }
    }

    return next.handle();
  }

  private decodeObject(data: unknown, salt: string): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.decodeObject(item, salt));
    }

    if (typeof data === 'object' && data !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (
          this.isIdField(key) &&
          typeof value === 'string' &&
          value.length >= 8
        ) {
          result[key] = this.hashIdService.decode(value, salt);
        } else if (typeof value === 'object') {
          result[key] = this.decodeObject(value, salt);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return data;
  }

  private isIdField(key: string): boolean {
    return key === 'id' || key.endsWith('_id') || key.endsWith('Id');
  }
}
