import {
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from 'openai/error';
import { describe, expect, it } from 'vitest';

import {
  getCerebrasErrorDetails,
  getChatFinishReasonErrorDetails,
  getDeepSeekErrorDetails,
  getKimiErrorDetails,
  getOpenAIErrorDetails,
  getOpenRouterErrorDetails,
  getZaiErrorDetails,
} from '../../../src/providers/utils/chat-errors.js';

describe('OpenAI-compatible provider error helpers', () => {
  const headers = new Headers({ 'x-request-id': 'req_test_123' });

  it('marks Cerebras timeouts as retryable', () => {
    const error = new APIConnectionTimeoutError({ message: 'Request timed out.' });

    expect(getCerebrasErrorDetails(error)).toEqual({
      message: 'Request timed out.',
      canRetry: true,
    });
  });

  it('marks DeepSeek server overloads as retryable', () => {
    const error = new InternalServerError(
      503,
      {
        message: 'The server is overloaded due to high traffic.',
      },
      undefined,
      headers
    );

    expect(getDeepSeekErrorDetails(error)).toEqual({
      message: 'The server is overloaded due to high traffic.',
      canRetry: true,
    });
  });

  it('does not mark Kimi quota 429s as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        type: 'exceeded_current_quota_error',
        message:
          'Your account is not active or has exceeded the current quota. Please check your plan and billing details.',
      },
      undefined,
      headers
    );

    expect(getKimiErrorDetails(error)).toEqual({
      message:
        'Your account is not active or has exceeded the current quota. Please check your plan and billing details.',
      canRetry: false,
    });
  });

  it('does not mark OpenAI quota 429s as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        message: 'You exceeded your current quota, please check your plan and billing details',
      },
      undefined,
      headers
    );

    expect(getOpenAIErrorDetails(error)).toEqual({
      message: 'You exceeded your current quota, please check your plan and billing details',
      canRetry: false,
    });
  });

  it('marks OpenRouter mid-stream server errors as retryable', () => {
    const error = new APIError(
      undefined,
      {
        code: 'server_error',
        message: 'Provider disconnected',
      },
      undefined,
      headers
    );

    expect(getOpenRouterErrorDetails(error)).toEqual({
      message: 'Provider disconnected',
      canRetry: true,
    });
  });

  it('marks Z.AI concurrency limits as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        code: '1302',
        message:
          'High concurrency usage of this API, please reduce concurrency or contact customer service to increase limits',
      },
      undefined,
      headers
    );

    expect(getZaiErrorDetails(error)).toEqual({
      message:
        'High concurrency usage of this API, please reduce concurrency or contact customer service to increase limits',
      canRetry: true,
    });
  });

  it('does not mark Z.AI balance exhaustion as retryable', () => {
    const error = new RateLimitError(
      429,
      {
        code: '1113',
        message: 'Your account is in arrears, please recharge and try again',
      },
      undefined,
      headers
    );

    expect(getZaiErrorDetails(error)).toEqual({
      message: 'Your account is in arrears, please recharge and try again',
      canRetry: false,
    });
  });

  it('maps streaming finish reasons to retryability', () => {
    expect(getChatFinishReasonErrorDetails('network_error')).toEqual({
      message: 'The provider reported a network error during streaming.',
      canRetry: true,
    });

    expect(getChatFinishReasonErrorDetails('content_filter')).toEqual({
      message: 'The request was rejected by the content filter during streaming.',
      canRetry: false,
    });
  });
});
