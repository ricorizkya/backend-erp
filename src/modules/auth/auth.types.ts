import { PermissionMatrix } from './auth.constants';

// ================================================================
// JWT PAYLOAD
// Disimpan di dalam token — jaga tetap kecil
// ================================================================

export interface JwtAccessPayload {
  sub: number; // user_id
  email: string;
  tenantId: number;
  tenantCode: string; // dipakai untuk schema switching
  roles: string[]; // nama role
  permissions: PermissionMatrix;
  jti: string; // JWT ID — untuk blacklisting
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: number; // user_id
  tenantCode: string;
  tokenHash: string; // hash dari refresh token itu sendiri
  jti: string;
  iat?: number;
  exp?: number;
}

// ================================================================
// REQUEST AUGMENTATION
// Ditambahkan oleh JwtAuthGuard ke req.user
// ================================================================

export interface AuthenticatedUser {
  userId: number;
  email: string;
  tenantId: number;
  tenantCode: string;
  roles: string[];
  permissions: PermissionMatrix;
  jti: string;
}

// ================================================================
// AUTH RESPONSES
// ================================================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // detik sampai access token expire
}

export interface LoginResponse extends TokenPair {
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantCode: string;
    roles: string[];
  };
}
