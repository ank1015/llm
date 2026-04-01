import { beforeEach, describe, expect, it, vi } from 'vitest';

import { stream } from '../../../src/llm/stream.js';
import { registerProvider } from '../../../src/providers/registry.js';
import { EventStream } from '../../../src/utils/event-stream.js';

import type { AssistantMessageEventStream } from '../../../src/utils/event-stream.js';
import type { Context, Model } from '../../../src/types/index.js';

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

// Helper to create mock event stream
function createMockEventStream(): AssistantMessageEventStream<any> {
  return new EventStream() as AssistantMessageEventStream<any>;
}

// Create mock stream functions and register them via the registry
const mockStreamAnthropic = vi.fn();
const mockStreamClaudeCode = vi.fn();
const mockStreamOpenAI = vi.fn();
const mockStreamGoogle = vi.fn();
const mockStreamDeepSeek = vi.fn();
const mockStreamZai = vi.fn();
const mockStreamKimi = vi.fn();

registerProvider('anthropic', { stream: mockStreamAnthropic, getMockNativeMessage: () => ({}) });
registerProvider('claude-code', {
  stream: mockStreamClaudeCode,
  getMockNativeMessage: () => ({}),
});
registerProvider('openai', { stream: mockStreamOpenAI, getMockNativeMessage: () => ({}) });
registerProvider('google', { stream: mockStreamGoogle, getMockNativeMessage: () => ({}) });
registerProvider('deepseek', { stream: mockStreamDeepSeek, getMockNativeMessage: () => ({}) });
registerProvider('zai', { stream: mockStreamZai, getMockNativeMessage: () => ({}) });
registerProvider('kimi', { stream: mockStreamKimi, getMockNativeMessage: () => ({}) });

describe('stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('provider dispatch', () => {
    it('should dispatch to Anthropic provider', () => {
      const model = createMockModel('anthropic');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamAnthropic.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamAnthropic).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to OpenAI provider', () => {
      const model = createMockModel('openai');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamOpenAI.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamOpenAI).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to Claude Code provider', () => {
      const model = createMockModel('claude-code');
      const context = createMockContext();
      const options = {
        oauthToken: 'test-oauth-token',
        betaFlag: 'oauth-2025-04-20',
        billingHeader: 'x-billing-account: test',
      };
      const mockStream = createMockEventStream();

      mockStreamClaudeCode.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamClaudeCode).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to Google provider', () => {
      const model = createMockModel('google');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamGoogle.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamGoogle).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to DeepSeek provider', () => {
      const model = createMockModel('deepseek');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamDeepSeek.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamDeepSeek).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to Zai provider', () => {
      const model = createMockModel('zai');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamZai.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamZai).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });

    it('should dispatch to Kimi provider', () => {
      const model = createMockModel('kimi');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamKimi.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      expect(mockStreamKimi).toHaveBeenCalledWith(model, context, options, 'req-1');
      expect(result).toBe(mockStream);
    });
  });

  describe('stream returns correct type', () => {
    it('should return an event stream that can be iterated', async () => {
      const model = createMockModel('anthropic');
      const context = createMockContext();
      const options = { apiKey: 'test-key' };
      const mockStream = createMockEventStream();

      mockStreamAnthropic.mockReturnValue(mockStream);

      const result = stream(model, context, options, 'req-1');

      // Verify the stream is iterable
      expect(result[Symbol.asyncIterator]).toBeDefined();
      expect(typeof result.result).toBe('function');
    });
  });
});
