/**
 * Unit tests for Conversation execution with adapter pattern
 */

import * as core from '@ank1015/llm-core';
import { AssistantMessageEventStream } from '@ank1015/llm-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Conversation } from '../../../src/agent/conversation.js';

import type { KeysAdapter, UsageAdapter } from '../../../src/adapters/types.js';
import type { Model, BaseAssistantMessage, AgentEvent } from '@ank1015/llm-types';

// Mock the core module
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    runAgentLoop: vi.fn(),
    complete: vi.fn(),
    stream: vi.fn(),
  };
});

describe('Conversation Execution', () => {
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

  const mockAssistantMessage: BaseAssistantMessage<'anthropic'> = {
    role: 'assistant',
    message: {} as BaseAssistantMessage<'anthropic'>['message'],
    api: 'anthropic',
    id: 'resp-1',
    model: mockModel,
    timestamp: Date.now(),
    duration: 100,
    stopReason: 'stop',
    content: [{ type: 'response', content: [{ type: 'text', content: 'Hello!' }] }],
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0.00003, output: 0.000075, cacheRead: 0, cacheWrite: 0, total: 0.000105 },
    },
  };

  function createMockKeysAdapter(key: string | undefined = 'test-api-key'): KeysAdapter {
    return {
      get: vi.fn().mockResolvedValue(key),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };
  }

  function createMockUsageAdapter(): UsageAdapter {
    return {
      track: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn(),
      getMessage: vi.fn(),
      getMessages: vi.fn(),
      deleteMessage: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();

    // Default mock for runAgentLoop - resolves immediately
    vi.mocked(core.runAgentLoop).mockResolvedValue({
      messages: [mockAssistantMessage],
      totalCost: 0.000105,
      aborted: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API key resolution', () => {
    it('should use keysAdapter to resolve API key', async () => {
      const mockKeysAdapter = createMockKeysAdapter('adapter-key');
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(mockKeysAdapter.get).toHaveBeenCalledWith('anthropic');
    });

    it('should prefer providerOptions.apiKey over keysAdapter', async () => {
      const mockKeysAdapter = createMockKeysAdapter('adapter-key');
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({
        model: mockModel,
        providerOptions: { apiKey: 'direct-key' },
      });

      await conversation.prompt('Hello');

      expect(mockKeysAdapter.get).not.toHaveBeenCalled();
    });

    it('should throw ApiKeyNotFoundError when no key available', async () => {
      const conversation = new Conversation();
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await expect(conversation.prompt('Hello')).rejects.toThrow(
        'API key not found for provider: anthropic'
      );
    });

    it('should throw ApiKeyNotFoundError when keysAdapter returns undefined', async () => {
      // Create a fresh adapter that explicitly returns undefined
      const mockKeysAdapter: KeysAdapter = {
        get: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await expect(conversation.prompt('Hello')).rejects.toThrow(
        'API key not found for provider: anthropic'
      );

      // Verify the adapter was called
      expect(mockKeysAdapter.get).toHaveBeenCalledWith('anthropic');
    });
  });

  describe('setKeysAdapter()', () => {
    it('should allow setting keysAdapter after construction', async () => {
      const conversation = new Conversation();
      const mockKeysAdapter = createMockKeysAdapter('late-key');

      conversation.setKeysAdapter(mockKeysAdapter);
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(mockKeysAdapter.get).toHaveBeenCalledWith('anthropic');
    });
  });

  describe('setUsageAdapter()', () => {
    it('should allow setting usageAdapter after construction', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const mockUsageAdapter = createMockUsageAdapter();

      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setUsageAdapter(mockUsageAdapter);
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      // The usage adapter is passed to the bound complete/stream functions
      // which are called by runAgentLoop
      expect(core.runAgentLoop).toHaveBeenCalled();
    });
  });

  describe('prompt()', () => {
    it('should call runAgentLoop with correct configuration', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });
      conversation.setSystemPrompt('You are a helpful assistant.');

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            model: mockModel,
          }),
          tools: [],
          streamAssistantMessage: true,
        }),
        expect.any(Array), // messages
        expect.any(Function), // emit
        expect.any(Object), // signal
        expect.any(Object) // callbacks
      );
    });

    it('should prevent concurrent prompts', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      // Make runAgentLoop hang until we resolve it
      let resolveLoop!: () => void;
      vi.mocked(core.runAgentLoop).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLoop = () =>
              resolve({ messages: [mockAssistantMessage], totalCost: 0, aborted: false });
          })
      );

      // Start the first prompt (it will hang)
      const firstPrompt = conversation.prompt('First');

      // Wait a tick to ensure the first prompt has started
      await new Promise((r) => setImmediate(r));

      // Second prompt should fail immediately
      await expect(conversation.prompt('Second')).rejects.toThrow(
        'Cannot start a new prompt while another is running'
      );

      // Cleanup
      resolveLoop();
      await firstPrompt;
    });

    it('should emit events during execution', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      // Mock runAgentLoop to emit lifecycle events like the real runner does
      vi.mocked(core.runAgentLoop).mockImplementation(async (_cfg, _msgs, emit) => {
        emit({ type: 'agent_start' });
        emit({ type: 'turn_start' });
        emit({ type: 'turn_end' });
        emit({ type: 'agent_end', totalCost: 0.000105 });
        return { messages: [mockAssistantMessage], totalCost: 0.000105, aborted: false };
      });

      const events: AgentEvent[] = [];
      conversation.subscribe((e) => events.push(e));

      await conversation.prompt('Hello');

      // Should have agent_start, turn_start, and message events
      expect(events.some((e) => e.type === 'agent_start')).toBe(true);
      expect(events.some((e) => e.type === 'turn_start')).toBe(true);
      expect(events.some((e) => e.type === 'message_start')).toBe(true);
      expect(events.some((e) => e.type === 'message_end')).toBe(true);

      // Each lifecycle event should appear exactly once (no duplicates)
      expect(events.filter((e) => e.type === 'agent_start')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'turn_start')).toHaveLength(1);
    });

    it('should call external callback for messages appended during the run', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      vi.mocked(core.runAgentLoop).mockImplementation(
        async (_cfg, _msgs, _emit, _signal, callbacks) => {
          callbacks.appendMessage(mockAssistantMessage);
          return {
            messages: [mockAssistantMessage],
            totalCost: mockAssistantMessage.usage.cost.total,
            aborted: false,
          };
        }
      );

      const callback = vi.fn(async () => undefined);
      await conversation.prompt('Hello', undefined, callback);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[0]?.[0].role).toBe('user');
      expect(callback.mock.calls[1]?.[0].role).toBe('assistant');
    });

    it('should surface external callback errors', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await expect(
        conversation.prompt('Hello', undefined, async () => {
          throw new Error('persist failed');
        })
      ).rejects.toThrow('persist failed');
    });

    it('should update state.isStreaming during execution', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      let streamingDuringExecution = false;
      let resolveLoop: () => void;

      vi.mocked(core.runAgentLoop).mockImplementation(() => {
        streamingDuringExecution = conversation.state.isStreaming;
        return new Promise((resolve) => {
          resolveLoop = () =>
            resolve({ messages: [mockAssistantMessage], totalCost: 0, aborted: false });
        });
      });

      const promptPromise = conversation.prompt('Hello');

      // Wait a tick for the promise to start
      await new Promise((r) => setTimeout(r, 0));

      resolveLoop!();
      await promptPromise;

      expect(streamingDuringExecution).toBe(true);
      expect(conversation.state.isStreaming).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      vi.mocked(core.runAgentLoop).mockRejectedValue(new Error('LLM error'));

      await expect(conversation.prompt('Hello')).rejects.toThrow('LLM error');
      expect(conversation.state.error).toBe('LLM error');
      expect(conversation.state.isStreaming).toBe(false);
    });
  });

  describe('continue()', () => {
    it('should continue from existing messages', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      // Add a user message first
      conversation.appendMessage({
        role: 'user',
        id: 'user-1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Hello' }],
      });

      await conversation.continue();

      expect(core.runAgentLoop).toHaveBeenCalled();
    });

    it('should throw if no messages exist', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await expect(conversation.continue()).rejects.toThrow('No messages to continue from');
    });

    it('should prevent concurrent continues', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      conversation.appendMessage({
        role: 'user',
        id: 'user-1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Hello' }],
      });

      // Make runAgentLoop hang until we resolve it
      let resolveLoop!: () => void;
      vi.mocked(core.runAgentLoop).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLoop = () =>
              resolve({ messages: [mockAssistantMessage], totalCost: 0, aborted: false });
          })
      );

      // Start the first continue (it will hang)
      const firstContinue = conversation.continue();

      // Wait a tick to ensure the first continue has started
      await new Promise((r) => setImmediate(r));

      // Second continue should fail immediately
      await expect(conversation.continue()).rejects.toThrow(
        'Cannot continue while another prompt is running'
      );

      // Cleanup
      resolveLoop();
      await firstContinue;
    });
  });

  describe('abort()', () => {
    it('should signal abort to the running prompt', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      let capturedSignal: AbortSignal | undefined;

      vi.mocked(core.runAgentLoop).mockImplementation(async (_cfg, _msgs, _emit, signal) => {
        capturedSignal = signal;
        // Wait for abort
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { messages: [], totalCost: 0, aborted: signal.aborted };
      });

      const promptPromise = conversation.prompt('Hello');

      // Wait a tick then abort
      await new Promise((r) => setTimeout(r, 10));
      conversation.abort();

      await promptPromise;

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('waitForIdle()', () => {
    it('should resolve immediately when not running', async () => {
      const conversation = new Conversation();

      await expect(conversation.waitForIdle()).resolves.toBeUndefined();
    });

    it('should wait for running prompt to complete', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      // Make runAgentLoop hang until we resolve it
      let resolveLoop!: () => void;
      vi.mocked(core.runAgentLoop).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLoop = () =>
              resolve({ messages: [mockAssistantMessage], totalCost: 0, aborted: false });
          })
      );

      // Start the prompt (it will hang)
      const promptPromise = conversation.prompt('Hello');

      // Wait a tick to ensure the prompt has started
      await new Promise((r) => setImmediate(r));

      // Now set up the wait
      let waitResolved = false;
      const waitPromise = conversation.waitForIdle().then(() => {
        waitResolved = true;
      });

      // Wait should not resolve yet (prompt is still running)
      await new Promise((r) => setImmediate(r));
      expect(waitResolved).toBe(false);

      // Resolve the loop
      resolveLoop();
      await promptPromise;
      await waitPromise;

      expect(waitResolved).toBe(true);
    });
  });

  describe('budget limits', () => {
    it('should pass budget configuration to runAgentLoop', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({
        keysAdapter: mockKeysAdapter,
        costLimit: 1.0,
        contextLimit: 50000,
      });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          budget: expect.objectContaining({
            costLimit: 1.0,
            contextLimit: 50000,
            currentCost: 0,
          }),
        }),
        expect.any(Array),
        expect.any(Function),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use setCostLimit() to update limit', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      conversation.setCostLimit(0.5);

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          budget: expect.objectContaining({
            costLimit: 0.5,
          }),
        }),
        expect.any(Array),
        expect.any(Function),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('streamAssistantMessage', () => {
    it('should default to streaming enabled', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          streamAssistantMessage: true,
        }),
        expect.any(Array),
        expect.any(Function),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should allow disabling streaming', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({
        keysAdapter: mockKeysAdapter,
        streamAssistantMessage: false,
      });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          streamAssistantMessage: false,
        }),
        expect.any(Array),
        expect.any(Function),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use setStreamAssistantMessage() to update', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      conversation.setStreamAssistantMessage(false);

      await conversation.prompt('Hello');

      expect(core.runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          streamAssistantMessage: false,
        }),
        expect.any(Array),
        expect.any(Function),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('reset()', () => {
    it('should clear messages and state', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({ keysAdapter: mockKeysAdapter });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      await conversation.prompt('Hello');

      expect(conversation.state.messages.length).toBeGreaterThan(0);

      conversation.reset();

      expect(conversation.state.messages).toEqual([]);
      expect(conversation.state.isStreaming).toBe(false);
      expect(conversation.state.error).toBeUndefined();
    });
  });

  describe('streaming usage tracking', () => {
    it('should call usageAdapter.track() when streaming completes', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const mockUsageAdapter = createMockUsageAdapter();
      const conversation = new Conversation({
        keysAdapter: mockKeysAdapter,
        usageAdapter: mockUsageAdapter,
        streamAssistantMessage: true,
      });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      // Create a fake event stream that coreStream will return
      const fakeEventStream = new AssistantMessageEventStream<'anthropic'>();

      // Make coreStream return our fake event stream
      vi.mocked(core.stream).mockReturnValue(fakeEventStream);

      // Mock runAgentLoop to exercise the boundStream function
      vi.mocked(core.runAgentLoop).mockImplementation(async (cfg) => {
        // Call the stream function that Conversation created (boundStream)
        const stream = cfg.stream(mockModel, { messages: [], systemPrompt: '' }, {}, 'test-id');

        // Simulate what the runner does: end the stream then call result()
        fakeEventStream.end(mockAssistantMessage);
        const result = await stream.result();

        return {
          messages: [result],
          totalCost: result.usage.cost.total,
          aborted: false,
        };
      });

      await conversation.prompt('Hello');

      // Verify usageAdapter.track() was called with the assistant message
      expect(mockUsageAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockUsageAdapter.track).toHaveBeenCalledWith(mockAssistantMessage);
    });

    it('should not call usageAdapter.track() when no usageAdapter is configured', async () => {
      const mockKeysAdapter = createMockKeysAdapter();
      const conversation = new Conversation({
        keysAdapter: mockKeysAdapter,
        streamAssistantMessage: true,
      });
      conversation.setProvider({ model: mockModel, providerOptions: {} });

      const fakeEventStream = new AssistantMessageEventStream<'anthropic'>();
      vi.mocked(core.stream).mockReturnValue(fakeEventStream);

      vi.mocked(core.runAgentLoop).mockImplementation(async (cfg) => {
        const stream = cfg.stream(mockModel, { messages: [], systemPrompt: '' }, {}, 'test-id');

        fakeEventStream.end(mockAssistantMessage);
        const result = await stream.result();

        return {
          messages: [result],
          totalCost: result.usage.cost.total,
          aborted: false,
        };
      });

      // Should not throw - just works without tracking
      await conversation.prompt('Hello');
    });
  });
});
