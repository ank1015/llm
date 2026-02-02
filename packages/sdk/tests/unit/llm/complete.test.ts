/**
 * Unit tests for SDK complete function
 */

import * as core from '@ank1015/llm-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { complete } from '../../../src/llm/complete.js';

import type { KeysAdapter, UsageAdapter } from '../../../src/adapters/types.js';
import type { Model, Context, BaseAssistantMessage } from '@ank1015/llm-types';

// Mock the core complete function
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    complete: vi.fn(),
  };
});

describe('complete', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API key resolution', () => {
    it('should use apiKey from providerOptions when provided', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'direct-key' },
      });

      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'direct-key' }),
        expect.any(String)
      );
    });

    it('should use keysAdapter when apiKey not in providerOptions', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue('adapter-key'),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      await complete(mockModel, mockContext, {
        keysAdapter: mockKeysAdapter,
      });

      expect(mockKeysAdapter.get).toHaveBeenCalledWith('anthropic');
      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'adapter-key' }),
        expect.any(String)
      );
    });

    it('should prefer providerOptions.apiKey over keysAdapter', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockResolvedValue('adapter-key'),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'direct-key' },
        keysAdapter: mockKeysAdapter,
      });

      expect(mockKeysAdapter.get).not.toHaveBeenCalled();
      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.objectContaining({ apiKey: 'direct-key' }),
        expect.any(String)
      );
    });

    it('should throw ApiKeyNotFoundError when no key available', async () => {
      await expect(complete(mockModel, mockContext, {})).rejects.toThrow(
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
        complete(mockModel, mockContext, { keysAdapter: mockKeysAdapter })
      ).rejects.toThrow('API key not found for provider: anthropic');
    });
  });

  describe('usage tracking', () => {
    it('should track usage when usageAdapter is provided', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const mockUsageAdapter: UsageAdapter = {
        track: vi.fn().mockResolvedValue(undefined),
        getStats: vi.fn(),
        getMessage: vi.fn(),
        getMessages: vi.fn(),
        deleteMessage: vi.fn(),
      };

      await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
        usageAdapter: mockUsageAdapter,
      });

      expect(mockUsageAdapter.track).toHaveBeenCalledWith(mockResponse);
    });

    it('should not track usage when usageAdapter is not provided', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const result = await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      expect(result).toEqual(mockResponse);
    });

    it('should return response even if tracking fails', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const mockUsageAdapter: UsageAdapter = {
        track: vi.fn().mockRejectedValue(new Error('Tracking failed')),
        getStats: vi.fn(),
        getMessage: vi.fn(),
        getMessages: vi.fn(),
        deleteMessage: vi.fn(),
      };

      await expect(
        complete(mockModel, mockContext, {
          providerOptions: { apiKey: 'test-key' },
          usageAdapter: mockUsageAdapter,
        })
      ).rejects.toThrow('Tracking failed');
    });
  });

  describe('request ID', () => {
    it('should generate request ID when not provided', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.any(Object),
        expect.stringMatching(/^sdk-\d+-[a-z0-9]+$/)
      );
    });

    it('should use provided request ID', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      await complete(
        mockModel,
        mockContext,
        { providerOptions: { apiKey: 'test-key' } },
        'custom-request-id'
      );

      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        expect.any(Object),
        'custom-request-id'
      );
    });
  });

  describe('provider options passthrough', () => {
    it('should pass through additional provider options', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      await complete(mockModel, mockContext, {
        providerOptions: {
          apiKey: 'test-key',
          temperature: 0.7,
          maxTokens: 1000,
        } as core.AnthropicProviderOptions,
      });

      expect(core.complete).toHaveBeenCalledWith(
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
    it('should return the response from core.complete', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const result = await complete(mockModel, mockContext, {
        providerOptions: { apiKey: 'test-key' },
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
