import { RateLimitError } from '@anthropic-ai/sdk/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAnthropic } from '../../../src/providers/anthropic/stream.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';
import * as anthropicUtils from '../../../src/providers/anthropic/utils.js';

import type { Context, Model } from '../../../src/types/index.js';

describe('Anthropic stream errors', () => {
  const model: Model<'anthropic'> = {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  };

  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello Claude' }],
      },
    ],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRetryableAnthropicStream() {
    const headers = new Headers({ 'request-id': 'req_test_123' });
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

    vi.spyOn(anthropicUtils, 'createClient').mockReturnValue({
      client: {
        messages: {
          stream: () => ({
            async *[Symbol.asyncIterator]() {
              throw error;
            },
          }),
        },
      } as any,
      isOAuthToken: false,
    });
  }

  it('includes canRetry on error results', async () => {
    mockRetryableAnthropicStream();

    const stream = streamAnthropic(model, context, { apiKey: 'test-key' }, 'test-msg-1');

    for await (const _ of stream) {
      // drain events
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'Too many requests',
      canRetry: true,
    });
    expect(result.errorMessage).toBe('Too many requests');
  });

  it('throws AssistantStreamError with canRetry from drain()', async () => {
    mockRetryableAnthropicStream();

    const stream = streamAnthropic(model, context, { apiKey: 'test-key' }, 'test-msg-2');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AssistantStreamError);
      expect(error).toMatchObject({
        name: 'AssistantStreamError',
        message: 'Too many requests',
        canRetry: true,
      });
    }
  });
});
