import { RateLimitError } from 'openai/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamCodex } from '../../../src/providers/codex/stream.js';
import { getMockCodexMessage } from '../../../src/providers/codex/utils.js';
import * as codexProviderUtils from '../../../src/providers/codex/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { CodexProviderOptions, Context, Model } from '../../../src/types/index.js';

describe('Codex Responses stream errors', () => {
  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const model: Model<'codex'> = {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    api: 'codex',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    reasoning: true,
    input: ['text'],
    cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
    tools: ['function_calling'],
  };

  const options: CodexProviderOptions = {
    apiKey: 'access-token',
    'chatgpt-account-id': 'acc-123',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockCodexClient(
    factory: () => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  ) {
    vi.spyOn(codexProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => factory()),
      },
    } as any);
  }

  it('surfaces retryable response.failed errors from Codex', async () => {
    mockCodexClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'response.failed',
          sequence_number: 1,
          response: {
            ...getMockCodexMessage(model.id, 'resp-1'),
            status: 'failed',
            error: {
              code: 'rate_limit_exceeded',
              message: 'Rate limit reached. Please try again in 11.054s.',
            },
          },
        };
      },
    }));

    const stream = streamCodex(model, context, options, 'test-msg-1');

    for await (const _ of stream) {
      // drain
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'Rate limit reached. Please try again in 11.054s.',
      canRetry: true,
    });
  });

  it('marks usage-limit HTTP 429s as non-retryable on drain()', async () => {
    const error = new RateLimitError(
      429,
      {
        type: 'usage_limit_reached',
        message: 'The usage limit has been reached',
      },
      undefined,
      new Headers({ 'x-request-id': 'req_test_123' })
    );

    vi.spyOn(codexProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => {
          throw error;
        }),
      },
    } as any);

    const stream = streamCodex(model, context, options, 'test-msg-2');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        message: 'The usage limit has been reached',
        canRetry: false,
      });
    }
  });
});
