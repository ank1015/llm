import { resolve } from 'node:path';

export const GatewayLogModes = ['off', 'summary', 'full'] as const;
export const GatewayCookieSecureModes = ['auto', 'false', 'true'] as const;

export type GatewayLogMode = (typeof GatewayLogModes)[number];
export type GatewayCookieSecure = 'auto' | boolean;

export interface GatewayConfig {
  host: string;
  port: number;
  dbPath: string;
  jwtSecret: string;
  encryptionKey: Buffer;
  adminToken: string;
  adminUsername?: string;
  adminPassword?: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  corsOrigins: string[];
  logMode: GatewayLogMode;
  rateLimitEnabled: boolean;
  rateLimitWindowSeconds: number;
  rateLimitMax: number;
  loginRateLimitWindowSeconds: number;
  loginRateLimitMax: number;
  authenticatedRateLimitWindowSeconds: number;
  authenticatedRateLimitMax: number;
  maxRequestBodyBytes: number;
  imagePayloadLimitBytes: number;
  maxImages: number;
  trustProxy: boolean;
  cookieSecure: GatewayCookieSecure;
}

export interface GatewayConfigInput {
  host?: string;
  port?: number | string;
  dbPath?: string;
  jwtSecret?: string;
  encryptionKey?: Buffer | string;
  adminToken?: string;
  adminUsername?: string;
  adminPassword?: string;
  accessTtlSeconds?: number | string;
  refreshTtlSeconds?: number | string;
  corsOrigins?: string[] | string;
  logMode?: GatewayLogMode;
  rateLimitEnabled?: boolean | string;
  rateLimitWindowSeconds?: number | string;
  rateLimitMax?: number | string;
  loginRateLimitWindowSeconds?: number | string;
  loginRateLimitMax?: number | string;
  authenticatedRateLimitWindowSeconds?: number | string;
  authenticatedRateLimitMax?: number | string;
  maxRequestBodyBytes?: number | string;
  imagePayloadLimitBytes?: number | string;
  maxImages?: number | string;
  trustProxy?: boolean | string;
  cookieSecure?: GatewayCookieSecure | string;
}

export function getGatewayConfig(overrides: Partial<GatewayConfigInput> = {}): GatewayConfig {
  const host = readString(overrides.host, process.env['GATEWAY_HOST'], '127.0.0.1');
  const port = readInteger(overrides.port, process.env['GATEWAY_PORT'], 8123, 'GATEWAY_PORT');
  const dbPath = normalizeDbPath(
    readString(overrides.dbPath, process.env['GATEWAY_DB_PATH'], './gateway.sqlite')
  );
  const jwtSecret = readRequiredString(
    overrides.jwtSecret,
    process.env['GATEWAY_JWT_SECRET'],
    'GATEWAY_JWT_SECRET'
  );
  const encryptionKey = readEncryptionKey(
    overrides.encryptionKey,
    process.env['GATEWAY_ENCRYPTION_KEY']
  );
  const adminToken = readRequiredString(
    overrides.adminToken,
    process.env['GATEWAY_ADMIN_TOKEN'],
    'GATEWAY_ADMIN_TOKEN'
  );
  const adminUsername = readOptionalString(
    overrides.adminUsername,
    process.env['GATEWAY_ADMIN_USERNAME']
  );
  const adminPassword = readOptionalString(
    overrides.adminPassword,
    process.env['GATEWAY_ADMIN_PASSWORD']
  );
  const accessTtlSeconds = readInteger(
    overrides.accessTtlSeconds,
    process.env['GATEWAY_ACCESS_TTL_SECONDS'],
    900,
    'GATEWAY_ACCESS_TTL_SECONDS'
  );
  const refreshTtlSeconds = readInteger(
    overrides.refreshTtlSeconds,
    process.env['GATEWAY_REFRESH_TTL_SECONDS'],
    2_592_000,
    'GATEWAY_REFRESH_TTL_SECONDS'
  );
  const corsOrigins = readOrigins(overrides.corsOrigins, process.env['GATEWAY_CORS_ORIGINS']);
  const logMode = readLogMode(overrides.logMode, process.env['GATEWAY_LOG_MODE']);
  const rateLimitEnabled = readBoolean(
    overrides.rateLimitEnabled,
    process.env['GATEWAY_RATE_LIMIT_ENABLED'],
    true,
    'GATEWAY_RATE_LIMIT_ENABLED'
  );
  const rateLimitWindowSeconds = readInteger(
    overrides.rateLimitWindowSeconds,
    process.env['GATEWAY_RATE_LIMIT_WINDOW_SECONDS'],
    60,
    'GATEWAY_RATE_LIMIT_WINDOW_SECONDS'
  );
  const rateLimitMax = readInteger(
    overrides.rateLimitMax,
    process.env['GATEWAY_RATE_LIMIT_MAX'],
    60,
    'GATEWAY_RATE_LIMIT_MAX'
  );
  const loginRateLimitWindowSeconds = readInteger(
    overrides.loginRateLimitWindowSeconds,
    process.env['GATEWAY_LOGIN_RATE_LIMIT_WINDOW_SECONDS'],
    600,
    'GATEWAY_LOGIN_RATE_LIMIT_WINDOW_SECONDS'
  );
  const loginRateLimitMax = readInteger(
    overrides.loginRateLimitMax,
    process.env['GATEWAY_LOGIN_RATE_LIMIT_MAX'],
    10,
    'GATEWAY_LOGIN_RATE_LIMIT_MAX'
  );
  const authenticatedRateLimitWindowSeconds = readInteger(
    overrides.authenticatedRateLimitWindowSeconds,
    process.env['GATEWAY_AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS'],
    3_600,
    'GATEWAY_AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS'
  );
  const authenticatedRateLimitMax = readInteger(
    overrides.authenticatedRateLimitMax,
    process.env['GATEWAY_AUTHENTICATED_RATE_LIMIT_MAX'],
    120,
    'GATEWAY_AUTHENTICATED_RATE_LIMIT_MAX'
  );
  const maxRequestBodyBytes = readInteger(
    overrides.maxRequestBodyBytes,
    process.env['GATEWAY_MAX_REQUEST_BODY_BYTES'],
    16 * 1024 * 1024,
    'GATEWAY_MAX_REQUEST_BODY_BYTES'
  );
  const imagePayloadLimitBytes = readInteger(
    overrides.imagePayloadLimitBytes,
    process.env['GATEWAY_IMAGE_PAYLOAD_LIMIT_BYTES'],
    12 * 1024 * 1024,
    'GATEWAY_IMAGE_PAYLOAD_LIMIT_BYTES'
  );
  const maxImages = readInteger(
    overrides.maxImages,
    process.env['GATEWAY_MAX_IMAGES'],
    4,
    'GATEWAY_MAX_IMAGES'
  );
  const trustProxy = readBoolean(
    overrides.trustProxy,
    process.env['GATEWAY_TRUST_PROXY'],
    false,
    'GATEWAY_TRUST_PROXY'
  );
  const cookieSecure = readCookieSecure(
    overrides.cookieSecure,
    process.env['GATEWAY_COOKIE_SECURE']
  );

  return {
    host,
    port,
    dbPath,
    jwtSecret,
    encryptionKey,
    adminToken,
    ...(adminUsername ? { adminUsername } : {}),
    ...(adminPassword ? { adminPassword } : {}),
    accessTtlSeconds,
    refreshTtlSeconds,
    corsOrigins,
    logMode,
    rateLimitEnabled,
    rateLimitWindowSeconds,
    rateLimitMax,
    loginRateLimitWindowSeconds,
    loginRateLimitMax,
    authenticatedRateLimitWindowSeconds,
    authenticatedRateLimitMax,
    maxRequestBodyBytes,
    imagePayloadLimitBytes,
    maxImages,
    trustProxy,
    cookieSecure,
  };
}

function normalizeDbPath(dbPath: string): string {
  return dbPath === ':memory:' ? dbPath : resolve(process.cwd(), dbPath);
}

function readString(
  overrideValue: string | undefined,
  envValue: string | undefined,
  fallback: string
): string {
  const resolved = overrideValue ?? envValue ?? fallback;
  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readOptionalString(
  overrideValue: string | undefined,
  envValue: string | undefined
): string | undefined {
  const resolved = overrideValue ?? envValue;
  if (!resolved || resolved.trim().length === 0) {
    return undefined;
  }

  return resolved.trim();
}

function readRequiredString(
  overrideValue: string | undefined,
  envValue: string | undefined,
  name: string
): string {
  const resolved = overrideValue ?? envValue;
  if (!resolved || resolved.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return resolved.trim();
}

function readInteger(
  overrideValue: number | string | undefined,
  envValue: string | undefined,
  fallback: number,
  name: string
): number {
  const resolved = overrideValue ?? envValue;
  if (resolved === undefined) {
    return fallback;
  }

  const value = typeof resolved === 'number' ? resolved : Number.parseInt(resolved, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readOrigins(
  overrideValue: string[] | string | undefined,
  envValue: string | undefined
): string[] {
  if (Array.isArray(overrideValue)) {
    return overrideValue.length > 0 ? [...overrideValue] : ['*'];
  }

  if (typeof overrideValue === 'string') {
    return parseOriginList(overrideValue);
  }

  if (!envValue || envValue.trim().length === 0) {
    return ['*'];
  }

  return parseOriginList(envValue);
}

function parseOriginList(input: string): string[] {
  const origins = input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return origins.length > 0 ? origins : ['*'];
}

function readLogMode(
  overrideValue: GatewayLogMode | undefined,
  envValue: string | undefined
): GatewayLogMode {
  const resolved = overrideValue ?? envValue ?? 'full';
  if (GatewayLogModes.includes(resolved as GatewayLogMode)) {
    return resolved as GatewayLogMode;
  }

  throw new Error(`GATEWAY_LOG_MODE must be one of: ${GatewayLogModes.join(', ')}`);
}

function readBoolean(
  overrideValue: boolean | string | undefined,
  envValue: string | undefined,
  fallback: boolean,
  name: string
): boolean {
  const resolved = overrideValue ?? envValue;
  if (resolved === undefined) {
    return fallback;
  }

  if (typeof resolved === 'boolean') {
    return resolved;
  }

  const value = resolved.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
}

function readCookieSecure(
  overrideValue: GatewayCookieSecure | string | undefined,
  envValue: string | undefined
): GatewayCookieSecure {
  const resolved = overrideValue ?? envValue ?? 'auto';
  if (typeof resolved === 'boolean') {
    return resolved;
  }

  const value = resolved.trim().toLowerCase();
  if (value === 'auto') {
    return 'auto';
  }
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  throw new Error('GATEWAY_COOKIE_SECURE must be auto, true, or false.');
}

function readEncryptionKey(
  overrideValue: Buffer | string | undefined,
  envValue: string | undefined
): Buffer {
  if (Buffer.isBuffer(overrideValue)) {
    validateEncryptionKey(overrideValue);
    return Buffer.from(overrideValue);
  }

  const rawValue = overrideValue ?? envValue;
  if (!rawValue || rawValue.trim().length === 0) {
    throw new Error('GATEWAY_ENCRYPTION_KEY is required.');
  }

  const value = Buffer.from(rawValue, 'base64');
  validateEncryptionKey(value);
  return value;
}

function validateEncryptionKey(value: Buffer): void {
  if (value.length !== 32) {
    throw new Error('GATEWAY_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
}
