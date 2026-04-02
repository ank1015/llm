import { Type } from '@sinclair/typebox';
import { describe, expect, it, vi } from 'vitest';

import { runAgent, stepAgent } from '../../../src/agent/engine.js';
import { buildUserMessage } from '../../../src/agent/utils.js';
import { getModel } from '../../../src/models/index.js';

import type {
  AgentEngineConfig,
  AgentError,
  AgentRunState,
  AgentTool,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
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
  content: BaseAssistantMessage<'anthropic'>['content'] = [
    {
      type: 'response',
      response: [{ type: 'text', content: 'Hello there' }],
    },
  ],
  overrides: Partial<BaseAssistantMessage<'anthropic'>> = {}
): BaseAssistantMessage<'anthropic'> {
  return {
    role: 'assistant',
    api: 'anthropic',
    id: `msg_${Math.random().toString(36).slice(2)}`,
    model,
    timestamp: Date.now(),
    duration: 50,
    stopReason: 'stop',
    content,
    usage: {
      input: 20,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 30,
      cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
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

function createConfig(overrides: Partial<AgentEngineConfig> = {}): AgentEngineConfig {
  return {
    tools: [],
    provider: {
      model,
      providerOptions: {},
    },
    modelInvoker: vi.fn(async () => createAssistantMessage()),
    ...overrides,
  };
}

describe('stepAgent', () => {
  it('completes a simple assistant turn without tools', async () => {
    const assistantMessage = createAssistantMessage();
    const config = createConfig({
      modelInvoker: vi.fn(async () => assistantMessage),
    });

    const result = await stepAgent(config, createState());

    expect(result.aborted).toBe(false);
    expect(result.continue).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.newMessages).toEqual([assistantMessage]);
    expect(result.state.messages).toHaveLength(2);
    expect(result.state.totalCost).toBe(0.3);
    expect(result.state.totalTokens).toBe(30);
    expect(result.state.turns).toBe(1);
  });

  it('applies transform hooks for context, model output, tool calls, and tool results', async () => {
    const seenContexts: Context[] = [];
    const tool = {
      name: 'calculator',
      description: 'Adds two numbers',
      parameters: Type.Object({
        a: Type.Number(),
        b: Type.Number(),
      }),
      execute: vi.fn(async ({ params }) => ({
        content: [{ type: 'text', content: String(params.a + params.b) }],
        details: { sum: params.a + params.b },
      })),
    } satisfies AgentTool;

    const assistantMessage = createAssistantMessage([createToolCall('calculator', { a: 1, b: 2 })]);

    const config = createConfig({
      tools: [tool],
      modelInvoker: vi.fn(async ({ context }) => {
        seenContexts.push(context);
        return assistantMessage;
      }),
      hooks: {
        prepareContext: ({ context }) => ({
          ...context,
          systemPrompt: 'Prepared prompt',
        }),
        afterModel: ({ message }) =>
          createAssistantMessage(message.content, {
            ...message,
            content: [
              { type: 'thinking', thinkingText: 'intermediate reasoning' },
              ...message.content,
            ],
          }),
        prepareToolCall: ({ toolCall }) => ({
          ...toolCall,
          arguments: { a: 3, b: 4 },
        }),
        formatToolResult: ({ toolCall, result }) => ({
          role: 'toolResult',
          id: 'formatted-result',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.name,
          content: [{ type: 'text', content: 'formatted output' }],
          details: result.details,
          isError: false,
          timestamp: Date.now(),
        }),
      },
    });

    const result = await stepAgent(config, createState());

    expect(seenContexts[0]?.systemPrompt).toBe('Prepared prompt');
    expect(tool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { a: 3, b: 4 },
      })
    );
    expect(result.continue).toBe(true);
    expect(result.newMessages[0]).toMatchObject({
      role: 'assistant',
      content: expect.arrayContaining([
        { type: 'thinking', thinkingText: 'intermediate reasoning' },
      ]),
    });
    expect(result.newMessages[1]).toMatchObject({
      role: 'toolResult',
      id: 'formatted-result',
      content: [{ type: 'text', content: 'formatted output' }],
      details: { sum: 7 },
    });
  });

  it('retries retryable model failures and eventually succeeds', async () => {
    const onModelRetry = vi.fn();
    const modelInvoker = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { canRetry: true }))
      .mockResolvedValueOnce(createAssistantMessage());

    const result = await stepAgent(
      createConfig({
        modelInvoker,
        retry: {
          baseDelayMs: 0,
          maxDelayMs: 0,
        },
        hooks: {
          onModelRetry,
        },
      }),
      createState()
    );

    expect(result.error).toBeUndefined();
    expect(modelInvoker).toHaveBeenCalledTimes(2);
    expect(onModelRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable model failures', async () => {
    const result = await stepAgent(
      createConfig({
        modelInvoker: vi.fn(async () => {
          throw Object.assign(new Error('fatal failure'), { canRetry: false });
        }),
      }),
      createState()
    );

    expect(result.error).toMatchObject({
      phase: 'model',
      message: 'fatal failure',
      canRetry: false,
      attempts: 1,
    });
    expect(result.newMessages).toEqual([]);
  });

  it('aborts during retry backoff', async () => {
    const controller = new AbortController();
    let resolveRetryHook!: () => void;
    const retryHookReached = new Promise<void>((resolve) => {
      resolveRetryHook = resolve;
    });

    const resultPromise = stepAgent(
      createConfig({
        modelInvoker: vi.fn(async () => {
          throw Object.assign(new Error('retryable failure'), { canRetry: true });
        }),
        retry: {
          maxRetries: 1,
          baseDelayMs: 1000,
          factor: 1,
          jitterRatio: 0,
          maxDelayMs: 1000,
        },
        hooks: {
          onModelRetry: async () => {
            resolveRetryHook();
          },
        },
      }),
      createState(),
      { signal: controller.signal }
    );

    await retryHookReached;
    controller.abort();

    const result = await resultPromise;

    expect(result.aborted).toBe(true);
    expect(result.newMessages).toEqual([]);
  });

  it('returns a hook error when a transform hook throws', async () => {
    const result = await stepAgent(
      createConfig({
        hooks: {
          prepareContext: async () => {
            throw new Error('bad hook');
          },
        },
      }),
      createState()
    );

    expect(result.error).toMatchObject({
      phase: 'hook',
      message: 'bad hook',
      canRetry: false,
    });
  });

  it('swallows observation hook failures', async () => {
    const result = await stepAgent(
      createConfig({
        hooks: {
          beforeModel: async () => {
            throw new Error('ignore me');
          },
        },
      }),
      createState()
    );

    expect(result.error).toBeUndefined();
    expect(result.newMessages).toHaveLength(1);
  });

  it('returns limit errors for max turns, cost, and context limits', async () => {
    const maxTurnResult = await stepAgent(
      createConfig({
        limits: {
          maxTurns: 1,
        },
      }),
      {
        ...createState(),
        turns: 1,
      }
    );

    expect(maxTurnResult.error).toMatchObject({
      phase: 'limit',
      message: 'Max turns exceeded: 1 >= 1',
    });

    const assistantMessage = createAssistantMessage([], {
      usage: {
        input: 100,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 110,
        cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
      },
    });

    const costResult = await stepAgent(
      createConfig({
        modelInvoker: vi.fn(async () => assistantMessage),
        limits: {
          costLimit: 2,
        },
      }),
      createState()
    );
    expect(costResult.error).toMatchObject({
      phase: 'limit',
      message: 'Cost limit exceeded: 2 >= 2',
    });
    expect(costResult.newMessages[0]).toBe(assistantMessage);

    const contextResult = await stepAgent(
      createConfig({
        modelInvoker: vi.fn(async () => assistantMessage),
        limits: {
          contextLimit: 100,
        },
      }),
      createState()
    );
    expect(contextResult.error).toMatchObject({
      phase: 'limit',
      message: 'Context limit exceeded: 100 >= 100',
    });
  });

  it('turns tool failures into tool result messages instead of crashing', async () => {
    const validationTool = {
      name: 'validator',
      description: 'Needs a numeric value',
      parameters: Type.Object({
        value: Type.Number(),
      }),
      execute: vi.fn(async () => ({
        content: [{ type: 'text', content: 'ok' }],
      })),
    } satisfies AgentTool;

    const throwingTool = {
      name: 'thrower',
      description: 'Always fails',
      parameters: Type.Object({}),
      execute: vi.fn(async () => {
        throw new Error('tool exploded');
      }),
    } satisfies AgentTool;

    const notFoundResult = await stepAgent(
      createConfig({
        modelInvoker: vi.fn(async () => createAssistantMessage([createToolCall('missing', {})])),
      }),
      createState()
    );

    expect(notFoundResult.newMessages[1]).toMatchObject({
      role: 'toolResult',
      isError: true,
      toolName: 'missing',
    });

    const validationResult = await stepAgent(
      createConfig({
        tools: [validationTool],
        modelInvoker: vi.fn(async () =>
          createAssistantMessage([createToolCall('validator', { value: 'bad' })])
        ),
      }),
      createState()
    );

    expect(validationResult.newMessages[1]).toMatchObject({
      role: 'toolResult',
      isError: true,
      toolName: 'validator',
    });
    expect(validationTool.execute).not.toHaveBeenCalled();

    const throwingResult = await stepAgent(
      createConfig({
        tools: [throwingTool],
        modelInvoker: vi.fn(async () => createAssistantMessage([createToolCall('thrower', {})])),
      }),
      createState()
    );

    expect(throwingResult.newMessages[1]).toMatchObject({
      role: 'toolResult',
      isError: true,
      toolName: 'thrower',
      error: expect.objectContaining({
        message: 'tool exploded',
      }),
    });
  });
});

describe('runAgent', () => {
  it('continues across tool turns until the model stops calling tools', async () => {
    const calculatorTool = {
      name: 'calculator',
      description: 'Adds numbers',
      parameters: Type.Object({
        a: Type.Number(),
        b: Type.Number(),
      }),
      execute: vi.fn(async ({ params }) => ({
        content: [{ type: 'text', content: String(params.a + params.b) }],
        details: { sum: params.a + params.b },
      })),
    } satisfies AgentTool;

    const modelInvoker = vi
      .fn()
      .mockResolvedValueOnce(
        createAssistantMessage([createToolCall('calculator', { a: 2, b: 3 }, 'call_calc')])
      )
      .mockResolvedValueOnce(createAssistantMessage());

    const result = await runAgent(
      createConfig({
        tools: [calculatorTool],
        modelInvoker,
      }),
      createState()
    );

    expect(result.error).toBeUndefined();
    expect(result.aborted).toBe(false);
    expect(modelInvoker).toHaveBeenCalledTimes(2);
    expect(calculatorTool.execute).toHaveBeenCalledTimes(1);
    expect(result.newMessages).toHaveLength(3);
    expect(result.newMessages.map((message) => message.role)).toEqual([
      'assistant',
      'toolResult',
      'assistant',
    ]);
  });
});
