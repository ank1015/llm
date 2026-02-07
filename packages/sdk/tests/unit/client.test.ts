/**
 * Unit tests for LLMClient
 */

import * as core from '@ank1015/llm-core';
import { AssistantMessageEventStream } from '@ank1015/llm-core';
import { ApiKeyNotFoundError } from '@ank1015/llm-types';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LLMClient } from '../../src/client.js';

import type { KeysAdapter, UsageAdapter, SessionsAdapter } from '../../src/adapters/types.js';
import type { Model, BaseAssistantMessage, Session, SessionSummary } from '@ank1015/llm-types';

// Mock the core module
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    complete: vi.fn(),
    stream: vi.fn(),
  };
});

const mockModel: Model<'anthropic'> = {
  id: 'claude-sonnet-4-20250514',
  api: 'anthropic',
  name: 'Claude Sonnet',
  baseUrl: 'https://api.anthropic.com',
  reasoning: false,
  input: [],
  cost: { input: 0.003, output: 0.015 },
  contextWindow: 200000,
  maxTokens: 8192,
  tools: ['function_calling'],
};

const mockClaudeCodeModel: Model<'claude-code'> = {
  id: 'claude-haiku-4-5',
  api: 'claude-code',
  name: 'Claude Haiku 4.5',
  baseUrl: 'https://api.anthropic.com',
  reasoning: false,
  input: ['text'],
  cost: { input: 0.001, output: 0.005 },
  contextWindow: 200000,
  maxTokens: 8192,
  tools: ['function_calling'],
};

const mockCodexModel: Model<'codex'> = {
  id: 'gpt-5.3-codex',
  api: 'codex',
  name: 'GPT-5.3 Codex',
  baseUrl: 'https://chatgpt.com/backend-api/codex',
  reasoning: true,
  input: ['text'],
  cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
  contextWindow: 400000,
  maxTokens: 128000,
  tools: ['function_calling'],
};

const mockAssistantMessage: BaseAssistantMessage<'anthropic'> = {
  role: 'assistant',
  id: 'msg-1',
  content: [],
  response: { id: 'resp-1', content: [{ type: 'text', text: 'Hello' }], stopReason: 'end_turn' },
  usage: {
    input: 10,
    output: 5,
    totalTokens: 15,
    cost: { input: 0.00003, output: 0.000075, total: 0.000105 },
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  },
  model: mockModel,
  timestamp: Date.now(),
  requestId: 'req-1',
  nativeResponse: {} as never,
};

function createMockKeysAdapter(): KeysAdapter {
  return {
    get: vi.fn().mockResolvedValue('test-api-key'),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue(['anthropic']),
  };
}

function createMockUsageAdapter(): UsageAdapter {
  return {
    track: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ totalCost: 0, totalTokens: 0, messageCount: 0 }),
    getMessages: vi.fn().mockResolvedValue([]),
    getMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(true),
  };
}

function createMockSessionsAdapter(): SessionsAdapter {
  return {
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
  };
}

describe('LLMClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept empty config', () => {
      const client = new LLMClient();
      expect(client.keys).toBeUndefined();
      expect(client.usage).toBeUndefined();
      expect(client.sessions).toBeUndefined();
      expect(client.usageTrackingMode).toBe('bestEffort');
    });

    it('should store provided adapters', () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      const sessions = createMockSessionsAdapter();
      const client = new LLMClient({ keys, usage, sessions, usageTrackingMode: 'strict' });

      expect(client.keys).toBe(keys);
      expect(client.usage).toBe(usage);
      expect(client.sessions).toBe(sessions);
      expect(client.usageTrackingMode).toBe('strict');
    });
  });

  describe('complete()', () => {
    it('should resolve key from adapter and call core complete', async () => {
      const keys = createMockKeysAdapter();
      const client = new LLMClient({ keys });

      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage);

      const result = await client.complete(mockModel, { messages: [] });

      expect(keys.get).toHaveBeenCalledWith('anthropic');
      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        { messages: [] },
        expect.objectContaining({ apiKey: 'test-api-key' }),
        expect.any(String)
      );
      expect(result).toEqual(mockAssistantMessage);
    });

    it('should use apiKey from providerOptions over adapter', async () => {
      const keys = createMockKeysAdapter();
      const client = new LLMClient({ keys });

      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage);

      await client.complete(mockModel, { messages: [] }, { apiKey: 'direct-key' });

      expect(keys.get).not.toHaveBeenCalled();
      expect(core.complete).toHaveBeenCalledWith(
        mockModel,
        { messages: [] },
        expect.objectContaining({ apiKey: 'direct-key' }),
        expect.any(String)
      );
    });

    it('should throw ApiKeyNotFoundError when no key available', async () => {
      const client = new LLMClient();

      await expect(client.complete(mockModel, { messages: [] })).rejects.toThrow(
        ApiKeyNotFoundError
      );
    });

    it('should track usage when adapter is provided', async () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      const client = new LLMClient({ keys, usage });

      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage);

      await client.complete(mockModel, { messages: [] });

      expect(usage.track).toHaveBeenCalledWith(mockAssistantMessage);
    });

    it('should swallow usage tracking errors in bestEffort mode', async () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      vi.mocked(usage.track).mockRejectedValue(new Error('DB write failed'));
      const client = new LLMClient({ keys, usage, usageTrackingMode: 'bestEffort' });

      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage);

      // Should not throw
      const result = await client.complete(mockModel, { messages: [] });
      expect(result).toEqual(mockAssistantMessage);
    });

    it('should propagate usage tracking errors in strict mode', async () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      vi.mocked(usage.track).mockRejectedValue(new Error('DB write failed'));
      const client = new LLMClient({ keys, usage, usageTrackingMode: 'strict' });

      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage);

      await expect(client.complete(mockModel, { messages: [] })).rejects.toThrow('DB write failed');
    });

    it('should resolve claude-code credentials via getCredentials()', async () => {
      const keys: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        set: vi.fn(),
        setCredentials: vi.fn(),
        delete: vi.fn(),
        deleteCredentials: vi.fn(),
        list: vi.fn(),
      };
      const client = new LLMClient({ keys });
      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage as any);

      await client.complete(mockClaudeCodeModel, { messages: [] });

      expect(keys.getCredentials).toHaveBeenCalledWith('claude-code');
      expect(core.complete).toHaveBeenCalledWith(
        mockClaudeCodeModel,
        { messages: [] },
        expect.objectContaining({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        expect.any(String)
      );
    });

    it('should resolve codex credentials via getCredentials() aliases', async () => {
      const keys: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue({
          access_token: 'access-token',
          account_id: 'acc-123',
        }),
        set: vi.fn(),
        setCredentials: vi.fn(),
        delete: vi.fn(),
        deleteCredentials: vi.fn(),
        list: vi.fn(),
      };
      const client = new LLMClient({ keys });
      vi.mocked(core.complete).mockResolvedValue(mockAssistantMessage as any);

      await client.complete(mockCodexModel, { messages: [] }, {
        instructions: 'You are a coding assistant.',
      } as any);

      expect(keys.getCredentials).toHaveBeenCalledWith('codex');
      expect(core.complete).toHaveBeenCalledWith(
        mockCodexModel,
        { messages: [] },
        expect.objectContaining({
          apiKey: 'access-token',
          'chatgpt-account-id': 'acc-123',
          instructions: 'You are a coding assistant.',
        }),
        expect.any(String)
      );
    });
  });

  describe('stream()', () => {
    function createMockEventStream() {
      const mockStream = {
        result: vi.fn().mockResolvedValue(mockAssistantMessage),
        [Symbol.asyncIterator]: vi.fn(),
      } as unknown as AssistantMessageEventStream<'anthropic'>;
      return mockStream;
    }

    it('should resolve key and call core stream', async () => {
      const keys = createMockKeysAdapter();
      const client = new LLMClient({ keys });
      const mockStream = createMockEventStream();

      vi.mocked(core.stream).mockReturnValue(mockStream);

      const result = await client.stream(mockModel, { messages: [] });

      expect(keys.get).toHaveBeenCalledWith('anthropic');
      expect(core.stream).toHaveBeenCalledWith(
        mockModel,
        { messages: [] },
        expect.objectContaining({ apiKey: 'test-api-key' }),
        expect.any(String)
      );
      expect(result).toBeDefined();
    });

    it('should track usage on result() when adapter is provided', async () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      const client = new LLMClient({ keys, usage });
      const mockStream = createMockEventStream();

      vi.mocked(core.stream).mockReturnValue(mockStream);

      const stream = await client.stream(mockModel, { messages: [] });
      const message = await stream.result();

      expect(usage.track).toHaveBeenCalledWith(mockAssistantMessage);
      expect(message).toEqual(mockAssistantMessage);
    });

    it('should not wrap stream when no usage adapter', async () => {
      const keys = createMockKeysAdapter();
      const client = new LLMClient({ keys });
      const mockStream = createMockEventStream();

      vi.mocked(core.stream).mockReturnValue(mockStream);

      const stream = await client.stream(mockModel, { messages: [] });

      // Should be the same object (not wrapped)
      expect(stream).toBe(mockStream);
    });

    it('should resolve claude-code credentials via getCredentials()', async () => {
      const keys: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        set: vi.fn(),
        setCredentials: vi.fn(),
        delete: vi.fn(),
        deleteCredentials: vi.fn(),
        list: vi.fn(),
      };
      const client = new LLMClient({ keys });
      const mockStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockStream as any);

      await client.stream(mockClaudeCodeModel, { messages: [] });

      expect(keys.getCredentials).toHaveBeenCalledWith('claude-code');
      expect(core.stream).toHaveBeenCalledWith(
        mockClaudeCodeModel,
        { messages: [] },
        expect.objectContaining({
          oauthToken: 'oauth-token',
          betaFlag: 'flag-a,flag-b',
          billingHeader: 'x-anthropic-billing-header: cc_version=test;',
        }),
        expect.any(String)
      );
    });

    it('should resolve codex credentials via getCredentials() aliases', async () => {
      const keys: KeysAdapter = {
        get: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue({
          access_token: 'access-token',
          account_id: 'acc-123',
        }),
        set: vi.fn(),
        setCredentials: vi.fn(),
        delete: vi.fn(),
        deleteCredentials: vi.fn(),
        list: vi.fn(),
      };
      const client = new LLMClient({ keys });
      const mockStream = createMockEventStream();
      vi.mocked(core.stream).mockReturnValue(mockStream as any);

      await client.stream(mockCodexModel, { messages: [] }, {
        instructions: 'You are a coding assistant.',
      } as any);

      expect(keys.getCredentials).toHaveBeenCalledWith('codex');
      expect(core.stream).toHaveBeenCalledWith(
        mockCodexModel,
        { messages: [] },
        expect.objectContaining({
          apiKey: 'access-token',
          'chatgpt-account-id': 'acc-123',
          instructions: 'You are a coding assistant.',
        }),
        expect.any(String)
      );
    });
  });

  describe('createConversation()', () => {
    it('should create a Conversation with client adapters', () => {
      const keys = createMockKeysAdapter();
      const usage = createMockUsageAdapter();
      const client = new LLMClient({ keys, usage });

      const convo = client.createConversation();

      expect(convo).toBeDefined();
      expect(convo.state).toBeDefined();
    });

    it('should allow overriding adapters per-conversation', () => {
      const clientKeys = createMockKeysAdapter();
      const convoKeys = createMockKeysAdapter();
      const client = new LLMClient({ keys: clientKeys });

      // The conversation should use convoKeys, not clientKeys
      const convo = client.createConversation({ keysAdapter: convoKeys });
      expect(convo).toBeDefined();
    });
  });

  describe('session query methods', () => {
    it('should throw when no sessions adapter configured', async () => {
      const client = new LLMClient();

      await expect(client.listSessions('project')).rejects.toThrow(
        'No sessions adapter configured'
      );
      await expect(client.getSession('project', 'id')).rejects.toThrow(
        'No sessions adapter configured'
      );
      await expect(client.searchSessions('project', 'query')).rejects.toThrow(
        'No sessions adapter configured'
      );
      await expect(client.listProjects()).rejects.toThrow('No sessions adapter configured');
    });

    it('should delegate listSessions to adapter', async () => {
      const sessions = createMockSessionsAdapter();
      const mockSummaries: SessionSummary[] = [];
      vi.mocked(sessions.listSessions).mockResolvedValue(mockSummaries);

      const client = new LLMClient({ sessions });
      const result = await client.listSessions('project', 'path');

      expect(sessions.listSessions).toHaveBeenCalledWith('project', 'path');
      expect(result).toEqual(mockSummaries);
    });

    it('should delegate getSession to adapter', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.getSession).mockResolvedValue(undefined);

      const client = new LLMClient({ sessions });
      await client.getSession('project', 'session-id', 'path');

      expect(sessions.getSession).toHaveBeenCalledWith({
        projectName: 'project',
        sessionId: 'session-id',
        path: 'path',
      });
    });

    it('should delegate searchSessions to adapter', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.searchSessions).mockResolvedValue([]);

      const client = new LLMClient({ sessions });
      await client.searchSessions('project', 'query', 'path');

      expect(sessions.searchSessions).toHaveBeenCalledWith('project', 'query', 'path');
    });

    it('should delegate listProjects to adapter', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.listProjects).mockResolvedValue(['p1', 'p2']);

      const client = new LLMClient({ sessions });
      const result = await client.listProjects();

      expect(sessions.listProjects).toHaveBeenCalled();
      expect(result).toEqual(['p1', 'p2']);
    });
  });
});
