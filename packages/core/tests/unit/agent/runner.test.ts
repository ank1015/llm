import { Type } from '@sinclair/typebox';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runAgentLoop } from '../../../src/agent/runner.js';
import { getModel } from '../../../src/models.js';

import type {
  AgentRunnerCallbacks,
  AgentRunnerConfig,
  AgentEventEmitter,
} from '../../../src/agent/types.js';
import type {
  AgentEvent,
  AgentTool,
  BaseAssistantMessage,
  Message,
  UserMessage,
} from '@ank1015/llm-types';

// Helper to create a mock assistant message
function createMockAssistantMessage(
  content: BaseAssistantMessage<'anthropic'>['content'] = [],
  options: Partial<BaseAssistantMessage<'anthropic'>> = {}
): BaseAssistantMessage<'anthropic'> {
  return {
    role: 'assistant',
    api: 'anthropic',
    id: `msg_${Date.now()}`,
    model: getModel('anthropic', 'claude-haiku-4-5')!,
    timestamp: Date.now(),
    duration: 100,
    stopReason: 'stop',
    content,
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
    },
    message: {} as BaseAssistantMessage<'anthropic'>['message'],
    ...options,
  };
}

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
function createMockCallbacks(): AgentRunnerCallbacks & {
  appendedMessages: Message[];
  pendingToolCalls: Set<string>;
} {
  const appendedMessages: Message[] = [];
  const pendingToolCalls = new Set<string>();

  return {
    appendedMessages,
    pendingToolCalls,
    appendMessage: vi.fn((m: Message) => appendedMessages.push(m)),
    appendMessages: vi.fn((ms: Message[]) => appendedMessages.push(...ms)),
    addPendingToolCall: vi.fn((id: string) => pendingToolCalls.add(id)),
    removePendingToolCall: vi.fn((id: string) => pendingToolCalls.delete(id)),
  };
}

// Helper to create a basic config
function createConfig(overrides: Partial<AgentRunnerConfig> = {}): AgentRunnerConfig {
  const model = getModel('anthropic', 'claude-haiku-4-5')!;

  return {
    tools: [],
    provider: {
      model,
      providerOptions: {},
    },
    complete: vi.fn(),
    stream: vi.fn(),
    getQueuedMessages: vi.fn(async () => []),
    ...overrides,
  };
}

describe('runAgentLoop', () => {
  let emittedEvents: AgentEvent[];
  let emit: AgentEventEmitter;
  let abortController: AbortController;

  beforeEach(() => {
    emittedEvents = [];
    emit = vi.fn((event: AgentEvent) => emittedEvents.push(event));
    abortController = new AbortController();
  });

  describe('basic flow', () => {
    it('should complete a simple request without tools', async () => {
      const assistantMessage = createMockAssistantMessage([
        { type: 'text', content: 'Hello! How can I help you?' },
      ]);

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(assistantMessage),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();
      const initialMessages: Message[] = [createUserMessage('Hi')];

      const result = await runAgentLoop(
        config,
        initialMessages,
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toBe(assistantMessage);
      expect(result.totalCost).toBe(0.003);
      expect(result.aborted).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should emit correct events for simple request', async () => {
      const assistantMessage = createMockAssistantMessage([{ type: 'text', content: 'Response' }]);

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(assistantMessage),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      const eventTypes = emittedEvents.map((e) => e.type);
      expect(eventTypes).toContain('message_start');
      expect(eventTypes).toContain('message_end');
      expect(eventTypes).toContain('turn_end');
      expect(eventTypes).toContain('agent_end');
    });

    it('should append message via callback', async () => {
      const assistantMessage = createMockAssistantMessage([{ type: 'text', content: 'Response' }]);

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(assistantMessage),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(callbacks.appendMessage).toHaveBeenCalledWith(assistantMessage);
      expect(callbacks.appendedMessages).toContain(assistantMessage);
    });
  });

  describe('tool execution', () => {
    it('should execute tool calls and continue loop', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'calculator',
          arguments: { a: 2, b: 3 },
          toolCallId: 'call_123',
        },
      ]);

      const finalMessage = createMockAssistantMessage([
        { type: 'text', content: 'The result is 5' },
      ]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? toolCallMessage : finalMessage;
      });

      const calculatorTool: AgentTool = {
        name: 'calculator',
        description: 'Adds two numbers',
        parameters: Type.Object({
          a: Type.Number(),
          b: Type.Number(),
        }),
        execute: vi.fn().mockResolvedValue({
          content: [{ type: 'text', content: '5' }],
          details: { result: 5 },
        }),
      };

      const config = createConfig({
        tools: [calculatorTool],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('What is 2 + 3?')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should have: tool call message, tool result message, final message
      expect(result.messages).toHaveLength(3);
      expect(calculatorTool.execute).toHaveBeenCalled();
      expect(completeFn).toHaveBeenCalledTimes(2);
    });

    it('should emit tool execution events', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'greet',
          arguments: { name: 'Alice' },
          toolCallId: 'call_456',
        },
      ]);

      const finalMessage = createMockAssistantMessage([{ type: 'text', content: 'Greeted Alice' }]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? toolCallMessage : finalMessage;
      });

      const greetTool: AgentTool = {
        name: 'greet',
        description: 'Greets someone',
        parameters: Type.Object({ name: Type.String() }),
        execute: vi.fn().mockResolvedValue({
          content: [{ type: 'text', content: 'Hello, Alice!' }],
          details: {},
        }),
      };

      const config = createConfig({
        tools: [greetTool],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Greet Alice')],
        emit,
        abortController.signal,
        callbacks
      );

      const eventTypes = emittedEvents.map((e) => e.type);
      expect(eventTypes).toContain('tool_execution_start');
      expect(eventTypes).toContain('tool_execution_end');
    });

    it('should handle tool not found', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'nonexistent',
          arguments: {},
          toolCallId: 'call_789',
        },
      ]);

      const finalMessage = createMockAssistantMessage([
        { type: 'text', content: 'Tool not found response' },
      ]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? toolCallMessage : finalMessage;
      });

      const config = createConfig({
        tools: [], // No tools registered
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Call nonexistent')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should still complete with tool result (error)
      expect(result.messages).toHaveLength(3);

      // Find the tool result message
      const toolResultMessage = result.messages.find((m) => m.role === 'toolResult');
      expect(toolResultMessage).toBeDefined();
      if (toolResultMessage && toolResultMessage.role === 'toolResult') {
        expect(toolResultMessage.isError).toBe(true);
      }
    });

    it('should handle tool execution error', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'failingTool',
          arguments: {},
          toolCallId: 'call_fail',
        },
      ]);

      const finalMessage = createMockAssistantMessage([{ type: 'text', content: 'Handled error' }]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? toolCallMessage : finalMessage;
      });

      const failingTool: AgentTool = {
        name: 'failingTool',
        description: 'Always fails',
        parameters: Type.Object({}),
        execute: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
      };

      const config = createConfig({
        tools: [failingTool],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Run failing tool')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should complete with error in tool result
      const toolResultMessage = result.messages.find((m) => m.role === 'toolResult');
      expect(toolResultMessage).toBeDefined();
      if (toolResultMessage && toolResultMessage.role === 'toolResult') {
        expect(toolResultMessage.isError).toBe(true);
        expect(toolResultMessage.error?.message).toBe('Tool execution failed');
      }
    });

    it('should track pending tool calls', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'slowTool',
          arguments: {},
          toolCallId: 'call_slow',
        },
      ]);

      const finalMessage = createMockAssistantMessage([{ type: 'text', content: 'Done' }]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? toolCallMessage : finalMessage;
      });

      const slowTool: AgentTool = {
        name: 'slowTool',
        description: 'A slow tool',
        parameters: Type.Object({}),
        execute: vi.fn().mockResolvedValue({
          content: [{ type: 'text', content: 'Complete' }],
          details: {},
        }),
      };

      const config = createConfig({
        tools: [slowTool],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Run slow tool')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(callbacks.addPendingToolCall).toHaveBeenCalledWith('call_slow');
      expect(callbacks.removePendingToolCall).toHaveBeenCalledWith('call_slow');
    });
  });

  describe('abort handling', () => {
    it('should return aborted result when signal is aborted before start', async () => {
      abortController.abort();

      const config = createConfig({
        complete: vi.fn(),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(true);
      expect(result.messages).toHaveLength(0);
    });

    it('should handle abort during tool execution', async () => {
      const toolCallMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'longRunning',
          arguments: {},
          toolCallId: 'call_long',
        },
      ]);

      const completeFn = vi.fn().mockResolvedValue(toolCallMessage);

      const longRunningTool: AgentTool = {
        name: 'longRunning',
        description: 'Takes a while',
        parameters: Type.Object({}),
        execute: vi.fn().mockImplementation(async () => {
          // Abort during execution
          abortController.abort();
          return {
            content: [{ type: 'text', content: 'Done' }],
            details: {},
          };
        }),
      };

      const config = createConfig({
        tools: [longRunningTool],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Run long task')],
        emit,
        abortController.signal,
        callbacks
      );

      // Loop should have stopped after tool execution due to abort
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should return aborted when stopReason is aborted', async () => {
      const abortedMessage = createMockAssistantMessage([{ type: 'text', content: 'Aborted' }], {
        stopReason: 'aborted',
      });

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(abortedMessage),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.aborted).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error when stopReason is error', async () => {
      const errorMessage = createMockAssistantMessage(
        [{ type: 'text', content: 'Error occurred' }],
        { stopReason: 'error', errorMessage: 'Something went wrong' }
      );

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(errorMessage),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.error).toBe('Something went wrong');
      expect(result.aborted).toBe(false);
    });

    it('should catch and return thrown errors', async () => {
      const config = createConfig({
        complete: vi.fn().mockRejectedValue(new Error('API Error')),
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.error).toBe('API Error');
    });
  });

  describe('budget limits', () => {
    it('should throw when cost limit exceeded with pending actions', async () => {
      const toolCallMessage = createMockAssistantMessage(
        [
          {
            type: 'toolCall',
            name: 'expensive',
            arguments: {},
            toolCallId: 'call_exp',
          },
        ],
        {
          usage: {
            input: 1000,
            output: 500,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 1500,
            cost: { input: 0.5, output: 0.5, cacheRead: 0, cacheWrite: 0, total: 1.0 },
          },
        }
      );

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(toolCallMessage),
        streamAssistantMessage: false,
        budget: {
          currentCost: 0.5,
          costLimit: 1.0,
        },
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.error).toContain('Cost limit exceeded');
    });

    it('should throw when context limit exceeded with pending actions', async () => {
      const toolCallMessage = createMockAssistantMessage(
        [
          {
            type: 'toolCall',
            name: 'big',
            arguments: {},
            toolCallId: 'call_big',
          },
        ],
        {
          usage: {
            input: 50000,
            output: 500,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 50500,
            cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
          },
        }
      );

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(toolCallMessage),
        streamAssistantMessage: false,
        budget: {
          currentCost: 0,
          contextLimit: 40000,
        },
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(result.error).toContain('Context limit exceeded');
    });

    it('should complete normally when at limit but no pending actions', async () => {
      const finalMessage = createMockAssistantMessage([{ type: 'text', content: 'Done' }], {
        usage: {
          input: 1000,
          output: 500,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1500,
          cost: { input: 0.5, output: 0.5, cacheRead: 0, cacheWrite: 0, total: 1.0 },
        },
      });

      const config = createConfig({
        complete: vi.fn().mockResolvedValue(finalMessage),
        streamAssistantMessage: false,
        budget: {
          currentCost: 0,
          costLimit: 1.0,
        },
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should complete without error since no pending tool calls
      expect(result.error).toBeUndefined();
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('queued messages', () => {
    it('should inject queued messages before next assistant response', async () => {
      const assistantMessage = createMockAssistantMessage([{ type: 'text', content: 'Response' }]);

      const queuedMessage: UserMessage = {
        role: 'user',
        id: 'queued_1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Injected message' }],
      };

      let getQueuedCalls = 0;
      const config = createConfig({
        complete: vi.fn().mockResolvedValue(assistantMessage),
        streamAssistantMessage: false,
        getQueuedMessages: vi.fn().mockImplementation(async () => {
          getQueuedCalls++;
          // Return queued message on first call only
          if (getQueuedCalls === 1) {
            return [{ original: queuedMessage, llm: queuedMessage }];
          }
          return [];
        }),
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Initial')],
        emit,
        abortController.signal,
        callbacks
      );

      // Should have queued message + assistant response
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].id).toBe('queued_1');
    });
  });

  describe('streaming mode', () => {
    it('should use stream function when streamAssistantMessage is true', async () => {
      const assistantMessage = createMockAssistantMessage([
        { type: 'text', content: 'Streamed response' },
      ]);

      // Create a mock async iterator for the stream
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'text', content: 'Stre' };
          yield { type: 'text', content: 'amed' };
        },
        result: vi.fn().mockResolvedValue(assistantMessage),
      };

      const config = createConfig({
        stream: vi.fn().mockReturnValue(mockStream),
        complete: vi.fn(),
        streamAssistantMessage: true,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(config.stream).toHaveBeenCalled();
      expect(config.complete).not.toHaveBeenCalled();
    });

    it('should emit message_update events during streaming', async () => {
      const assistantMessage = createMockAssistantMessage([
        { type: 'text', content: 'Full response' },
      ]);

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { partial: 'First' };
          yield { partial: 'Second' };
        },
        result: vi.fn().mockResolvedValue(assistantMessage),
      };

      const config = createConfig({
        stream: vi.fn().mockReturnValue(mockStream),
        streamAssistantMessage: true,
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      const updateEvents = emittedEvents.filter((e) => e.type === 'message_update');
      expect(updateEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('system prompt', () => {
    it('should include system prompt in context when provided', async () => {
      const assistantMessage = createMockAssistantMessage([{ type: 'text', content: 'Response' }]);

      const completeFn = vi.fn().mockResolvedValue(assistantMessage);
      const config = createConfig({
        complete: completeFn,
        streamAssistantMessage: false,
        systemPrompt: 'You are a helpful assistant',
      });
      const callbacks = createMockCallbacks();

      await runAgentLoop(
        config,
        [createUserMessage('Test')],
        emit,
        abortController.signal,
        callbacks
      );

      // Check that complete was called with context containing systemPrompt
      expect(completeFn).toHaveBeenCalled();
      const callArgs = completeFn.mock.calls[0];
      const context = callArgs[1];
      expect(context.systemPrompt).toBe('You are a helpful assistant');
    });
  });

  describe('multiple tool calls in single response', () => {
    it('should execute multiple tool calls sequentially', async () => {
      const multiToolMessage = createMockAssistantMessage([
        {
          type: 'toolCall',
          name: 'tool1',
          arguments: { input: 'a' },
          toolCallId: 'call_1',
        },
        {
          type: 'toolCall',
          name: 'tool2',
          arguments: { input: 'b' },
          toolCallId: 'call_2',
        },
      ]);

      const finalMessage = createMockAssistantMessage([
        { type: 'text', content: 'Both tools executed' },
      ]);

      let callCount = 0;
      const completeFn = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? multiToolMessage : finalMessage;
      });

      const executionOrder: string[] = [];
      const tool1: AgentTool = {
        name: 'tool1',
        description: 'Tool 1',
        parameters: Type.Object({ input: Type.String() }),
        execute: vi.fn().mockImplementation(async () => {
          executionOrder.push('tool1');
          return { content: [{ type: 'text', content: 'Result 1' }], details: {} };
        }),
      };

      const tool2: AgentTool = {
        name: 'tool2',
        description: 'Tool 2',
        parameters: Type.Object({ input: Type.String() }),
        execute: vi.fn().mockImplementation(async () => {
          executionOrder.push('tool2');
          return { content: [{ type: 'text', content: 'Result 2' }], details: {} };
        }),
      };

      const config = createConfig({
        tools: [tool1, tool2],
        complete: completeFn,
        streamAssistantMessage: false,
      });
      const callbacks = createMockCallbacks();

      const result = await runAgentLoop(
        config,
        [createUserMessage('Run both tools')],
        emit,
        abortController.signal,
        callbacks
      );

      expect(tool1.execute).toHaveBeenCalled();
      expect(tool2.execute).toHaveBeenCalled();
      expect(executionOrder).toEqual(['tool1', 'tool2']);

      // Should have: multi-tool message, 2 tool results, final message
      expect(result.messages).toHaveLength(4);
    });
  });
});
