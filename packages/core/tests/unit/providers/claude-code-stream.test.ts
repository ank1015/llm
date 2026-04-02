import { RateLimitError } from '@anthropic-ai/sdk/error';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamClaudeCode } from '../../../src/providers/claude-code/stream.js';
import * as claudeCodeUtils from '../../../src/providers/claude-code/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { ClaudeCodeProviderOptions, Context, Model } from '../../../src/types/index.js';

describe('Claude Code stream errors', () => {
  const model: Model<'claude-code'> = {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'claude-code',
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
        content: [{ type: 'text', content: 'Hello Claude Code' }],
      },
    ],
  };

  const options: ClaudeCodeProviderOptions = {
    oauthToken: 'oauth-token',
    betaFlag: 'oauth-2025-04-20',
    billingHeader: 'x-billing-account: acc-123',
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

  function mockRetryableClaudeCodeStream() {
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

    vi.spyOn(claudeCodeUtils, 'createClient').mockReturnValue({
      messages: {
        stream: () => createThrowingAsyncIterable(error),
      },
    } as any);
  }

  it('includes canRetry on error results', async () => {
    mockRetryableClaudeCodeStream();

    const stream = streamClaudeCode(model, context, options, 'test-msg-1');

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
    mockRetryableClaudeCodeStream();

    const stream = streamClaudeCode(model, context, options, 'test-msg-2');

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
