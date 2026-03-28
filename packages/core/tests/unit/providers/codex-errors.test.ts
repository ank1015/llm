import {
  APIConnectionTimeoutError,
  InternalServerError,
  RateLimitError,
} from 'openai/error';
import { describe, expect, it } from 'vitest';

import {
  canRetryCodexError,
  getCodexErrorDetails,
} from '../../../src/providers/codex/errors.js';

describe('Codex error helpers', () => {
  const headers = new Headers({ 'x-request-id': 'req_test_123' });

  it('marks rate_limit_exceeded stream errors as retryable', () => {
    const error = {
      code: 'rate_limit_exceeded',
      message: 'Rate limit reached. Please try again in 11.054s.',
    };

    expect(canRetryCodexError(error)).toBe(true);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'Rate limit reached. Please try again in 11.054s.',
      canRetry: true,
    });
  });

  it('does not mark context length errors as retryable', () => {
    const error = {
      code: 'context_length_exceeded',
      message: 'Your input exceeds the context window of this model.',
    };

    expect(canRetryCodexError(error)).toBe(false);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'Your input exceeds the context window of this model.',
      canRetry: false,
    });
  });

  it('does not mark usage_limit_reached HTTP 429s as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        type: 'usage_limit_reached',
        message: 'The usage limit has been reached',
      },
      undefined,
      headers
    );

    expect(canRetryCodexError(error)).toBe(false);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'The usage limit has been reached',
      canRetry: false,
    });
  });

  it('marks HTTP 503 backend overloads as retryable', () => {
    const error = new InternalServerError(
      503,
      {
        code: 'server_is_overloaded',
        message: 'Backend is overloaded',
      },
      undefined,
      headers
    );

    expect(canRetryCodexError(error)).toBe(true);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'Backend is overloaded',
      canRetry: true,
    });
  });

  it('does not mark stream overloaded codes as retryable', () => {
    const error = {
      code: 'server_is_overloaded',
      message: 'Backend is overloaded',
    };

    expect(canRetryCodexError(error)).toBe(false);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'Backend is overloaded',
      canRetry: false,
    });
  });

  it('marks connection timeouts as retryable', () => {
    const error = new APIConnectionTimeoutError({ message: 'Request timed out.' });

    expect(canRetryCodexError(error)).toBe(true);
    expect(getCodexErrorDetails(error)).toEqual({
      message: 'Request timed out.',
      canRetry: true,
    });
  });
});
