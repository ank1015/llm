import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentInputError,
  AgentRunConsumptionError,
  agent,
} from '../../src/index.js';
import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import { appendSessionMessage, getSessionHead, loadSessionMessages } from '../../src/session.js';
import { resolveModelInput } from '../../src/model-input.js';
import { createEventAdapter } from '@ank1015/llm-core';

import type { AgentEvent, BaseAssistantMessage, Message, SessionNodeSaver } from '../../src/index.js';

vi.mock('../../src/model-input.js', () => ({
  resolveModelInput: vi.fn(),
}));

vi.mock('@ank1015/llm-core', () => ({
  agentEngine: { run: vi.fn(), step: vi.fn() },
  createEventAdapter: vi.fn(),
  defaultModelInvoker: vi.fn(),
}));

const mockedResolveModelInput = vi.mocked(resolveModelInput);
const mockedCreateEventAdapter = vi.mocked(createEventAdapter);

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  resetSdkConfig();
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-agent-'));
  tempDirectories.push(directory);
  return directory;
}

describe('agent', () => {
  it('auto-creates a session, streams raw AgentEvent values, and persists emitted messages in order', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

    const assistantMessage = buildAssistantMessage({
      id: 'assistant-1',
      content: [{ type: 'toolCall', name: 'lookup_magic_value', arguments: {}, toolCallId: 'tool-1' }],
      stopReason: 'toolUse',
    });
    const toolResultMessage = buildToolResultMessage();
    const events: AgentEvent[] = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'message_start',
        messageType: 'assistant',
        messageId: assistantMessage.id,
        message: assistantMessage,
      },
      {
        type: 'message_end',
        messageType: 'assistant',
        messageId: assistantMessage.id,
        message: assistantMessage,
      },
      {
        type: 'tool_execution_start',
        toolCallId: 'tool-1',
        toolName: 'lookup_magic_value',
        args: {},
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'tool-1',
        toolName: 'lookup_magic_value',
        result: {
          content: toolResultMessage.content,
          details: toolResultMessage.details,
        },
        isError: false,
      },
      { type: 'turn_end' },
      {
        type: 'agent_end',
        agentMessages: [assistantMessage, toolResultMessage],
      },
    ];

    mockResolvedModelInput();
    installAdapter(async (_config, _state, options, adapterOptions) => {
      for (const event of events) {
        await adapterOptions.onEvent?.(event);
      }

      await options?.onMessage?.(assistantMessage);
      await options?.onMessage?.(toolResultMessage);

      return {
        state: {
          messages: [],
          turns: 2,
          totalTokens: 42,
          totalCost: 0.123,
        },
        newMessages: [assistantMessage, toolResultMessage],
        aborted: false,
      };
    });

    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
      inputMessages: [buildUserMessage('hello from agent')],
    });

    expect(run.sessionPath.startsWith(baseDir)).toBe(true);
    expect(run.sessionPath.endsWith('.jsonl')).toBe(true);

    const receivedEvents: AgentEvent[] = [];
    for await (const event of run) {
      receivedEvents.push(event);
    }

    const result = await run;

    expect(receivedEvents).toEqual(events);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        branch: 'main',
        messages: [buildUserMessage('hello from agent'), assistantMessage, toolResultMessage],
        turns: 2,
        totalTokens: 42,
        totalCost: 0.123,
        newMessages: [assistantMessage, toolResultMessage],
        finalAssistantMessage: assistantMessage,
      })
    );
    if (!result.ok) {
      throw new Error('Expected success result');
    }

    const loaded = await loadSessionMessages({ path: result.sessionPath });
    expect(loaded?.messages).toEqual([
      buildUserMessage('hello from agent'),
      assistantMessage,
      toolResultMessage,
    ]);

    const head = await getSessionHead(result.sessionPath);
    expect(head?.id).toBe(result.headId);
    expect(head?.type).toBe('message');
    if (head?.type === 'message') {
      expect(head.message).toEqual(toolResultMessage);
    }
  });

  it('loads history from the selected head lineage and appends inputMessages before execution', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('main-1'),
    });
    const second = await appendSessionMessage({
      path: first.path,
      message: buildUserMessage('main-2'),
    });
    const branchNode = await appendSessionMessage({
      path: first.path,
      branch: 'alt',
      parentId: second.node.id,
      message: buildUserMessage('alt-1'),
    });

    const finalAssistant = buildAssistantMessage({ id: 'assistant-final' });
    mockResolvedModelInput();
    const runSpy = vi.fn(async (_config, state, options, adapterOptions) => {
      await adapterOptions.onEvent?.({ type: 'agent_start' });
      await options?.onMessage?.(finalAssistant);

      return {
        state: {
          messages: state.messages,
          turns: 1,
          totalTokens: 9,
          totalCost: 0.01,
        },
        newMessages: [finalAssistant],
        aborted: false,
      };
    });
    installAdapter(runSpy);

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
      inputMessages: [buildUserMessage('new-input')],
      session: {
        path: first.path,
        branch: 'main',
        headId: branchNode.node.id,
      },
    });

    expect(runSpy).toHaveBeenCalledOnce();
    const [, initialState] = runSpy.mock.calls[0]!;
    expect(initialState.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
      buildUserMessage('alt-1'),
      buildUserMessage('new-input'),
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        branch: 'alt',
        messages: [
          buildUserMessage('main-1'),
          buildUserMessage('main-2'),
          buildUserMessage('alt-1'),
          buildUserMessage('new-input'),
          finalAssistant,
        ],
        newMessages: [finalAssistant],
      })
    );

    const loaded = await loadSessionMessages({
      path: first.path,
      headId: result.headId,
    });
    expect(loaded?.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
      buildUserMessage('alt-1'),
      buildUserMessage('new-input'),
      finalAssistant,
    ]);
  });

  it('throws a setup error when model resolution fails', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

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

    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
      inputMessages: [buildUserMessage('hello')],
    });

    expect(run.sessionPath.startsWith(baseDir)).toBe(true);

    const events: AgentEvent[] = [];
    for await (const event of run) {
      events.push(event);
    }

    expect(events).toEqual([]);
    await expect(run).rejects.toEqual(
      expect.objectContaining({
        name: 'AgentInputError',
        message: 'Missing credentials for provider openai: OPENAI_API_KEY',
        code: 'missing_provider_credentials',
        modelId: 'openai/gpt-5.4-mini',
      })
    );
    await expect(run).rejects.toBeInstanceOf(AgentInputError);
    expect(mockedCreateEventAdapter).not.toHaveBeenCalled();
  });

  it('returns a session failure union when persistence fails during the run', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

    const assistantMessage = buildAssistantMessage({ id: 'assistant-1' });

    mockResolvedModelInput();
    installAdapter(async (_config, _state, options) => {
      await options?.onMessage?.(assistantMessage);

      return {
        state: {
          messages: [],
          turns: 1,
          totalTokens: 7,
          totalCost: 0.02,
        },
        newMessages: [assistantMessage],
        aborted: false,
      };
    });

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
      session: {
        saveNode: vi.fn<SessionNodeSaver>(async () => {
          throw new Error('save failed');
        }),
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        messages: [assistantMessage],
        newMessages: [assistantMessage],
        error: {
          phase: 'session',
          message: 'save failed',
          canRetry: false,
        },
      })
    );
  });

  it('returns a limit failure union from the core agent result', async () => {
    mockResolvedModelInput();
    installAdapter(async () => ({
      state: {
        messages: [],
        turns: 20,
        totalTokens: 100,
        totalCost: 0.5,
      },
      newMessages: [],
      aborted: false,
      error: {
        phase: 'limit',
        message: 'Max turns exceeded',
        canRetry: false,
        attempts: 1,
      },
    }));

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
      maxTurns: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        messages: [],
        turns: 20,
        totalTokens: 100,
        totalCost: 0.5,
        error: {
          phase: 'limit',
          message: 'Max turns exceeded',
          canRetry: false,
        },
      })
    );
  });

  it('returns an aborted failure union when the adapter run aborts', async () => {
    mockResolvedModelInput();
    installAdapter(async () => ({
      state: {
        messages: [],
        turns: 1,
        totalTokens: 3,
        totalCost: 0.01,
      },
      newMessages: [],
      aborted: true,
    }));

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        messages: [],
        error: {
          phase: 'aborted',
          message: 'Agent run was aborted.',
          canRetry: true,
        },
      })
    );
  });

  it('honors custom session loaders and savers', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('seed'),
    });
    const saveNode = vi.fn<SessionNodeSaver>(async ({ path, node }) => {
      await appendFile(path, `${JSON.stringify(node)}\n`, 'utf8');
    });
    const loadMessages = vi.fn(async () => [
      {
        role: 'custom' as const,
        id: 'custom-history',
        content: { from: 'loader' },
      },
    ]);
    const assistantMessage = buildAssistantMessage({ id: 'assistant-custom' });

    mockResolvedModelInput();
    const runSpy = vi.fn(async (_config, state, options) => {
      await options?.onMessage?.(assistantMessage);

      return {
        state: {
          messages: state.messages,
          turns: 1,
          totalTokens: 11,
          totalCost: 0.03,
        },
        newMessages: [assistantMessage],
        aborted: false,
      };
    });
    installAdapter(runSpy);

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
      inputMessages: [buildUserMessage('fresh')],
      session: {
        path: first.path,
        loadMessages,
        saveNode,
      },
    });

    expect(loadMessages).toHaveBeenCalledOnce();
    expect(saveNode).toHaveBeenCalledTimes(2);
    const [, initialState] = runSpy.mock.calls[0]!;
    expect(initialState.messages).toEqual([
      {
        role: 'custom',
        id: 'custom-history',
        content: { from: 'loader' },
      },
      buildUserMessage('fresh'),
    ]);

    const loaded = await loadSessionMessages({ path: result.sessionPath });
    expect(loaded?.messages).toEqual([
      buildUserMessage('seed'),
      buildUserMessage('fresh'),
      assistantMessage,
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        messages: [
          {
            role: 'custom',
            id: 'custom-history',
            content: { from: 'loader' },
          },
          buildUserMessage('fresh'),
          assistantMessage,
        ],
        newMessages: [assistantMessage],
      })
    );
  });

  it('throws a clear error when iteration starts after promise consumption has claimed the run', async () => {
    mockResolvedModelInput();
    installAdapter(async (_config, _state, _options, adapterOptions) => {
      await adapterOptions?.onEvent?.({ type: 'agent_start' });

      return {
        state: {
          messages: [],
          turns: 1,
          totalTokens: 1,
          totalCost: 0,
        },
        newMessages: [],
        aborted: false,
      };
    });

    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
    });

    void run.then(() => undefined);

    const iterator = run[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toBeInstanceOf(AgentRunConsumptionError);
  });

  it('throws a clear error when await starts while the async iterator is still active', async () => {
    mockResolvedModelInput();
    installAdapter(async (_config, _state, _options, adapterOptions) => {
      await adapterOptions?.onEvent?.({ type: 'agent_start' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await adapterOptions?.onEvent?.({ type: 'turn_start' });

      return {
        state: {
          messages: [],
          turns: 1,
          totalTokens: 1,
          totalCost: 0,
        },
        newMessages: [],
        aborted: false,
      };
    });

    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
    });

    const iterator = run[Symbol.asyncIterator]();
    const firstEvent = await iterator.next();
    expect(firstEvent).toEqual({
      done: false,
      value: { type: 'agent_start' },
    });

    await expect(run).rejects.toBeInstanceOf(AgentRunConsumptionError);

    await iterator.return?.();
  });
});

function installAdapter(
  runImplementation: (
    config: unknown,
    state: { messages: Message[]; turns: number; totalTokens: number; totalCost: number },
    options?: { onMessage?: (message: Message) => Promise<void> | void },
    adapterOptions?: { onEvent?: (event: AgentEvent) => Promise<void> | void }
  ) => Promise<{
    state: { messages: Message[]; turns: number; totalTokens: number; totalCost: number };
    newMessages: Message[];
    aborted: boolean;
    error?: { phase: 'model' | 'tool' | 'limit' | 'hook'; message: string; canRetry: boolean; attempts: number };
  }>
): void {
  mockedCreateEventAdapter.mockImplementation((_engine, adapterOptions) => ({
    run: (config, state, options) => runImplementation(config, state, options, adapterOptions),
    step: vi.fn(),
    getPendingToolCalls: () => new Set(),
  }) as never);
}

function mockResolvedModelInput(): void {
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
}

function buildUserMessage(text: string): Message {
  return {
    role: 'user',
    id: `user-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    content: [{ type: 'text', content: text }],
  };
}

function buildAssistantMessage(input: {
  id: string;
  content?: BaseAssistantMessage<'openai'>['content'];
  stopReason?: BaseAssistantMessage<'openai'>['stopReason'];
}): BaseAssistantMessage<'openai'> {
  return {
    role: 'assistant',
    api: 'openai',
    id: input.id,
    model: {
      api: 'openai',
      id: 'gpt-5.4-mini',
    } as never,
    message: {} as never,
    timestamp: 1,
    duration: 10,
    stopReason: input.stopReason ?? 'stop',
    content:
      input.content ??
      [
        {
          type: 'response',
          response: [{ type: 'text', content: 'done' }],
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

function buildToolResultMessage(): Message {
  return {
    role: 'toolResult',
    id: 'tool-result-1',
    toolName: 'lookup_magic_value',
    toolCallId: 'tool-1',
    content: [{ type: 'text', content: 'MAGIC_2718' }],
    details: { source: 'test' },
    isError: false,
    timestamp: 2,
  };
}
