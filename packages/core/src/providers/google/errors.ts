import type { AssistantError } from '../../types/index.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function getNumericStatus(value: unknown): number | undefined {
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

function getGoogleErrorMessage(error: unknown): string {
  if (isObject(error) && typeof error.message === 'string') {
    return error.message;
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

function getGoogleErrorStatusCode(error: unknown): number | undefined {
  if (!isObject(error)) return undefined;

  return getNumericStatus(error.status) ?? getNumericStatus(error.code) ?? undefined;
}

function getGoogleErrorStatusName(error: unknown): string | undefined {
  if (!isObject(error)) return undefined;

  return normalizeString(error.status) ?? normalizeString(error.code) ?? undefined;
}

export function canRetryGoogleError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'APIUserAbortError') {
    return false;
  }

  if (
    error instanceof Error &&
    (error.name === 'APIConnectionError' || error.name === 'APIConnectionTimeoutError')
  ) {
    return true;
  }

  const statusCode = getGoogleErrorStatusCode(error);
  if (statusCode === 429 || statusCode === 500 || statusCode === 503 || statusCode === 504) {
    return true;
  }

  const statusName = getGoogleErrorStatusName(error);
  if (
    statusName === 'resource_exhausted' ||
    statusName === 'internal' ||
    statusName === 'unavailable' ||
    statusName === 'deadline_exceeded'
  ) {
    return true;
  }

  const message = getGoogleErrorMessage(error);
  return (
    /rate limit/i.test(message) ||
    /temporarily overloaded/i.test(message) ||
    /temporarily running out of capacity/i.test(message) ||
    /deadline exceeded/i.test(message) ||
    /unable to finish processing within the deadline/i.test(message) ||
    /timed out/i.test(message) ||
    /timeout/i.test(message) ||
    /network error/i.test(message)
  );
}

export function getGoogleErrorDetails(error: unknown): AssistantError {
  return {
    message: getGoogleErrorMessage(error),
    canRetry: canRetryGoogleError(error),
  };
}
