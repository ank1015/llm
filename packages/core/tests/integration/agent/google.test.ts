import { Type } from '@sinclair/typebox';
import { beforeAll, expect, it } from 'vitest';

import '../../../src/providers/google/index.js';

import {
  agentEngine,
  buildUserMessage,
  createEventAdapter,
  defaultModelInvoker,
  stepAgent,
} from '../../../src/agent/index.js';
import { getModel } from '../../../src/models/index.js';

import {
  describeIfAvailable,
  getAssistantText,
  getIntegrationEnv,
} from '../helpers/live.js';

import type {
  AgentEngineConfig,
  AgentEvent,
  AgentRunState,
  AgentTool,
  BaseAssistantEvent,
  Message,
  Model,
} from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const describeIfGoogle = describeIfAvailable(Boolean(apiKey));
let model: Model<'google'>;

describeIfGoogle('Google Agent Integration', () => {
  beforeAll(() => {
    const testModel = getModel('google', 'gemini-3-flash-preview');
    if (!testModel) {
      throw new Error('Test model gemini-3-flash-preview not found');
    }

    model = testModel;
  });

  it('streams through defaultModelInvoker and returns the final assistant message', async () => {
    const updateTypes: BaseAssistantEvent<'google'>['type'][] = [];

    const result = await defaultModelInvoker({
      model,
      context: {
        messages: [buildUserMessage('Reply with exactly INVOKER_OK')],
      },
      options: {
        apiKey,
        temperature: 0,
        maxOutputTokens: 64,
      },
      onUpdate: (event) => {
        updateTypes.push(event.type);
      },
      messageId: 'agent-google-invoker-1',
    });

    expect(updateTypes.length).toBeGreaterThan(0);
    expect(updateTypes[0]).toBe('start');
    expect(updateTypes).toContain('done');
    expect(result.id).toBe('agent-google-invoker-1');
    expect(['stop', 'length']).toContain(result.stopReason);
    expect(result.message).toHaveProperty('candidates');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 45000);

  it('runs stepAgent with real hooks and updates state correctly', async () => {
    const hookOrder: string[] = [];
    const retryEvents: string[] = [];
    const errorEvents: string[] = [];

    const result = await stepAgent(
      createGoogleConfig({
        hooks: {
          prepareContext: ({ context }) => {
            hookOrder.push('prepareContext');
            return {
              ...context,
              systemPrompt:
                'Reply with exactly CONTEXT_HOOK_OK. Do not add any other words.',
            };
          },
          beforeModel: ({ attempt }) => {
            hookOrder.push(`beforeModel:${attempt}`);
          },
          afterModel: ({ message }) => {
            hookOrder.push('afterModel');
            return {
              ...message,
              content: [
                ...message.content,
                {
                  type: 'response',
                  response: [{ type: 'text', content: ' AFTER_MODEL_HOOK_OK' }],
                },
              ],
            };
          },
          onModelRetry: ({ attempt }) => {
            retryEvents.push(`retry:${attempt}`);
          },
          onError: ({ error }) => {
            errorEvents.push(error.message);
          },
        },
      }),
      createState([buildUserMessage('Please follow the system prompt exactly.')])
    );

    expect(result.error).toBeUndefined();
    expect(result.aborted).toBe(false);
    expect(result.continue).toBe(false);
    expect(hookOrder).toEqual(['prepareContext', 'beforeModel:1', 'afterModel']);
    expect(retryEvents).toEqual([]);
    expect(errorEvents).toEqual([]);
    expect(result.state.turns).toBe(1);
    expect(result.state.totalCost).toBeGreaterThan(0);
    expect(result.state.totalTokens).toBeGreaterThan(0);
    expect(result.newMessages).toHaveLength(1);
    expect(getAssistantText(result.newMessages[0] as any)).toMatch(/CONTEXT_HOOK_OK/i);
    expect(getAssistantText(result.newMessages[0] as any)).toMatch(/AFTER_MODEL_HOOK_OK/i);
  }, 45000);

  it('runs a real tool-use turn with stepAgent', async () => {
    const observedCodes: string[] = [];
    const tool = createMagicTool(observedCodes);

    const result = await stepAgent(
      createGoogleConfig({
        systemPrompt:
          'If a tool can answer the request, you must call that tool before answering.',
        tools: [tool as any],
      }),
      createState([
        buildUserMessage(
          'Use the lookup_magic_value tool for code alpha. Do not answer from memory.'
        ),
      ])
    );

    expect(result.error).toBeUndefined();
    expect(result.aborted).toBe(false);
    expect(result.continue).toBe(true);
    expect(result.newMessages).toHaveLength(2);

    const assistantMessage = result.newMessages[0];
    const toolResultMessage = result.newMessages[1];

    expect(assistantMessage.role).toBe('assistant');
    expect((assistantMessage as any).stopReason).toBe('toolUse');

    const toolCall = (assistantMessage as any).content.find(
      (content: { type: string }) => content.type === 'toolCall'
    );
    expect(toolCall).toBeDefined();
    expect(toolCall?.name).toBe('lookup_magic_value');

    expect(observedCodes).toEqual(['alpha']);
    expect(toolResultMessage.role).toBe('toolResult');
    expect((toolResultMessage as any).toolName).toBe('lookup_magic_value');
    expect((toolResultMessage as any).isError).toBe(false);
    expect(getTextFromMessage(toolResultMessage)).toContain('MAGIC=KAPPA-17');
  }, 45000);

  it('emits real adapter lifecycle events for a tool-use step', async () => {
    const observedCodes: string[] = [];
    const pendingSeenDuringToolUpdate: boolean[] = [];
    const events: AgentEvent[] = [];

    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        events.push(event);
      },
    });

    const tool = createMagicTool(observedCodes, async () => {
      pendingSeenDuringToolUpdate.push(adapter.getPendingToolCalls().size > 0);
    });

    const result = await adapter.step(
      createGoogleConfig({
        systemPrompt:
          'If a tool can answer the request, you must call that tool before answering.',
        tools: [tool as any],
      }),
      createState([
        buildUserMessage(
          'Use the lookup_magic_value tool for code alpha. Do not answer from memory.'
        ),
      ])
    );

    expect(result.error).toBeUndefined();
    expect(result.continue).toBe(true);
    expect(observedCodes).toEqual(['alpha']);
    expect(pendingSeenDuringToolUpdate).toContain(true);
    expect(adapter.getPendingToolCalls().size).toBe(0);

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes[0]).toBe('turn_start');
    expect(eventTypes).toContain('message_start');
    expect(eventTypes).toContain('message_update');
    expect(eventTypes).toContain('tool_execution_start');
    expect(eventTypes).toContain('tool_execution_update');
    expect(eventTypes).toContain('tool_execution_end');
    expect(
      events.some(
        (event) => event.type === 'message_start' && event.messageType === 'toolResult'
      )
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === 'message_end' && event.messageType === 'toolResult'
      )
    ).toBe(true);
  }, 45000);

  it('runs the full adapter e2e flow with a real model and tool', async () => {
    const observedCodes: string[] = [];
    const events: AgentEvent[] = [];
    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        events.push(event);
      },
    });

    const result = await adapter.run(
      createGoogleConfig({
        systemPrompt: [
          'If a tool can answer the request, call it before answering.',
          'After you receive the lookup_magic_value tool result, reply with exactly FINAL=KAPPA-17.',
          'Do not call the tool more than once.',
        ].join(' '),
        tools: [createMagicTool(observedCodes) as any],
      }),
      createState([
        buildUserMessage(
          'Use the lookup_magic_value tool for code alpha, then answer exactly as instructed.'
        ),
      ])
    );

    expect(result.error).toBeUndefined();
    expect(result.aborted).toBe(false);
    expect(result.newMessages).toHaveLength(3);
    expect(result.newMessages.map((message) => message.role)).toEqual([
      'assistant',
      'toolResult',
      'assistant',
    ]);
    expect(observedCodes).toEqual(['alpha']);
    expect(getAssistantText(result.newMessages[2] as any)).toMatch(/FINAL=KAPPA-17/i);
    expect(events.some((event) => event.type === 'agent_start')).toBe(true);
    expect(events.some((event) => event.type === 'agent_end')).toBe(true);
  }, 90000);

  it('aborts a live adapter step and still closes the assistant lifecycle', async () => {
    const events: AgentEvent[] = [];
    const controller = new AbortController();
    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        events.push(event);
      },
    });

    const result = await adapter.step(
      createGoogleConfig(),
      createState([
        buildUserMessage('Tell me a very long story about interstellar exploration and keep going.'),
      ]),
      {
        signal: controller.signal,
        onModelUpdate: (event) => {
          if (event.type === 'start' || event.type === 'text_delta') {
            controller.abort();
          }
        },
      }
    );

    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
    expect(adapter.getPendingToolCalls().size).toBe(0);

    const assistantEnd = events.find(
      (event): event is Extract<AgentEvent, { type: 'message_end'; messageType: 'assistant' }> =>
        event.type === 'message_end' && event.messageType === 'assistant'
    );

    expect(assistantEnd).toBeDefined();
    expect((assistantEnd as any)?.message.role).toBe('assistant');
    expect(((assistantEnd as any)?.message as any).stopReason).toBe('aborted');
  }, 45000);
});

function createState(messages: Message[]): AgentRunState {
  return {
    messages,
    totalCost: 0,
    totalTokens: 0,
    turns: 0,
  };
}

function createGoogleConfig(overrides: Partial<AgentEngineConfig> = {}): AgentEngineConfig {
  return {
    provider: {
      model,
      providerOptions: {
        apiKey,
      },
    },
    modelInvoker: defaultModelInvoker,
    tools: [],
    ...overrides,
  };
}

function createMagicTool(
  observedCodes: string[],
  onPartialUpdate?: () => Promise<void>
): AgentTool<typeof MAGIC_TOOL_SCHEMA, { code: string; magic: string }> {
  return {
    name: 'lookup_magic_value',
    description:
      'Return the magic value for the given code. Always call this tool when the user asks for the magic value for code alpha.',
    parameters: MAGIC_TOOL_SCHEMA,
    async execute({ params, onUpdate }) {
      observedCodes.push(params.code);

      if (onPartialUpdate) {
        await onPartialUpdate();
      }

      await onUpdate?.({
        content: [{ type: 'text', content: 'LOOKUP_IN_PROGRESS' }],
        details: { code: params.code, magic: 'KAPPA-17' },
      });

      return {
        content: [{ type: 'text', content: 'MAGIC=KAPPA-17' }],
        details: { code: params.code, magic: 'KAPPA-17' },
      };
    },
  };
}

function getTextFromMessage(message: Message): string {
  if (message.role === 'toolResult') {
    let text = '';
    for (const item of message.content) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
    return text;
  }

  if (message.role === 'assistant') {
    return getAssistantText(message);
  }

  return '';
}

const MAGIC_TOOL_SCHEMA = Type.Object({
  code: Type.Literal('alpha'),
});
