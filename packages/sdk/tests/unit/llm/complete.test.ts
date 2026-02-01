/**
 * Unit tests for SDK complete function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { complete } from '../../../src/llm/complete.js';
import { setServerUrl } from '../../../src/config.js';
import * as core from '@ank1015/llm-core';
import type { Model, Context, BaseAssistantMessage } from '@ank1015/llm-types';

// Mock the core complete function
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    complete: vi.fn(),
  };
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('complete', () => {
  const mockModel: Model<'anthropic'> = {
    api: 'anthropic',
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutput: 8192,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    capabilities: { vision: true, streaming: true, tools: true, thinking: false },
  };

  const mockContext: Context = {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', text: 'Hello' }],
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
    content: [{ type: 'response', content: [{ type: 'text', text: 'Hi there!' }] }],
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
    setServerUrl('http://localhost:3001');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with apiKey provided', () => {
    it('should call core complete directly', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      const result = await complete(mockModel, mockContext, { apiKey: 'test-key' });

      expect(core.complete).toHaveBeenCalledTimes(1);
      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        { apiKey: 'test-key' },
        expect.stringMatching(/^sdk-\d+-[a-z0-9]+$/)
      );
      expect(result).toEqual(mockResponse);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use provided id when given', async () => {
      vi.mocked(core.complete).mockResolvedValue(mockResponse);

      await complete(mockModel, mockContext, { apiKey: 'test-key' }, 'custom-id');

      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        { apiKey: 'test-key' },
        'custom-id'
      );
    });
  });

  describe('without apiKey (server routing)', () => {
    it('should call server endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await complete(mockModel, mockContext);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/messages/complete',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(core.complete).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should include systemPrompt and tools in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const contextWithExtras: Context = {
        ...mockContext,
        systemPrompt: 'You are helpful',
        tools: [{ name: 'test', description: 'test tool', parameters: { type: 'object' } }],
      };

      await complete(mockModel, contextWithExtras);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.systemPrompt).toBe('You are helpful');
      expect(body.tools).toHaveLength(1);
    });

    it('should throw ProviderError on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      await expect(complete(mockModel, mockContext)).rejects.toThrow('Server error');
    });

    it('should use custom server URL', async () => {
      setServerUrl('http://custom-server:8080');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await complete(mockModel, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-server:8080/messages/complete',
        expect.any(Object)
      );
    });

    it('should pass signal for abort support', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await complete(mockModel, mockContext, { signal: controller.signal });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].signal).toBe(controller.signal);
    });
  });

  describe('edge cases', () => {
    it('should handle empty options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await complete(mockModel, mockContext, {});

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should handle undefined options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await complete(mockModel, mockContext);

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });
});
