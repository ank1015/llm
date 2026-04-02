import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from 'openai/error';

import type { AssistantError } from '../../types/index.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function getNumericStatusCandidate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
    return value;
  }

  if (typeof value === 'string' && /^\d{3}$/.test(value)) {
    const parsed = Number(value);
    if (parsed >= 100 && parsed <= 599) {
      return parsed;
    }
  }

  return undefined;
}

function getPayload(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof APIError) {
    return isObject(error.error) ? error.error : undefined;
  }

  if (isObject(error)) {
    if (isObject(error.error)) {
      return error.error;
    }
    return error;
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  const payload = getPayload(error);
  if (payload && typeof payload.message === 'string') {
    return payload.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function getErrorCode(error: unknown): string | undefined {
  const payload = getPayload(error);
  return normalizeString(payload?.code);
}

function getErrorType(error: unknown): string | undefined {
  const payload = getPayload(error);
  return normalizeString(payload?.type);
}

function getStatus(error: unknown): number | undefined {
  if (error instanceof APIError) {
    return error.status ?? getNumericStatusCandidate(getErrorCode(error)) ?? undefined;
  }

  if (isObject(error)) {
    return (
      getNumericStatusCandidate(error.status) ??
      getNumericStatusCandidate(error.code) ??
      getNumericStatusCandidate(getErrorCode(error)) ??
      undefined
    );
  }

  return undefined;
}

const NON_RETRYABLE_CODES = new Set([
  'context_length_exceeded',
  'insufficient_quota',
  'usage_not_included',
  'invalid_prompt',
  'usage_limit_reached',
  'server_is_overloaded',
  'slow_down',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_reused',
  'refresh_token_invalidated',
]);

const NON_RETRYABLE_TYPES = new Set([
  'usage_limit_reached',
  'usage_not_included',
  'invalid_request_error',
]);

const RETRYABLE_CODES = new Set(['rate_limit_exceeded', 'websocket_connection_limit_reached']);

// Codex error retryability depends on status, typed SDK errors, and response metadata.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function canRetryCodexError(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return false;
  }

  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return true;
  }

  const status = getStatus(error);
  const code = getErrorCode(error);
  const type = getErrorType(error);
  const message = getErrorMessage(error);

  if (typeof status === 'number') {
    if (status >= 500) {
      return true;
    }

    if (status === 429) {
      if ((code && NON_RETRYABLE_CODES.has(code)) || (type && NON_RETRYABLE_TYPES.has(type))) {
        return false;
      }

      return (
        code === 'rate_limit_exceeded' ||
        type === 'rate_limit_exceeded' ||
        (/rate limit/i.test(message) && !/usage limit/i.test(message))
      );
    }

    return false;
  }

  if ((code && NON_RETRYABLE_CODES.has(code)) || (type && NON_RETRYABLE_TYPES.has(type))) {
    return false;
  }

  if ((code && RETRYABLE_CODES.has(code)) || (type && RETRYABLE_CODES.has(type || ''))) {
    return true;
  }

  if (code === 'server_is_overloaded' || code === 'slow_down') {
    return false;
  }

  if (code || type) {
    return true;
  }

  return (
    /try again in\s*\d+(?:\.\d+)?\s*(?:s|ms|seconds?)/i.test(message) ||
    /timed out/i.test(message) ||
    /timeout/i.test(message) ||
    /network error/i.test(message)
  );
}

export function getCodexErrorDetails(error: unknown): AssistantError {
  return {
    message: getErrorMessage(error),
    canRetry: canRetryCodexError(error),
  };
}
