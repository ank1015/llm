/**
 * Unit tests for SDK stream function
 */

import * as core from '@ank1015/llm-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { stream } from '../../../src/llm/stream.js';

import type { KeysAdapter, UsageAdapter } from '../../../src/adapters/types.js';
import type { AssistantMessageEventStream } from '@ank1015/llm-core';
import type { Model, Context, BaseAssistantMessage } from '@ank1015/llm-types';

// Mock the core stream function
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    stream: vi.fn(),
  };
});

describe('stream', () => {
  const mockModel: Model<'anthropic'> = {
    api: 'anthropic',
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    tools: ['function'],
  };

  const mockClaudeCodeModel: Model<'claude-code'> = {
    api: 'claude-code',
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text'],
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    tools: ['function'],
  };

  const mockContext: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  const mockResponse: BaseAssistantMessage<'anthropic'> = {
    role: 'assistant',
    message: {} as BaseAssistantMessage<'anthropic'>['message'],
    api: 'anthropic',
    id: 'resp-1',
    model: mockModel,
    timestamp: Date.now(),
    duration: 100,
    stopReason: 'stop',
    content: [{ type: 'response', content: [{ type: 'text', content: 'Hi there!' }] }],
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0.00003, output: 0.000075, cacheRead: 0, cacheWrite: 0, total: 0.000105 },
    },
  };

  function createMockEventStream(): AssistantMessageEventStream<'anthropic'> {
    const mockResultFn = vi.fn().mockResolvedValue(mockResponse);
    return {
      [Symbol.asyncIterator]: async function* () {
        yield mockResponse;
      },
      result: mockResultFn,
    } as unknown as AssistantMessageEventStream<'anthropic'>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API key resolution', () => {
    it('should use apiKey from providerOptions when provided', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'direct-key' },
      });

      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'direct-key' }),
        expect.any(String)
      );
    });

    it('should use keysAdapter when apiKey not in providerOptions', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue('adapter-key'),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      await stream(mockModel, mockContext, {
        keysAdapter: mockKeysAdapter,
      });

      expect(mockKeysAdapter.get).toHaveBeenCalledWith('anthropic');
      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'adapter-key' }),
        expect.any(String)
      );
    });

    it('should prefer providerOptions.apiKey over keysAdapter', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue('adapter-key'),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'direct-key' },
        keysAdapter: mockKeysAdapter,
      });

      expect(mockKeysAdapter.get).not.toHaveBeenCalled();
      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'direct-key' }),
        expect.any(String)
      );
    });

    it('should throw ApiKeyNotFoundError when no key available', async () => {
      await expect(stream(mockModel, mockContext, {})).rejects.toThrow(
        'API key not found for provider: anthropic'
      );
    });

    it('should throw ApiKeyNotFoundError when keysAdapter returns undefined', async () => {
      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      await expect(
        stream(mockModel, mockContext, { keysAdapter: mockKeysAdapter })
      ).rejects.toThrow('API key not found for provider: anthropic');
    });

    it('should resolve claude-code credentials from providerOptions', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      await stream(mockClaudeCodeModel, mockContext, {
        providerOptions: {
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        } as any,
      });

      expect(core.stream).toHaveBeenCalledWith(
        mockClaudeCodeModel,
        mockContext,
        expect.objectContaining({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        expect.any(String)
      );
    });

    it('should resolve missing claude-code credentials from keysAdapter.getCredentials', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        set: vi.fn(),
        setCredentials: vi.fn(),
        delete: vi.fn(),
        deleteCredentials: vi.fn(),
        list: vi.fn(),
      };

      await stream(mockClaudeCodeModel, mockContext, {
        keysAdapter: mockKeysAdapter,
      });

      expect(mockKeysAdapter.getCredentials).toHaveBeenCalledWith('claude-code');
      expect(core.stream).toHaveBeenCalledWith(
        mockClaudeCodeModel,
        mockContext,
        expect.objectContaining({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        expect.any(String)
      );
    });
  });

  describe('usage tracking', () => {
    it('should track usage when result() is called and usageAdapter is provided', async () => {
      const originalResultFn = vi.fn().mockResolvedValue(mockResponse);
      const mockEventStream = {
        [Symbol.asyncIterator]: async function* () {
          yield mockResponse;
        },
        result: originalResultFn,
      } as unknown as AssistantMessageEventStream<'anthropic'>;

      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const mockUsageAdapter: UsageAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn(),
        getMessage: vi.fn(),
        getMessages: vi.fn(),
        deleteMessage: vi.fn(),
      };

      const eventStream = await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
        usageAdapter: mockUsageAdapter,
      });

      // Usage should not be tracked yet
      expect(mockUsageAdapter.track).not.toHaveBeenCalled();

      // Call result() to get the final message
      const result = await eventStream.result();

      // Now usage should be tracked
      expect(mockUsageAdapter.track).toHaveBeenCalledWith(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should not track usage when usageAdapter is not provided', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const eventStream = await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      const result = await eventStream.result();
      expect(result).toEqual(mockResponse);
    });
  });

  describe('request ID', () => {
    it('should generate request ID when not provided', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.any(Object),
        expect.stringMatching(/^sdk-\d+-[a-z0-9]+$/)
      );
    });

    it('should use provided request ID', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      await stream(
        mockModel,
        mockContext,
        { providerOptions: { apiKey: 'test-key' } },
        'custom-request-id'
      );

      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.any(Object),
        'custom-request-id'
      );
    });
  });

  describe('provider options passthrough', () => {
    it('should pass through additional provider options', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      await stream(mockModel, mockContext, {
        providerOptions: {
          apiKey: 'test-key',
          temperature: 0.7,
          maxTokens: 1000,
        } as core.AnthropicProviderOptions,
      });

      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({
          apiKey: 'test-key',
          temperature: 0.7,
          maxTokens: 1000,
        }),
        expect.any(String)
      );
    });
  });

  describe('return value', () => {
    it('should return the event stream from core.stream', async () => {
      const mockEventStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const result = await stream(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      // The result should be an async iterable
      expect(result[Symbol.asyncIterator]).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });
});
