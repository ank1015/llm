import { APIConnectionTimeoutError, APIError } from 'openai/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamCerebras } from '../../../src/providers/cerebras/stream.js';
import { streamOpenRouter } from '../../../src/providers/openrouter/stream.js';
import { streamZai } from '../../../src/providers/zai/stream.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';
import * as sharedProviderUtils from '../../../src/providers/utils/index.js';

import type {
  Context,
  Model,
  CerebrasProviderOptions,
  OpenRouterProviderOptions,
  ZaiProviderOptions,
} from '../../../src/types/index.js';

describe('Shared chat stream provider errors', () => {
  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const baseModel = {
    id: 'test-model',
    name: 'Test Model',
    baseUrl: 'https://example.com/v1',
    reasoning: false,
    input: ['text'] as const,
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const cerebrasModel: Model<'cerebras'> = { ...baseModel, api: 'cerebras' };
  const openRouterModel: Model<'openrouter'> = { ...baseModel, api: 'openrouter' };
  const zaiModel: Model<'zai'> = { ...baseModel, api: 'zai' };

  const cerebrasOptions: CerebrasProviderOptions = { apiKey: 'test-key' };
  const openRouterOptions: OpenRouterProviderOptions = { apiKey: 'test-key' };
  const zaiOptions: ZaiProviderOptions = { apiKey: 'test-key' };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSharedClient(factory: () => AsyncIterable<unknown>) {
    vi.spyOn(sharedProviderUtils, 'createChatCompletionClient').mockReturnValue({
      chat: {
        completions: {
          create: vi.fn(async () => factory()),
        },
      },
    } as any);
  }

  it('surfaces retryable Cerebras timeout errors on the result', async () => {
    const error = new APIConnectionTimeoutError({ message: 'Request timed out.' });
    mockSharedClient(() => ({
      async *[Symbol.asyncIterator]() {
        throw error;
      },
    }));

    const stream = streamCerebras(cerebrasModel, context, cerebrasOptions, 'test-msg-1');

    for await (const _ of stream) {
      // drain
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'Request timed out.',
      canRetry: true,
    });
  });

  it('surfaces retryable OpenRouter mid-stream provider errors on drain()', async () => {
    const error = new APIError(
      undefined,
      {
        code: 'server_error',
        message: 'Provider disconnected',
      },
      undefined,
      new Headers({ 'x-request-id': 'req_test_123' })
    );

    mockSharedClient(() => ({
      async *[Symbol.asyncIterator]() {
        throw error;
      },
    }));

    const stream = streamOpenRouter(openRouterModel, context, openRouterOptions, 'test-msg-2');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        message: 'Provider disconnected',
        canRetry: true,
      });
    }
  });

  it('surfaces retryable Z.AI finish_reason errors without a thrown SDK exception', async () => {
    mockSharedClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'network_error',
            },
          ],
        };
      },
    }));

    const stream = streamZai(zaiModel, context, zaiOptions, 'test-msg-3');

    for await (const _ of stream) {
      // drain
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'The provider reported a network error during streaming.',
      canRetry: true,
    });
  });
});
