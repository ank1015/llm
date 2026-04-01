import { Type } from '@sinclair/typebox';
import { describe, expect, it, vi } from 'vitest';

import { createEventAdapter } from '../../../src/agent/adapter.js';
import { agentEngine } from '../../../src/agent/engine.js';
import { buildUserMessage } from '../../../src/agent/utils.js';
import { getModel } from '../../../src/models/index.js';

import type {
  AgentEngineConfig,
  AgentEvent,
  AgentRunState,
  AgentTool,
  AssistantToolCall,
  BaseAssistantMessage,
  Message,
} from '../../../src/types/index.js';

const model = getModel('anthropic', 'claude-haiku-4-5')!;

function createState(messages: Message[] = [buildUserMessage('Hello')]): AgentRunState {
  return {
    messages,
    totalCost: 0,
    totalTokens: 0,
    turns: 0,
  };
}

function createAssistantMessage(
  content: BaseAssistantMessage<'anthropic'>['content'],
  overrides: Partial<BaseAssistantMessage<'anthropic'>> = {}
): BaseAssistantMessage<'anthropic'> {
  return {
    role: 'assistant',
    api: 'anthropic',
    id: `msg_${Math.random().toString(36).slice(2)}`,
    model,
    timestamp: Date.now(),
    duration: 10,
    stopReason: 'stop',
    content,
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0.1, output: 0.05, cacheRead: 0, cacheWrite: 0, total: 0.15 },
    },
    message: {} as BaseAssistantMessage<'anthropic'>['message'],
    ...overrides,
  };
}

function createToolCall(
  name: string,
  args: Record<string, unknown>,
  toolCallId = `call_${Math.random().toString(36).slice(2)}`
): AssistantToolCall {
  return {
    type: 'toolCall',
    name,
    arguments: args,
    toolCallId,
  };
}

function createConfig(
  overrides: Partial<AgentEngineConfig> = {}
): AgentEngineConfig {
  return {
    tools: [],
    provider: {
      model,
      providerOptions: {},
    },
    modelInvoker: vi.fn(async () =>
      createAssistantMessage([
        {
          type: 'response',
          response: [{ type: 'text', content: 'done' }],
        },
      ])
    ),
    ...overrides,
  };
}

describe('createEventAdapter', () => {
  it('emits assistant lifecycle and tool execution events with matching placeholder ids', async () => {
    const events: AgentEvent[] = [];
    const onStateChange = vi.fn();
    let pendingDuringUpdate = false;

    const tool = {
      name: 'calculator',
      description: 'Adds numbers',
      parameters: Type.Object({
        a: Type.Number(),
        b: Type.Number(),
      }),
      execute: vi.fn(async ({ params, onUpdate }) => {
        pendingDuringUpdate = adapter.getPendingToolCalls().has('call_calc');
        await onUpdate?.({
          content: [{ type: 'text', content: 'partial result' }],
          details: { partial: true },
        });
        return {
          content: [{ type: 'text', content: String(params.a + params.b) }],
          details: { sum: params.a + params.b },
        };
      }),
    } satisfies AgentTool;

    const modelInvoker = vi
      .fn()
      .mockImplementationOnce(async ({ onUpdate, messageId }) => {
        const message = createAssistantMessage([createToolCall('calculator', { a: 1, b: 2 }, 'call_calc')], {
          id: messageId ?? 'assistant-call',
        });
        await onUpdate?.({ type: 'start', message });
        await onUpdate?.({ type: 'toolcall_start', contentIndex: 0, message });
        return message;
      })
      .mockImplementationOnce(async ({ onUpdate, messageId }) => {
        const message = createAssistantMessage(
          [
            {
              type: 'response',
              response: [{ type: 'text', content: 'final answer' }],
            },
          ],
          {
            id: messageId ?? 'assistant-final',
          }
        );
        await onUpdate?.({ type: 'start', message });
        await onUpdate?.({ type: 'text_start', contentIndex: 0, message });
        return message;
      });

    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        events.push(event);
      },
      onStateChange,
    });

    const result = await adapter.run(
      createConfig({
        tools: [tool],
        modelInvoker,
      }),
      createState()
    );

    expect(result.error).toBeUndefined();
    expect(result.newMessages).toHaveLength(3);
    expect(pendingDuringUpdate).toBe(true);
    expect(adapter.getPendingToolCalls().size).toBe(0);

    const assistantStarts = events.filter(
      (event): event is Extract<AgentEvent, { type: 'message_start'; messageType: 'assistant' }> =>
        event.type === 'message_start' && event.messageType === 'assistant'
    );
    const assistantUpdates = events.filter(
      (event): event is Extract<AgentEvent, { type: 'message_update' }> => event.type === 'message_update'
    );
    const assistantEnds = events.filter(
      (event): event is Extract<AgentEvent, { type: 'message_end'; messageType: 'assistant' }> =>
        event.type === 'message_end' && event.messageType === 'assistant'
    );

    expect(events[0]).toEqual({ type: 'agent_start' });
    expect(assistantStarts).toHaveLength(2);
    expect(assistantUpdates[0]?.messageId).toBe(assistantStarts[0]?.messageId);
    expect(assistantEnds[0]?.messageId).toBe(assistantStarts[0]?.messageId);
    expect(events.some((event) => event.type === 'tool_execution_start')).toBe(true);
    expect(events.some((event) => event.type === 'tool_execution_update')).toBe(true);
    expect(events.some((event) => event.type === 'tool_execution_end')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'agent_end' });
    expect(onStateChange).toHaveBeenCalled();
  });

  it('synthesizes a terminal assistant message when the engine fails before producing one', async () => {
    const events: AgentEvent[] = [];
    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        events.push(event);
      },
    });

    const result = await adapter.step(
      createConfig({
        modelInvoker: vi.fn(async () => {
          throw Object.assign(new Error('backend exploded'), { canRetry: false });
        }),
      }),
      createState()
    );

    expect(result.error).toMatchObject({
      phase: 'model',
      message: 'backend exploded',
    });

    const assistantEnd = events.find(
      (event): event is Extract<AgentEvent, { type: 'message_end'; messageType: 'assistant' }> =>
        event.type === 'message_end' && event.messageType === 'assistant'
    );

    expect(assistantEnd).toBeDefined();
    expect(assistantEnd?.message).toMatchObject({
      role: 'assistant',
      stopReason: 'error',
      error: {
        message: 'backend exploded',
        canRetry: false,
      },
    });
  });

  it('lets callers inject external messages between steps by passing updated state back in', async () => {
    const contexts: Message[][] = [];
    const adapter = createEventAdapter(agentEngine);

    const stepOne = await adapter.step(
      createConfig({
        modelInvoker: vi.fn(async ({ context, messageId }) => {
          contexts.push(context.messages);
          return createAssistantMessage(
            [
              {
                type: 'response',
                response: [{ type: 'text', content: 'first turn' }],
              },
            ],
            { id: messageId ?? 'assistant-1' }
          );
        }),
      }),
      createState()
    );

    const externalUserMessage = buildUserMessage('Injected externally');
    const stepTwo = await adapter.step(
      createConfig({
        modelInvoker: vi.fn(async ({ context, messageId }) => {
          contexts.push(context.messages);
          return createAssistantMessage(
            [
              {
                type: 'response',
                response: [{ type: 'text', content: 'second turn' }],
              },
            ],
            { id: messageId ?? 'assistant-2' }
          );
        }),
      }),
      {
        ...stepOne.state,
        messages: [...stepOne.state.messages, externalUserMessage],
      }
    );

    expect(stepTwo.error).toBeUndefined();
    expect(contexts[0]).toHaveLength(1);
    expect(contexts[1]).toHaveLength(3);
    expect(contexts[1][2]).toEqual(externalUserMessage);
  });
});
