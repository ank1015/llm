import { resolve } from 'node:path';

export const GatewayLogModes = ['off', 'summary', 'full'] as const;

export type GatewayLogMode = (typeof GatewayLogModes)[number];

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
