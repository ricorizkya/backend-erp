import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { HashIdService } from '../../common/hashid/hashid.service';
import {
  JwtAccessPayload,
  JwtRefreshPayload,
  TokenPair,
  LoginResponse,
} from './auth.types';
import {
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY,
  JWT_REFRESH_EXPIRY_MS,
  BCRYPT_ROUNDS,
  REDIS_KEYS,
  REDIS_TTL,
  RATE_LIMIT,
} from './auth.constants';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { PermissionMatrix } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly hashIdService: HashIdService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ----------------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------------

  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResponse> {
    // 1. Rate limiting — cegah brute force
    await this.checkLoginRateLimit(ipAddress);

    const publicDb = this.db.getPublicDb();

    // 2. Validasi tenant
    const tenant = await publicDb
      .selectFrom('tenants')
      .where('code', '=', dto.tenantCode)
      .where('is_active', '=', true)
      .select(['id', 'code'])
      .executeTakeFirst();

    if (!tenant) {
      // Jangan reveal apakah tenant tidak ada atau tidak aktif
      throw new UnauthorizedException(
        'Email, password, atau kode perusahaan tidak valid',
      );
    }

    // 3. Validasi user
    const user = await publicDb
      .selectFrom('users')
      .where('email', '=', dto.email)
      .where('tenant_id', '=', tenant.id)
      .where('is_active', '=', true)
      .select(['id', 'email', 'password_hash', 'full_name'])
      .executeTakeFirst();

    if (!user) {
      await this.incrementLoginAttempt(ipAddress);
      throw new UnauthorizedException(
        'Email, password, atau kode perusahaan tidak valid',
      );
    }

    // 4. Validasi password
    const isValidPassword = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isValidPassword) {
      await this.incrementLoginAttempt(ipAddress);
      throw new UnauthorizedException(
        'Email, password, atau kode perusahaan tidak valid',
      );
    }

    // 5. Ambil roles dan permissions
    const { roles, permissions } = await this.getUserPermissions(user.id);

    // 6. Update last login
    await publicDb
      .updateTable('users')
      .set({ last_login_at: new Date() })
      .where('id', '=', user.id)
      .execute();

    // 7. Generate token pair
    const tokens = await this.generateTokenPair(
      {
        userId: user.id,
        email: user.email,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        roles,
        permissions,
      },
      ipAddress,
      userAgent,
    );

    // 8. Ambil salt untuk encode ID
    const secret = await publicDb
      .selectFrom('tenant_secrets')
      .where('tenant_id', '=', tenant.id)
      .select('hash_salt')
      .executeTakeFirst();
    const salt = secret?.hash_salt || 'default_salt';

    // 9. Reset rate limit setelah login sukses
    await this.redis.del(REDIS_KEYS.rateLimitLogin(ipAddress));

    this.logger.log(`Login sukses: ${user.email} [tenant: ${tenant.code}]`);

    return {
      ...tokens,
      user: {
        id: this.hashIdService.encode(user.id, salt),
        email: user.email,
        fullName: user.full_name,
        tenantCode: tenant.code,
        roles,
      },
    };
  }

  // ----------------------------------------------------------------
  // REFRESH TOKEN
  // ----------------------------------------------------------------

  async refreshToken(
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<TokenPair> {
    // 1. Verify JWT signature dan expiry
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwt.verify<JwtRefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah expired',
      );
    }

    // 2. Ambil tokenHash dari payload
    const tokenHash = payload.tokenHash;

    // 3. Cek Redis dulu (fast path)
    const redisKey = REDIS_KEYS.refreshToken(tokenHash);
    const cachedUserId = await this.redis.get(redisKey);

    if (!cachedUserId) {
      // 4. Fallback ke database
      const publicDb = this.db.getPublicDb();
      const stored = await publicDb
        .selectFrom('refresh_tokens')
        .where('token_hash', '=', tokenHash)
        .where('is_revoked', '=', false)
        .where('expires_at', '>', new Date())
        .select(['id', 'user_id'])
        .executeTakeFirst();

      if (!stored || stored.user_id !== payload.sub) {
        throw new UnauthorizedException('Refresh token tidak valid');
      }
    }

    // 5. Revoke token lama (rotation — satu token hanya bisa dipakai sekali)
    await this.revokeRefreshToken(tokenHash);

    // 6. Ambil user dan permissions terbaru
    const publicDb = this.db.getPublicDb();
    const user = await publicDb
      .selectFrom('users')
      .where('id', '=', payload.sub)
      .where('is_active', '=', true)
      .select(['id', 'email'])
      .executeTakeFirst();

    if (!user) {
      throw new UnauthorizedException(
        'User tidak ditemukan atau sudah dinonaktifkan',
      );
    }

    const tenant = await publicDb
      .selectFrom('tenants')
      .where('code', '=', payload.tenantCode)
      .where('is_active', '=', true)
      .select(['id', 'code'])
      .executeTakeFirst();

    if (!tenant) {
      throw new UnauthorizedException('Tenant tidak aktif');
    }

    const { roles, permissions } = await this.getUserPermissions(user.id);

    // 7. Generate token pair baru
    return this.generateTokenPair(
      {
        userId: user.id,
        email: user.email,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        roles,
        permissions,
      },
      ipAddress,
      userAgent,
    );
  }

  // ----------------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------------

  async logout(
    userId: number,
    jti: string,
    accessToken: string,
  ): Promise<void> {
    // 1. Blacklist access token sampai expired
    await this.redis.setex(
      REDIS_KEYS.blacklistedToken(jti),
      REDIS_TTL.blacklist,
      '1',
    );

    // 2. Revoke semua refresh token user ini
    const publicDb = this.db.getPublicDb();
    await publicDb
      .updateTable('refresh_tokens')
      .set({ is_revoked: true })
      .where('user_id', '=', userId)
      .where('is_revoked', '=', false)
      .execute();

    // 3. Hapus session dari Redis
    await this.redis.del(REDIS_KEYS.userSessions(userId.toString()));

    this.logger.log(`Logout: user ${userId}`);
  }

  // ----------------------------------------------------------------
  // LOGOUT ALL DEVICES
  // ----------------------------------------------------------------

  async logoutAllDevices(userId: number, currentJti: string): Promise<void> {
    // Blacklist current access token
    await this.redis.setex(
      REDIS_KEYS.blacklistedToken(currentJti),
      REDIS_TTL.blacklist,
      '1',
    );

    // Revoke semua refresh token
    const publicDb = this.db.getPublicDb();
    await publicDb
      .updateTable('refresh_tokens')
      .set({ is_revoked: true })
      .where('user_id', '=', userId)
      .execute();

    await this.redis.del(REDIS_KEYS.userSessions(userId.toString()));
    this.logger.log(`Logout all devices: user ${userId}`);
  }

  // ----------------------------------------------------------------
  // CHANGE PASSWORD
  // ----------------------------------------------------------------

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    jti: string,
  ): Promise<void> {
    const publicDb = this.db.getPublicDb();
    const user = await publicDb
      .selectFrom('users')
      .where('id', '=', userId)
      .select(['id', 'password_hash'])
      .executeTakeFirst();

    if (!user) throw new UnauthorizedException('User tidak ditemukan');

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.password_hash,
    );
    if (!isValid)
      throw new BadRequestException('Password saat ini tidak benar');

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await publicDb
      .updateTable('users')
      .set({ password_hash: newHash, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();

    // Force logout semua device setelah ganti password
    await this.logoutAllDevices(userId, jti);
  }

  // ----------------------------------------------------------------
  // HASH PASSWORD (untuk user management)
  // ----------------------------------------------------------------

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  // ----------------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------------

  private async generateTokenPair(
    payload: {
      userId: number;
      email: string;
      tenantId: number;
      tenantCode: string;
      roles: string[];
      permissions: PermissionMatrix;
    },
    ipAddress: string,
    userAgent: string,
  ): Promise<TokenPair> {
    const jti = crypto.randomUUID();

    // Access token
    const accessPayload: JwtAccessPayload = {
      sub: payload.userId,
      email: payload.email,
      tenantId: payload.tenantId,
      tenantCode: payload.tenantCode,
      roles: payload.roles,
      permissions: payload.permissions,
      jti,
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: JWT_ACCESS_EXPIRY,
    });

    // Refresh token
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const refreshPayload: JwtRefreshPayload = {
      sub: payload.userId,
      tenantCode: payload.tenantCode,
      tokenHash,
      jti: crypto.randomUUID(),
    };

    const signedRefreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: JWT_REFRESH_EXPIRY,
    });

    const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRY_MS);

    // Simpan ke database
    const publicDb = this.db.getPublicDb();
    await publicDb
      .insertInto('refresh_tokens')
      .values({
        user_id: payload.userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .execute();

    // Cache ke Redis
    await this.redis.setex(
      REDIS_KEYS.refreshToken(tokenHash),
      REDIS_TTL.refreshToken,
      payload.userId,
    );

    return {
      accessToken,
      refreshToken: signedRefreshToken,
      expiresIn: 15 * 60, // 15 menit dalam detik
    };
  }

  private async revokeRefreshToken(tokenHash: string): Promise<void> {
    // Hapus dari Redis
    await this.redis.del(REDIS_KEYS.refreshToken(tokenHash));

    // Tandai revoked di database
    await this.db
      .getPublicDb()
      .updateTable('refresh_tokens')
      .set({ is_revoked: true })
      .where('token_hash', '=', tokenHash)
      .execute();
  }

  private async getUserPermissions(userId: number): Promise<{
    roles: string[];
    permissions: PermissionMatrix;
  }> {
    const publicDb = this.db.getPublicDb();

    const userRoles = await publicDb
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', '=', userId)
      .select(['r.name', 'r.permissions'])
      .execute();

    const roleNames: string[] = [];
    const merged: PermissionMatrix = {};

    for (const role of userRoles) {
      roleNames.push(role.name);
      const perms = role.permissions as PermissionMatrix;

      // Merge permissions dari semua role — union (paling permissive)
      for (const [mod, actions] of Object.entries(perms)) {
        const module = mod as keyof PermissionMatrix;
        const existing = merged[module] ?? [];
        const combined = [...new Set([...existing, ...(actions ?? [])])];
        (merged as Record<string, string[]>)[module] = combined;
      }
    }

    return { roles: roleNames, permissions: merged };
  }

  private async checkLoginRateLimit(ipAddress: string): Promise<void> {
    const key = REDIS_KEYS.rateLimitLogin(ipAddress);
    const attempts = await this.redis.get(key);

    if (attempts && parseInt(attempts) >= RATE_LIMIT.login.maxAttempts) {
      throw new UnauthorizedException(
        'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
      );
    }
  }

  private async incrementLoginAttempt(ipAddress: string): Promise<void> {
    const key = REDIS_KEYS.rateLimitLogin(ipAddress);
    const ttl = RATE_LIMIT.login.windowMs / 1000;

    const current = await this.redis.incr(key);
    if (current === 1) {
      // Set TTL hanya pada increment pertama
      await this.redis.expire(key, ttl);
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
