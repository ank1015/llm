import { createHash } from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'accessToken',
  'adminToken',
  'apiKey',
  'authorization',
  'billingHeader',
  'cookie',
  'encryptionKey',
  'fetch',
  'headers',
  'jwtSecret',
  'oauthToken',
  'refreshToken',
  'signal',
]);

const FORBIDDEN_PROVIDER_OPTION_KEYS = new Set([
  'accessToken',
  'adminToken',
  'apiKey',
  'authorization',
  'billingHeader',
  'cookie',
  'fetch',
  'headers',
  'oauthToken',
  'refreshToken',
  'signal',
]);

export function sanitizeProviderOptions(input: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const sanitized = sanitizeRuntimeObject(input);
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeForStorage(input: unknown): unknown {
  return sanitizeForStorageValue(input);
}

function sanitizeRuntimeObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_PROVIDER_OPTION_KEYS.has(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value.map((item) => (isPlainObject(item) ? sanitizeRuntimeObject(item) : item));
      continue;
    }

    if (isPlainObject(value)) {
      output[key] = sanitizeRuntimeObject(value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function sanitizeForStorageValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForStorageValue(item));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = '[REDACTED]';
      continue;
    }

    if (
      key === 'data' &&
      typeof value === 'string' &&
      typeof input['type'] === 'string' &&
      (input['type'] === 'image' || input['type'] === 'file')
    ) {
      output[key] = describeBase64Payload(value);
      continue;
    }

    output[key] = sanitizeForStorageValue(value);
  }

  return output;
}

function describeBase64Payload(data: string): Record<string, unknown> {
  const bytes = Buffer.from(data, 'base64');

  return {
    redacted: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
