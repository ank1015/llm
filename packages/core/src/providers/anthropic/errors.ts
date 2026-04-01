import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk/error';

import type { AssistantError } from '../../types/index.js';
import type { ErrorObject } from '@anthropic-ai/sdk/resources/shared.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAnthropicErrorObject(value: unknown): value is ErrorObject {
  return (
    isObject(value) &&
    typeof value.type === 'string' &&
    typeof value.message === 'string'
  );
}

function getAnthropicErrorObject(error: APIError): ErrorObject | undefined {
  const body = error.error;

  if (isAnthropicErrorObject(body)) {
    return body;
  }

  if (isObject(body) && 'error' in body && isAnthropicErrorObject(body.error)) {
    return body.error;
  }

  return undefined;
}

function isRetryableAnthropicErrorType(type: string | undefined): boolean {
  return (
    type === 'rate_limit_error' ||
    type === 'api_error' ||
    type === 'overloaded_error' ||
    type === 'timeout_error'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const anthropicError = getAnthropicErrorObject(error);
    if (anthropicError) {
      return anthropicError.message;
    }
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

export function canRetryAnthropicError(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return false;
  }

  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return true;
  }

  if (error instanceof RateLimitError || error instanceof InternalServerError) {
    return true;
  }

  if (error instanceof APIError) {
    const anthropicError = getAnthropicErrorObject(error);
    if (isRetryableAnthropicErrorType(anthropicError?.type)) {
      return true;
    }

    return error.status === 429 || (typeof error.status === 'number' && error.status >= 500);
  }

  return false;
}

export function getAnthropicErrorDetails(error: unknown): AssistantError {
  return {
    message: getErrorMessage(error),
    canRetry: canRetryAnthropicError(error),
  };
}
