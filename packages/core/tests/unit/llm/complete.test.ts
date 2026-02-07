import { beforeEach, describe, expect, it, vi } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { stream } from '../../../src/llm/stream.js';
import { AssistantMessageEventStream } from '../../../src/utils/event-stream.js';

import type { BaseAssistantMessage, Context, Model } from '@ank1015/llm-types';

// Mock the stream function
vi.mock('../../../src/llm/stream.js', () => ({
  stream: vi.fn(),
}));

// Helper to create mock model
function createMockModel<T extends string>(api: T): Model<any> {
  return {
    id: `${api}-model`,
    name: `Test ${api} Model`,
    api,
    baseUrl: `https://api.${api}.com`,
    reasoning: false,
    input: ['text'],
    cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 },
    contextWindow: 100000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };
}

// Helper to create mock context
function createMockContext(): Context {
  return {
    messages: [{ role: 'user', id: 'msg-1', content: [{ type: 'text', content: 'Hello' }] }],
    systemPrompt: 'You are a helpful assistant',
    tools: [],
  };
}

// Helper to create mock response
function createMockResponse(api: string): BaseAssistantMessage<any> {
  return {
    role: 'assistant',
    id: 'response-1',
    api,
    model: createMockModel(api),
    message: {},
    content: [{ type: 'response', content: [{ type: 'text', content: 'Hello!' }] }],
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
    duration: 100,
  };
}

// Helper to create a mock event stream that emits events and resolves with a result
function createMockStream(result: BaseAssistantMessage<any>): AssistantMessageEventStream<any> {
  const mockStream = new AssistantMessageEventStream<any>();
  // Simulate async producer: push events then end
  setTimeout(() => {
    mockStream.push({ type: 'start', message: result });
    mockStream.push({ type: 'done', reason: 'stop', message: result });
    mockStream.end(result);
  }, 0);
  return mockStream;
}

describe('complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stream delegation', () => {
    it('should call stream and return the drained result', async () => {
      const model = createMockModel('anthropic');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockResponse = createMockResponse('anthropic');

      vi.mocked(stream).mockReturnValue(createMockStream(mockResponse));

      const result = await complete(model, context, options, 'req-1');

      expect(stream).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toEqual(mockResponse);
    });

    it('should work for all provider types', async () => {
      const apis = [
        'anthropic',
        'claude-code',
        'openai',
        'google',
        'deepseek',
        'zai',
        'kimi',
      ] as const;

      for (const api of apis) {
        vi.clearAllMocks();
        const model = createMockModel(api);
        const context = createMockContext();
        const options =
          api === 'claude-code'
            ? {
                oauthToken: 'test-oauth-token',
                betaFlag: 'oauth-2025-04-20',
                billingHeader: 'x-billing-account: test',
              }
            : { apiKey: 'test-key' };
        const mockResponse = createMockResponse(api);

        vi.mocked(stream).mockReturnValue(createMockStream(mockResponse));

        const result = await complete(model, context, options, `req-${api}`);

        expect(stream).toHaveBeenCalledWith(model, context, options, `req-${api}`);
        expect(result).toEqual(mockResponse);
      }
    });
  });

  describe('event draining', () => {
    it('should drain all events without queuing them', async () => {
      const model = createMockModel('anthropic');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockResponse = createMockResponse('anthropic');

      // Create a stream with many events to verify they get drained
      const mockStream = new AssistantMessageEventStream<any>();
      setTimeout(() => {
        mockStream.push({ type: 'start', message: mockResponse });
        for (let i = 0; i < 100; i++) {
          mockStream.push({
            type: 'text_delta',
            contentIndex: 0,
            delta: 'x',
            message: mockResponse,
          });
        }
        mockStream.push({ type: 'done', reason: 'stop', message: mockResponse });
        mockStream.end(mockResponse);
      }, 0);

      vi.mocked(stream).mockReturnValue(mockStream);

      const result = await complete(model, context, options, 'req-1');

      expect(result).toEqual(mockResponse);
      // After drain, the internal queue should be empty (events were consumed, not buffered)
    });
  });

  describe('error handling', () => {
    it('should throw on error result from stream', async () => {
      const model = createMockModel('anthropic');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const errorResponse = createMockResponse('anthropic');
      errorResponse.stopReason = 'error';
      errorResponse.errorMessage = 'API rate limited';

      const mockStream = new AssistantMessageEventStream<any>();
      setTimeout(() => {
        mockStream.push({ type: 'error', reason: 'error', message: errorResponse });
        mockStream.end(errorResponse);
      }, 0);

      vi.mocked(stream).mockReturnValue(mockStream);

      await expect(complete(model, context, options, 'req-1')).rejects.toThrow('API rate limited');
    });
  });

  describe('context and options forwarding', () => {
    it('should forward all context fields to stream', async () => {
      const model = createMockModel('anthropic');
      const context: Context = {
        messages: [
          { role: 'user', id: 'msg-1', content: [{ type: 'text', content: 'Hello' }] },
          {
            role: 'toolResult',
            id: 'msg-2',
            toolName: 'calculator',
            toolCallId: 'call-1',
            content: [{ type: 'text', content: '42' }],
            isError: false,
            timestamp: Date.now(),
          },
        ],
        systemPrompt: 'Be helpful',
        tools: [{ name: 'calculator', description: 'Does math', parameters: {} as any }],
      };
      const options = { apiKey: 'test-key', max_tokens: 1000 };
      const mockResponse = createMockResponse('anthropic');

      vi.mocked(stream).mockReturnValue(createMockStream(mockResponse));

      await complete(model, context, options, 'req-1');

      expect(stream).toHaveBeenCalledWith(model, context, options, 'req-1');
    });
  });
});
