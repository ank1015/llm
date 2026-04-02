import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamGoogle } from '../../../src/providers/google/stream.js';
import * as googleProviderUtils from '../../../src/providers/google/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { Context, GoogleProviderOptions, Model } from '../../../src/types/index.js';

describe('Google stream errors', () => {
  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const model: Model<'google'> = {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    reasoning: true,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    tools: ['function_calling'],
  };

  const options: GoogleProviderOptions = { apiKey: 'test-key' };

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

  function mockGoogleClient(
    factory: () => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  ) {
    vi.spyOn(googleProviderUtils, 'createClient').mockReturnValue({
      models: {
        generateContentStream: vi.fn(async () => factory()),
      },
    } as any);
  }

  it('marks retryable Gemini backend errors on the result', async () => {
    mockGoogleClient(() =>
      createThrowingAsyncIterable(
        new ApiError({
          status: 503,
          message: 'The service may be temporarily overloaded or down.',
        })
      )
    );

    const stream = streamGoogle(model, context, options, 'test-msg-1');

    for await (const _ of stream) {
      // drain
    }

    const result = await stream.result();

    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      message: 'The service may be temporarily overloaded or down.',
      canRetry: true,
    });
  });

  it('marks billing and precondition errors as non-retryable on drain()', async () => {
    mockGoogleClient(() =>
      createThrowingAsyncIterable(
        new ApiError({
          status: 400,
          message:
            'Gemini API free tier is not available in your country. Please enable billing on your project in Google AI Studio.',
        })
      )
    );

    const stream = streamGoogle(model, context, options, 'test-msg-2');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        message:
          'Gemini API free tier is not available in your country. Please enable billing on your project in Google AI Studio.',
        canRetry: false,
      });
    }
  });
});
