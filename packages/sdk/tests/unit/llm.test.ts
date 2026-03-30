import { describe, expect, it, vi, afterEach } from 'vitest';

import { llm, LlmInputError, LlmRunConsumptionError } from '../../src/llm.js';
import { resolveModelInput } from '../../src/model-input.js';
import { stream } from '@ank1015/llm-core';

import type { BaseAssistantEvent, BaseAssistantMessage } from '@ank1015/llm-core';

vi.mock('../../src/model-input.js', () => ({
  resolveModelInput: vi.fn(),
}));

vi.mock('@ank1015/llm-core', () => ({
  stream: vi.fn(),
}));

const mockedResolveModelInput = vi.mocked(resolveModelInput);
const mockedStream = vi.mocked(stream);

afterEach(() => {
  vi.clearAllMocks();
});

describe('llm', () => {
  it('awaits the final message and maps context and provider options', async () => {
    const finalMessage = createAssistantMessage();
    const fakeStream = createFakeStream([], finalMessage);
    const signal = new AbortController().signal;
    const tools = [
      {
        name: 'searchDocs',
        description: 'Search the docs',
        parameters: { type: 'object', properties: {} },
      },
    ];

    mockedResolveModelInput.mockResolvedValue({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath: '/tmp/keys.env',
      model: {
        api: 'openai',
        id: 'gpt-5.4-mini',
      } as never,
      providerOptions: {
        apiKey: 'openai-key',
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
      provider: {
        model: {
          api: 'openai',
          id: 'gpt-5.4-mini',
        } as never,
        providerOptions: {
          apiKey: 'openai-key',
          reasoning: {
            effort: 'high',
            summary: 'auto',
          },
        },
      },
    });
    mockedStream.mockReturnValue(fakeStream as never);

    const result = await llm({
      modelId: 'openai/gpt-5.4-mini',
      messages: [
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Hello' }],
        },
      ],
      system: 'You are helpful.',
      tools,
      reasoningEffort: 'high',
      signal,
      requestId: 'req-123',
    });

    expect(result).toBe(finalMessage);
    expect(mockedResolveModelInput).toHaveBeenCalledWith({
      modelId: 'openai/gpt-5.4-mini',
      reasoningEffort: 'high',
      overrideProviderSetting: undefined,
      keysFilePath: undefined,
    });
    expect(mockedStream).toHaveBeenCalledWith(
      {
        api: 'openai',
        id: 'gpt-5.4-mini',
      },
      {
        messages: [
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
        systemPrompt: 'You are helpful.',
        tools,
      },
      {
        apiKey: 'openai-key',
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
        signal,
      },
      'req-123'
    );
    expect(fakeStream.drain).toHaveBeenCalledOnce();
  });

  it('streams events and can still be awaited for the final message', async () => {
    const finalMessage = createAssistantMessage();
    const events: BaseAssistantEvent<'openai'>[] = [
      { type: 'start', message: finalMessage },
      { type: 'text_start', contentIndex: 0, message: finalMessage },
      {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'Hello',
        message: finalMessage,
      },
      {
        type: 'text_end',
        contentIndex: 0,
        content: [{ type: 'text', content: 'Hello' }],
        message: finalMessage,
      },
      {
        type: 'done',
        reason: 'stop',
        message: finalMessage,
      },
    ];

    mockedResolveModelInput.mockResolvedValue({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath: '/tmp/keys.env',
      model: {
        api: 'openai',
        id: 'gpt-5.4-mini',
      } as never,
      providerOptions: {
        apiKey: 'openai-key',
      },
      provider: {
        model: {
          api: 'openai',
          id: 'gpt-5.4-mini',
        } as never,
        providerOptions: {
          apiKey: 'openai-key',
        },
      },
    });
    mockedStream.mockReturnValue(createFakeStream(events, finalMessage) as never);

    const run = llm({
      modelId: 'openai/gpt-5.4-mini',
      messages: [],
      requestId: 'req-456',
    });

    const receivedEvents: BaseAssistantEvent<'openai'>[] = [];
    for await (const event of run) {
      receivedEvents.push(event);
    }

    const result = await run;

    expect(receivedEvents).toEqual(events);
    expect(result).toBe(finalMessage);
    expect(mockedStream).toHaveBeenCalledOnce();
  });

  it('throws a setup error when model resolution fails', async () => {
    mockedResolveModelInput.mockResolvedValue({
      ok: false,
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath: '/tmp/keys.env',
      error: {
        code: 'missing_provider_credentials',
        message: 'Missing credentials for provider openai: OPENAI_API_KEY',
        provider: 'openai',
        path: '/tmp/keys.env',
        missing: [
          {
            option: 'apiKey',
            env: 'OPENAI_API_KEY',
            aliases: [],
          },
        ],
      },
    });

    await expect(
      llm({
        modelId: 'openai/gpt-5.4-mini',
        messages: [],
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'LlmInputError',
        code: 'missing_provider_credentials',
        message: 'Missing credentials for provider openai: OPENAI_API_KEY',
        modelId: 'openai/gpt-5.4-mini',
        keysFilePath: '/tmp/keys.env',
      })
    );

    await expect(
      (async () => {
        const run = llm({
          modelId: 'openai/gpt-5.4-mini',
          messages: [],
        });

        const iterator = run[Symbol.asyncIterator]();
        await iterator.next();
      })()
    ).rejects.toBeInstanceOf(LlmInputError);

    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('throws a clear error when iteration starts after promise consumption has claimed the run', async () => {
    const finalMessage = createAssistantMessage();

    mockedResolveModelInput.mockResolvedValue({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath: '/tmp/keys.env',
      model: {
        api: 'openai',
        id: 'gpt-5.4-mini',
      } as never,
      providerOptions: {
        apiKey: 'openai-key',
      },
      provider: {
        model: {
          api: 'openai',
          id: 'gpt-5.4-mini',
        } as never,
        providerOptions: {
          apiKey: 'openai-key',
        },
      },
    });
    mockedStream.mockReturnValue(createFakeStream([], finalMessage) as never);

    const run = llm({
      modelId: 'openai/gpt-5.4-mini',
      messages: [],
    });

    void run.then(() => undefined);

    const iterator = run[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toBeInstanceOf(LlmRunConsumptionError);
  });

  it('throws a clear error when await starts while the async iterator is still active', async () => {
    const finalMessage = createAssistantMessage();
    const events: BaseAssistantEvent<'openai'>[] = [
      { type: 'start', message: finalMessage },
      { type: 'done', reason: 'stop', message: finalMessage },
    ];

    mockedResolveModelInput.mockResolvedValue({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath: '/tmp/keys.env',
      model: {
        api: 'openai',
        id: 'gpt-5.4-mini',
      } as never,
      providerOptions: {
        apiKey: 'openai-key',
      },
      provider: {
        model: {
          api: 'openai',
          id: 'gpt-5.4-mini',
        } as never,
        providerOptions: {
          apiKey: 'openai-key',
        },
      },
    });
    mockedStream.mockReturnValue(createFakeStream(events, finalMessage) as never);

    const run = llm({
      modelId: 'openai/gpt-5.4-mini',
      messages: [],
    });

    const iterator = run[Symbol.asyncIterator]();
    const firstEvent = await iterator.next();
    expect(firstEvent).toEqual({
      done: false,
      value: events[0],
    });

    await expect(run).rejects.toBeInstanceOf(LlmRunConsumptionError);

    await iterator.return?.();
  });
});

function createFakeStream<TApi extends string>(
  events: BaseAssistantEvent<TApi & never>[],
  finalMessage: BaseAssistantMessage<TApi & never>
) {
  return {
    drain: vi.fn(async () => finalMessage),
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function createAssistantMessage(): BaseAssistantMessage<'openai'> {
  return {
    role: 'assistant',
    api: 'openai',
    id: 'assistant-1',
    model: {
      api: 'openai',
      id: 'gpt-5.4-mini',
    } as never,
    message: {} as never,
    timestamp: 1,
    duration: 10,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        response: [{ type: 'text', content: 'Hello' }],
      },
    ],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}
