import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { JwtAccessPayload, AuthenticatedUser } from '../auth.types';
import { REDIS_KEYS } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super({
      // Ambil token dari Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    // Cek apakah token sudah di-blacklist (setelah logout)
    const isBlacklisted = await this.redis.exists(
      REDIS_KEYS.blacklistedToken(payload.jti),
    );

    if (isBlacklisted) {
      throw new UnauthorizedException('Token sudah tidak valid');
    }

    // Return object yang akan ditambahkan ke req.user
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      tenantCode: payload.tenantCode,
      roles: payload.roles,
      permissions: payload.permissions,
      jti: payload.jti,
    };
  }
}
