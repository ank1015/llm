import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { runAgentLoop } from '../../../src/agent/runner.js';
import { getModel } from '../../../src/models.js';
import { completeAnthropic } from '../../../src/providers/anthropic/complete.js';
import { streamAnthropic } from '../../../src/providers/anthropic/stream.js';

import type {
  AgentRunnerCallbacks,
  AgentRunnerConfig,
  AgentEventEmitter,
} from '../../../src/agent/types.js';
import type {
  AgentEvent,
  AgentTool,
  AnthropicProviderOptions,
  Message,
  Model,
  UserMessage,
} from '@ank1015/llm-types';

describe('Agent Runner Integration', () => {
  let model: Model<'anthropic'>;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for integration tests');
    }

    const testModel = getModel('anthropic', 'claude-haiku-4-5');
    if (!testModel) {
      throw new Error('Test model claude-haiku-4-5 not found');
    }
    model = testModel;
  });

  // Helper to create a user message
  function createUserMessage(text: string): UserMessage {
    return {
      role: 'user',
      id: `user_${Date.now()}`,
      timestamp: Date.now(),
      content: [{ type: 'text', content: text }],
    };
  }

  // Helper to create mock callbacks
  function createCallbacks(): AgentRunnerCallbacks & { messages: Message[] } {
    const messages: Message[] = [];
    return {
      messages,
      appendMessage: vi.fn((m: Message) => messages.push(m)),
      appendMessages: vi.fn((ms: Message[]) => messages.push(...ms)),
      addPendingToolCall: vi.fn(),
      removePendingToolCall: vi.fn(),
    };
  }

  // Helper to create config
  function createConfig(overrides: Partial<AgentRunnerConfig> = {}): AgentRunnerConfig {
    return {
      tools: [],
      provider: {
        model,
        providerOptions: { apiKey, max_tokens: 500 },
      },
      complete: (m, ctx, opts, id) =>
        completeAnthropic(
          m as Model<'anthropic'>,
          ctx,
          { ...opts, apiKey } as AnthropicProviderOptions,
          id
        ) as any,
      stream: (m, ctx, opts, id) =>
        streamAnthropic(
          m as Model<'anthropic'>,
          ctx,
          { ...opts, apiKey } as AnthropicProviderOptions,
          id
        ) as any,
      getQueuedMessages: async () => [],
      streamAssistantMessage: false,
      ...overrides,
    };
  }

  describe('basic completion flow', () => {
    it('should complete a simple request and return assistant message', async () => {
      const config = createConfig();
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Say "hello" and nothing else.')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('assistant');
      expect(result.totalCost).toBeGreaterThan(0);

      // Check events
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('message_start');
      expect(eventTypes).toContain('message_end');
      expect(eventTypes).toContain('turn_end');
      expect(eventTypes).toContain('agent_end');
    }, 60000);

    it('should track usage correctly', async () => {
      const config = createConfig();
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Count from 1 to 5.')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.totalCost).toBeGreaterThan(0);

      // Check the assistant message has usage
      const assistantMessage = result.messages[0];
      if (assistantMessage.role === 'assistant') {
        expect(assistantMessage.usage.input).toBeGreaterThan(0);
        expect(assistantMessage.usage.output).toBeGreaterThan(0);
        expect(assistantMessage.usage.cost.total).toBeGreaterThan(0);
      }
    }, 60000);

    it('should handle system prompt', async () => {
      const config = createConfig({
        systemPrompt: 'You are a pirate. Always respond in pirate speak.',
      });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Say hello.')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(false);
      expect(result.messages).toHaveLength(1);
      // Response should be in pirate speak (contains "ahoy", "matey", "arr", etc.)
      const assistantMessage = result.messages[0];
      if (assistantMessage.role === 'assistant') {
        const textContent = assistantMessage.content.find((c) => c.type === 'response');
        expect(textContent).toBeDefined();
      }
    }, 60000);
  });

  describe('streaming flow', () => {
    it('should work with streaming enabled', async () => {
      const config = createConfig({ streamAssistantMessage: true });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Say "streaming works"')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(false);
      expect(result.messages).toHaveLength(1);

      // Should have message_update events from streaming
      const updateEvents = events.filter((e) => e.type === 'message_update');
      expect(updateEvents.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('tool execution flow', () => {
    it('should execute tool and continue conversation', async () => {
      const calculatorTool: AgentTool = {
        name: 'calculator',
        description: 'Perform basic arithmetic. Use this for any math calculations.',
        parameters: Type.Object({
          expression: Type.String({ description: 'The math expression to evaluate' }),
        }),
        execute: vi.fn().mockResolvedValue({
          content: [{ type: 'text', content: '8' }],
          details: { result: 8 },
        }),
        label: '',
      };

      const config = createConfig({ tools: [calculatorTool] });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('What is 5 + 3? Use the calculator tool.')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(false);
      expect(result.error).toBeUndefined();

      // Should have: tool call message, tool result, final response
      expect(result.messages.length).toBeGreaterThanOrEqual(2);

      // Tool should have been executed
      expect(calculatorTool.execute).toHaveBeenCalled();

      // Check for tool execution events
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('tool_execution_start');
      expect(eventTypes).toContain('tool_execution_end');

      // Should have a tool result message
      const toolResultMessage = result.messages.find((m) => m.role === 'toolResult');
      expect(toolResultMessage).toBeDefined();
    }, 90000);

    it('should handle tool execution errors gracefully', async () => {
      const failingTool: AgentTool = {
        name: 'failing_tool',
        description: 'A tool that always fails. Use this tool.',
        parameters: Type.Object({}),
        execute: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
        label: '',
      };

      const config = createConfig({ tools: [failingTool] });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Please use the failing_tool.')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should complete without crashing
      expect(result.aborted).toBe(false);

      // Tool should have been called
      expect(failingTool.execute).toHaveBeenCalled();

      // Should have tool result with error
      const toolResultMessage = result.messages.find((m) => m.role === 'toolResult');
      if (toolResultMessage && toolResultMessage.role === 'toolResult') {
        expect(toolResultMessage.isError).toBe(true);
      }
    }, 90000);

    it('should pass context to tool execute function', async () => {
      let receivedContext: any;

      const contextTool: AgentTool = {
        name: 'context_checker',
        description: 'A tool that checks its context. Always use this tool.',
        parameters: Type.Object({}),
        execute: vi.fn().mockImplementation(async (_id, _args, _signal, _onUpdate, context) => {
          receivedContext = context;
          return {
            content: [{ type: 'text', content: 'Context received' }],
            details: {},
          };
        }),
        label: '',
      };

      const config = createConfig({ tools: [contextTool] });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      await runAgentLoop(
        config,
        [createUserMessage('Use the context_checker tool.')],
        emit,
        abortController.signal,
        callbacks
      );

      // Context should have been passed to tool
      expect(receivedContext).toBeDefined();
      expect(receivedContext.messages).toBeDefined();
      expect(Array.isArray(receivedContext.messages)).toBe(true);
    }, 90000);
  });

  describe('abort handling', () => {
    it('should abort when signal is triggered', async () => {
      const config = createConfig();
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      // Abort immediately
      abortController.abort();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Tell me a long story.')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(true);
    }, 30000);
  });

  describe('budget limits', () => {
    it('should respect cost limit', async () => {
      // Set a very low cost limit that will be exceeded
      const config = createConfig({
        budget: {
          currentCost: 0,
          costLimit: 0.0000001, // Extremely low limit
        },
        tools: [
          {
            name: 'dummy_tool',
            description: 'A dummy tool. Use this.',
            parameters: Type.Object({}),
            execute: async () => ({
              content: [{ type: 'text', content: 'Done' }],
              details: {},
            }),
            label: '',
          },
        ],
      });
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Use the dummy_tool.')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should have hit the cost limit
      expect(result.error).toContain('Cost limit exceeded');
    }, 60000);
  });

  describe('multi-turn conversation', () => {
    it('should maintain context across turns', async () => {
      const config = createConfig();
      const callbacks = createCallbacks();
      const events: AgentEvent[] = [];
      const emit: AgentEventEmitter = (e) => events.push(e);
      const abortController = new AbortController();

      // First turn - tell it a name
      const initialMessages: Message[] = [
        createUserMessage('My name is TestUser123. Remember this name.'),
      ];

      const firstResult = await runAgentLoop(
        config,
        initialMessages,
        emit,
        abortController.signal,
        callbacks
      );

      expect(firstResult.aborted).toBe(false);

      // Build context for second turn
      const secondTurnMessages: Message[] = [
        ...initialMessages,
        firstResult.messages[0],
        createUserMessage('What is my name?'),
      ];

      const secondResult = await runAgentLoop(
        config,
        secondTurnMessages,
        emit,
        abortController.signal,
        createCallbacks()
      );

      expect(secondResult.aborted).toBe(false);

      // The response should contain the name
      const assistantMessage = secondResult.messages[0];
      if (assistantMessage.role === 'assistant') {
        const textResponse = assistantMessage.content.find((c) => c.type === 'response');
        if (textResponse && textResponse.type === 'response') {
          const textContent = textResponse.content.find((c) => c.type === 'text');
          if (textContent) {
            expect(textContent.content.toLowerCase()).toContain('testuser123');
          }
        }
      }
    }, 90000);
  });
});
