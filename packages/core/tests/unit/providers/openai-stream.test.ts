import { RateLimitError } from 'openai/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamOpenAI } from '../../../src/providers/openai/stream.js';
import { getMockOpenaiMessage } from '../../../src/providers/openai/utils.js';
import * as openaiProviderUtils from '../../../src/providers/openai/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { Context, Model, OpenAIProviderOptions } from '../../../src/types/index.js';

describe('OpenAI Responses stream errors', () => {
  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const model: Model<'openai'> = {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const options: OpenAIProviderOptions = { apiKey: 'test-key' };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponsesClient(
    factory: () => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  ) {
    vi.spyOn(openaiProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => factory()),
      },
    } as any);
  }

  it('surfaces retryable response.failed errors from the Responses API', async () => {
    mockResponsesClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'response.failed',
          sequence_number: 1,
          response: {
            ...getMockOpenaiMessage(model.id, 'resp-1'),
            status: 'failed',
            error: {
              code: 'server_error',
              message: 'The server had an error while processing your request',
            },
          },
        };
      },
    }));

    const stream = streamOpenAI(model, context, options, 'test-msg-1');

    for await (const _ of stream) {
      // drain
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'The server had an error while processing your request',
      canRetry: true,
    });
    expect(result.errorMessage).toBe('The server had an error while processing your request');
  });

  it('marks quota 429 errors as non-retryable on drain()', async () => {
    const error = new RateLimitError(
      429,
      {
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        message: 'You exceeded your current quota, please check your plan and billing details',
      },
      undefined,
      new Headers({ 'x-request-id': 'req_test_123' })
    );

    vi.spyOn(openaiProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => {
          throw error;
        }),
      },
    } as any);

    const stream = streamOpenAI(model, context, options, 'test-msg-2');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        message: 'You exceeded your current quota, please check your plan and billing details',
        canRetry: false,
      });
    }
  });
});
