import {
  APIConnectionTimeoutError,
  APIError,
  BadRequestError,
  RateLimitError,
} from '@anthropic-ai/sdk/error';
import { describe, expect, it } from 'vitest';

import {
  canRetryAnthropicError,
  getAnthropicErrorDetails,
} from '../../../src/providers/anthropic/errors.js';

describe('Anthropic error helpers', () => {
  const headers = new Headers({ 'request-id': 'req_test_123' });

  it('marks HTTP rate limits as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Too many requests',
        },
        request_id: 'req_test_123',
      },
      undefined,
      headers
    );

    expect(canRetryAnthropicError(error)).toBe(true);
    expect(getAnthropicErrorDetails(error)).toEqual({
      message: 'Too many requests',
      canRetry: true,
    });
  });

  it('marks streamed overloaded errors as retryable', () => {
    const error = new APIError(
      undefined,
      {
        type: 'error',
        error: {
          type: 'overloaded_error',
          message: 'Service is overloaded',
        },
        request_id: 'req_test_123',
      },
      undefined,
      headers
    );

    expect(canRetryAnthropicError(error)).toBe(true);
    expect(getAnthropicErrorDetails(error)).toEqual({
      message: 'Service is overloaded',
      canRetry: true,
    });
  });

  it('does not mark invalid requests as retryable', () => {
    const error = new BadRequestError(
      400,
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Invalid request body',
        },
        request_id: 'req_test_123',
      },
      undefined,
      headers
    );

    expect(canRetryAnthropicError(error)).toBe(false);
    expect(getAnthropicErrorDetails(error)).toEqual({
      message: 'Invalid request body',
      canRetry: false,
    });
  });

  it('marks connection timeouts as retryable', () => {
    const error = new APIConnectionTimeoutError({ message: 'Request timed out.' });

    expect(canRetryAnthropicError(error)).toBe(true);
    expect(getAnthropicErrorDetails(error)).toEqual({
      message: 'Request timed out.',
      canRetry: true,
    });
  });
});
