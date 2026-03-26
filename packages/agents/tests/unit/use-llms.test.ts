
import { Conversation } from '@ank1015/llm-sdk';
import { InMemorySessionsAdapter, createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { USE_LLMS_MODEL_IDS, createManagedConversation, streamLlm } from '../../src/index.js';

import type { KeysAdapter , AssistantMessageEventStream } from '@ank1015/llm-sdk';

const { mockDefaultKeysAdapter, mockFileSessionsAdapter, mockEventStream } = vi.hoisted(() => ({
  mockDefaultKeysAdapter: {
    get: vi.fn().mockResolvedValue('default-key'),
    getCredentials: vi.fn().mockResolvedValue({
      access_token: 'default-access-token',
      account_id: 'default-account-id',
    }),
    set: vi.fn(),
    setCredentials: vi.fn(),
    delete: vi.fn(),
    deleteCredentials: vi.fn(),
    list: vi.fn().mockResolvedValue(['codex']),
  } satisfies KeysAdapter,
  mockFileSessionsAdapter: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    updateSessionName: vi.fn(),
    listSessions: vi.fn(),
    listProjects: vi.fn(),
    appendMessage: vi.fn(),
    appendCustom: vi.fn(),
    getBranches: vi.fn(),
    getBranchHistory: vi.fn(),
    getNode: vi.fn(),
    getLatestNode: vi.fn(),
    getMessages: vi.fn(),
    searchSessions: vi.fn(),
  },
  mockEventStream: {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: true as const, value: undefined }),
      };
    },
    result: vi.fn(),
  } as AssistantMessageEventStream<'codex'>,
}));

vi.mock('@ank1015/llm-sdk', async () => {
  const actual = await vi.importActual<typeof import('@ank1015/llm-sdk')>('@ank1015/llm-sdk');
  return {
    ...actual,
    stream: vi.fn(),
  };
});

vi.mock('@ank1015/llm-sdk-adapters', async () => {
  const actual = await vi.importActual<typeof import('@ank1015/llm-sdk-adapters')>(
    '@ank1015/llm-sdk-adapters'
  );

  return {
    ...actual,
    createFileKeysAdapter: vi.fn(() => mockDefaultKeysAdapter),
    createFileSessionsAdapter: vi.fn(() => mockFileSessionsAdapter),
  };
});

describe('use-llms helper', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const sdk = await import('@ank1015/llm-sdk');
    vi.mocked(sdk.stream).mockResolvedValue(mockEventStream);
  });

  it('exports the supported model IDs', () => {
    expect(USE_LLMS_MODEL_IDS).toEqual(['gpt-5.4', 'gpt-5.4-mini']);
  });

  it('resolves gpt-5.4 and uses the default keys adapter in streamLlm', async () => {
    const sdk = await import('@ank1015/llm-sdk');

    const result = await streamLlm({
      modelId: 'gpt-5.4',
      messages: [],
    });

    expect(result).toBe(mockEventStream);
    expect(sdk.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        api: 'codex',
        id: 'gpt-5.4',
      }),
      {
        messages: [],
      },
      expect.objectContaining({
        keysAdapter: mockDefaultKeysAdapter,
      })
    );
  });

  it('resolves gpt-5.4-mini and forwards systemPrompt, tools, and thinkingLevel', async () => {
    const sdk = await import('@ank1015/llm-sdk');
    const tools = [
      {
        name: 'summarize',
        description: 'Summarize content',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ] as any;

    await streamLlm({
      modelId: 'gpt-5.4-mini',
      messages: [],
      systemPrompt: 'Be brief.',
      tools,
      thinkingLevel: 'high',
    });

    expect(sdk.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        api: 'codex',
        id: 'gpt-5.4-mini',
      }),
      {
        messages: [],
        systemPrompt: 'Be brief.',
        tools,
      },
      {
        providerOptions: {
          reasoning: {
            effort: 'high',
            summary: 'auto',
          },
        },
        keysAdapter: mockDefaultKeysAdapter,
      }
    );
  });

  it('returns a ready Conversation when sessions are omitted', () => {
    const conversation = createManagedConversation({
      modelId: 'gpt-5.4',
      systemPrompt: 'Act like a careful reviewer.',
      thinkingLevel: 'xhigh',
    });

    expect(conversation).toBeInstanceOf(Conversation);
    expect((conversation as Conversation).state.provider.model.id).toBe('gpt-5.4');
    expect((conversation as Conversation).state.provider.providerOptions).toEqual({
      reasoning: {
        effort: 'xhigh',
        summary: 'auto',
      },
    });
    expect((conversation as Conversation).state.systemPrompt).toBe('Act like a careful reviewer.');
    expect((conversation as any).keysAdapter).toBe(mockDefaultKeysAdapter);
  });

  it('supports file-backed session manager creation', () => {
    const managed = createManagedConversation({
      modelId: 'gpt-5.4',
      sessions: 'file',
    });

    expect(createFileSessionsAdapter).toHaveBeenCalledTimes(1);
    expect(managed.conversation).toBeInstanceOf(Conversation);
    expect(managed.sessionsAdapter).toBe(mockFileSessionsAdapter);
    expect(typeof managed.sessionManager.createSession).toBe('function');
    expect(mockFileSessionsAdapter.createSession).not.toHaveBeenCalled();
    expect(mockFileSessionsAdapter.appendMessage).not.toHaveBeenCalled();
    expect(mockFileSessionsAdapter.getSession).not.toHaveBeenCalled();
  });

  it('supports memory-backed session manager creation', async () => {
    const managed = createManagedConversation({
      modelId: 'gpt-5.4-mini',
      sessions: 'memory',
    });

    expect(managed.conversation).toBeInstanceOf(Conversation);
    expect(managed.sessionsAdapter).toBeInstanceOf(InMemorySessionsAdapter);
    await expect(managed.sessionManager.listProjects()).resolves.toEqual([]);
  });

  it('sets executable tools on the managed conversation', () => {
    const tools = [
      {
        name: 'read_file',
        label: 'Read File',
        description: 'Read a file from disk',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: vi.fn(),
      },
    ] as any;

    const conversation = createManagedConversation({
      modelId: 'gpt-5.4',
      tools,
    });

    expect(conversation).toBeInstanceOf(Conversation);
    expect((conversation as Conversation).state.tools).toBe(tools);
  });
});
