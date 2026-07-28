/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  ExecutionContext,
  CanActivate,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthenticatedUser } from '../auth.types';
import { Module, Action } from '../auth.constants';

// ================================================================
// JWT AUTH GUARD
// Validasi access token di setiap request.
// Pasang di controller atau method dengan @UseGuards(JwtAuthGuard).
// ================================================================

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthenticatedUser>(
    err: Error | null,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw (
        err || new UnauthorizedException('Token tidak valid atau sudah expired')
      );
    }
    return user;
  }
}

// ================================================================
// PERMISSION GUARD
// Validasi apakah user punya permission yang dibutuhkan.
// Selalu dipasang SETELAH JwtAuthGuard.
//
// Penggunaan:
//   @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
//   @UseGuards(JwtAuthGuard, PermissionGuard)
// ================================================================

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  module: Module;
  action: Action;
}

export const RequirePermission =
  (module: Module, action: Action) =>
  // Decorator factory — bisa dipakai di class atau method
  (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const metadata: RequiredPermission = { module, action };
    if (descriptor) {
      // Method decorator
      Reflect.defineMetadata(PERMISSION_KEY, metadata, descriptor.value);
    } else {
      // Class decorator
      Reflect.defineMetadata(PERMISSION_KEY, metadata, target);
    }
  };

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Baca metadata dari decorator
    const required = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      ctx.getHandler(),
    );

    // Kalau tidak ada @RequirePermission, endpoint ini public (setelah JWT)
    if (!required) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new UnauthorizedException('User tidak terautentikasi');
    }

    // Cek permission dari matrix
    const allowedActions = user.permissions[required.module] ?? [];
    const hasPermission = allowedActions.includes(required.action);

    if (!hasPermission) {
      throw new ForbiddenException(
        `Akses ditolak: butuh permission ${required.module}:${required.action}`,
      );
    }

    return true;
  }
}
