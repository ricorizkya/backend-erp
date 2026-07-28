// ================================================================
// AUTH CONSTANTS
// ================================================================

export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';
export const JWT_REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari dalam ms

export const BCRYPT_ROUNDS = 12;

// Redis key patterns
export const REDIS_KEYS = {
  refreshToken: (tokenHash: string) => `auth:rt:${tokenHash}`,
  userSessions: (userId: string) => `auth:sessions:${userId}`,
  rateLimitLogin: (ip: string) => `ratelimit:login:${ip}`,
  rateLimitApi: (userId: string) => `ratelimit:api:${userId}`,
  blacklistedToken: (jti: string) => `auth:blacklist:${jti}`,
} as const;

// Redis TTL (detik)
export const REDIS_TTL = {
  refreshToken: 7 * 24 * 60 * 60, // 7 hari
  accessToken: 15 * 60, // 15 menit
  blacklist: 15 * 60, // sama dengan access token expiry
  rateLimitLogin: 15 * 60, // window 15 menit
} as const;

// Rate limiting
export const RATE_LIMIT = {
  login: {
    maxAttempts: 5, // maksimal 5 percobaan login
    windowMs: 15 * 60 * 1000, // dalam 15 menit
  },
  api: {
    maxRequests: 100, // per user per menit
    windowMs: 60 * 1000,
  },
  apiTenant: {
    maxRequests: 1000, // per tenant per menit
    windowMs: 60 * 1000,
  },
} as const;

// ================================================================
// PERMISSION CONSTANTS
// Module-action matrix
// ================================================================

export const MODULES = {
  INVENTORY: 'inventory',
  PURCHASE_REQUEST: 'purchase_request',
  PURCHASE_ORDER: 'purchase_order',
  GOODS_RECEIPT: 'goods_receipt',
  VENDOR_INVOICE: 'vendor_invoice',
  SALES_QUOTATION: 'sales_quotation',
  SALES_ORDER: 'sales_order',
  DELIVERY_ORDER: 'delivery_order',
  CUSTOMER_INVOICE: 'customer_invoice',
  BOM: 'bom',
  PRODUCTION: 'production',
  MRP: 'mrp',
  QUALITY_CONTROL: 'quality_control',
  ACCOUNTING: 'accounting',
  BANK: 'bank',
  REPORTING: 'reporting',
  USER_MANAGEMENT: 'user_management',
  ROLE_MANAGEMENT: 'role_management',
  MASTER_DATA: 'master_data',
  TENANT_SETTINGS: 'tenant_settings',
} as const;

export const ACTIONS = {
  READ: 'read',
  WRITE: 'write', // create + update
  DELETE: 'delete',
  APPROVE: 'approve', // approve/confirm dokumen
  EXPORT: 'export', // export laporan
} as const;

export type Module = (typeof MODULES)[keyof typeof MODULES];
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

// Tipe permissions yang disimpan di roles.permissions (JSONB)
export type PermissionMatrix = Partial<Record<Module, Action[]>>;

// Default permissions per role template
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionMatrix> = {
  admin: Object.fromEntries(
    Object.values(MODULES).map((m) => [m, Object.values(ACTIONS)]),
  ),

  manager: {
    [MODULES.INVENTORY]: ['read', 'write', 'approve', 'export'],
    [MODULES.PURCHASE_REQUEST]: ['read', 'write', 'approve'],
    [MODULES.PURCHASE_ORDER]: ['read', 'write', 'approve'],
    [MODULES.GOODS_RECEIPT]: ['read', 'write', 'approve'],
    [MODULES.VENDOR_INVOICE]: ['read', 'write', 'approve'],
    [MODULES.SALES_QUOTATION]: ['read', 'write', 'approve'],
    [MODULES.SALES_ORDER]: ['read', 'write', 'approve'],
    [MODULES.DELIVERY_ORDER]: ['read', 'write', 'approve'],
    [MODULES.CUSTOMER_INVOICE]: ['read', 'write'],
    [MODULES.BOM]: ['read', 'write', 'approve'],
    [MODULES.PRODUCTION]: ['read', 'write', 'approve'],
    [MODULES.MRP]: ['read', 'write'],
    [MODULES.QUALITY_CONTROL]: ['read', 'write', 'approve'],
    [MODULES.ACCOUNTING]: ['read'],
    [MODULES.REPORTING]: ['read', 'export'],
    [MODULES.MASTER_DATA]: ['read', 'write'],
  },

  staff_gudang: {
    [MODULES.INVENTORY]: ['read', 'write'],
    [MODULES.GOODS_RECEIPT]: ['read', 'write'],
    [MODULES.DELIVERY_ORDER]: ['read', 'write'],
    [MODULES.QUALITY_CONTROL]: ['read', 'write'],
    [MODULES.MASTER_DATA]: ['read'],
  },

  staff_produksi: {
    [MODULES.INVENTORY]: ['read'],
    [MODULES.BOM]: ['read'],
    [MODULES.PRODUCTION]: ['read', 'write'],
    [MODULES.QUALITY_CONTROL]: ['read', 'write'],
    [MODULES.MASTER_DATA]: ['read'],
  },

  staff_pembelian: {
    [MODULES.PURCHASE_REQUEST]: ['read', 'write'],
    [MODULES.PURCHASE_ORDER]: ['read', 'write'],
    [MODULES.GOODS_RECEIPT]: ['read'],
    [MODULES.VENDOR_INVOICE]: ['read', 'write'],
    [MODULES.MASTER_DATA]: ['read'],
    [MODULES.REPORTING]: ['read'],
  },

  staff_penjualan: {
    [MODULES.SALES_QUOTATION]: ['read', 'write'],
    [MODULES.SALES_ORDER]: ['read', 'write'],
    [MODULES.DELIVERY_ORDER]: ['read'],
    [MODULES.CUSTOMER_INVOICE]: ['read', 'write'],
    [MODULES.INVENTORY]: ['read'],
    [MODULES.MASTER_DATA]: ['read'],
    [MODULES.REPORTING]: ['read'],
  },

  akuntan: {
    [MODULES.ACCOUNTING]: ['read', 'write', 'approve'],
    [MODULES.BANK]: ['read', 'write'],
    [MODULES.VENDOR_INVOICE]: ['read'],
    [MODULES.CUSTOMER_INVOICE]: ['read'],
    [MODULES.REPORTING]: ['read', 'export'],
  },
};
