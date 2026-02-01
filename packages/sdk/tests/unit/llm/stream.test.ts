/**
 * Unit tests for SDK stream function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stream } from '../../../src/llm/stream.js';
import { setServerUrl } from '../../../src/config.js';
import * as core from '@ank1015/llm-core';
import type { Model, Context, BaseAssistantMessage, BaseAssistantEvent } from '@ank1015/llm-types';

// Mock the core stream function
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    stream: vi.fn(),
  };
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('stream', () => {
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

  const mockFinalMessage: BaseAssistantMessage<'anthropic'> = {
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
    it('should call core stream directly', () => {
      const mockEventStream = new core.AssistantMessageEventStream<'anthropic'>();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      const result = stream(mockModel, mockContext, { apiKey: 'test-key' });

      expect(core.stream).toHaveBeenCalledTimes(1);
      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        { apiKey: 'test-key' },
        expect.stringMatching(/^sdk-\d+-[a-z0-9]+$/)
      );
      expect(result).toBe(mockEventStream);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use provided id when given', () => {
      const mockEventStream = new core.AssistantMessageEventStream<'anthropic'>();
      vi.mocked(core.stream).mockReturnValue(mockEventStream);

      stream(mockModel, mockContext, { apiKey: 'test-key' }, 'custom-id');

      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        mockContext,
        { apiKey: 'test-key' },
        'custom-id'
      );
    });
  });

  describe('without apiKey (server routing)', () => {
    function createMockSSEStream(events: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let index = 0;

      return new ReadableStream({
        pull(controller) {
          if (index < events.length) {
            controller.enqueue(encoder.encode(events[index] + '\n'));
            index++;
          } else {
            controller.close();
          }
        },
      });
    }

    it('should call server endpoint and parse SSE events', async () => {
      const sseEvents = [
        'event:text_start',
        `data:${JSON.stringify({ type: 'text_start', contentIndex: 0 })}`,
        'event:text_delta',
        `data:${JSON.stringify({ type: 'text_delta', contentIndex: 0, delta: 'Hi' })}`,
        'event:message',
        `data:${JSON.stringify(mockFinalMessage)}`,
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const eventStream = stream(mockModel, mockContext);

      const events: BaseAssistantEvent<'anthropic'>[] = [];
      for await (const event of eventStream) {
        events.push(event);
      }

      const finalMessage = await eventStream.result();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/messages/stream',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(core.stream).not.toHaveBeenCalled();
      expect(events.length).toBeGreaterThan(0);
      expect(finalMessage.api).toBe('anthropic');
    });

    it('should handle server error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      const eventStream = stream(mockModel, mockContext);

      // Consume the stream to trigger the error handling
      const events: BaseAssistantEvent<'anthropic'>[] = [];
      for await (const event of eventStream) {
        events.push(event);
      }

      const result = await eventStream.result();
      expect(result.stopReason).toBe('error');
    });

    it('should use custom server URL', async () => {
      setServerUrl('http://custom-server:8080');

      const sseEvents = ['event:message', `data:${JSON.stringify(mockFinalMessage)}`];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockSSEStream(sseEvents),
      });

      const eventStream = stream(mockModel, mockContext);

      // Consume the stream
      for await (const _ of eventStream) {
        // Just consume
      }
      await eventStream.result();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-server:8080/messages/stream',
        expect.any(Object)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty options', () => {
      const sseEvents = ['event:message', `data:${JSON.stringify(mockFinalMessage)}`];

      const encoder = new TextEncoder();
      let index = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (index < sseEvents.length) {
            controller.enqueue(encoder.encode(sseEvents[index] + '\n'));
            index++;
          } else {
            controller.close();
          }
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const eventStream = stream(mockModel, mockContext, {});

      expect(eventStream).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should return AssistantMessageEventStream', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const eventStream = stream(mockModel, mockContext);

      expect(eventStream).toBeInstanceOf(core.AssistantMessageEventStream);
    });
  });
});
