import { RateLimitError } from '@anthropic-ai/sdk/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamMinimax } from '../../../src/providers/minimax/stream.js';
import * as minimaxUtils from '../../../src/providers/minimax/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { Context, MiniMaxProviderOptions, Model } from '../../../src/types/index.js';

describe('MiniMax stream errors', () => {
  const model: Model<'minimax'> = {
    id: 'minimax-test-model',
    name: 'MiniMax Test Model',
    api: 'minimax',
    baseUrl: 'https://api.minimax.io/anthropic',
    reasoning: false,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello MiniMax' }],
      },
    ],
  };

  const options: MiniMaxProviderOptions = {
    apiKey: 'test-key',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createThrowingAsyncIterable(error: unknown): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw error;
          },
        };
      },
    };
  }

  function mockRetryableMinimaxStream() {
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

    vi.spyOn(minimaxUtils, 'createClient').mockReturnValue({
      messages: {
        stream: () => createThrowingAsyncIterable(error),
      },
    } as any);
  }

  it('includes canRetry on error results', async () => {
    mockRetryableMinimaxStream();

    const stream = streamMinimax(model, context, options, 'test-msg-1');

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
    mockRetryableMinimaxStream();

    const stream = streamMinimax(model, context, options, 'test-msg-2');

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
