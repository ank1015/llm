import { RateLimitError } from 'openai/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAzureOpenAI } from '../../../src/providers/azure-openai/stream.js';
import { getMockAzureOpenAIMessage } from '../../../src/providers/azure-openai/utils.js';
import * as azureOpenAIProviderUtils from '../../../src/providers/azure-openai/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { AzureOpenAIProviderOptions, Context, Model } from '../../../src/types/index.js';

describe('Azure OpenAI Responses stream', () => {
  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const model: Model<'azure-openai'> = {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    api: 'azure-openai',
    baseUrl: '',
    reasoning: true,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const options: AzureOpenAIProviderOptions = {
    apiKey: 'test-key',
    azureBaseURL: 'https://example-resource.openai.azure.com/openai/v1',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponsesClient(
    factory: () => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  ) {
    vi.spyOn(azureOpenAIProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => factory()),
      },
    } as any);
  }

  it('returns a final Azure OpenAI assistant message', async () => {
    mockResponsesClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'response.completed',
          response: {
            ...getMockAzureOpenAIMessage(model.id, 'resp-1'),
            status: 'completed',
          },
        };
      },
    }));

    const stream = streamAzureOpenAI(model, context, options, 'test-msg-1');
    await stream.drain();
    const result = await stream.result();

    expect(result.api).toBe('azure-openai');
    expect(result.model).toBe(model);
    expect(result.message.status).toBe('completed');
  });

  it('surfaces retryable response.failed errors from the Responses API', async () => {
    mockResponsesClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'response.failed',
          sequence_number: 1,
          response: {
            ...getMockAzureOpenAIMessage(model.id, 'resp-2'),
            status: 'failed',
            error: {
              code: 'server_error',
              message: 'The server had an error while processing your request',
            },
          },
        };
      },
    }));

    const stream = streamAzureOpenAI(model, context, options, 'test-msg-2');

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

    vi.spyOn(azureOpenAIProviderUtils, 'createClient').mockReturnValue({
      responses: {
        create: vi.fn(async () => {
          throw error;
        }),
      },
    } as any);

    const stream = streamAzureOpenAI(model, context, options, 'test-msg-3');

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

  it('marks aborted requests as aborted', async () => {
    mockResponsesClient(() => ({
      async *[Symbol.asyncIterator]() {
        yield* [];
      },
    }));
    const controller = new AbortController();
    controller.abort();

    const stream = streamAzureOpenAI(
      model,
      context,
      { ...options, signal: controller.signal },
      'test-msg-4'
    );

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        stopReason: 'aborted',
      });
    }
  });
});
