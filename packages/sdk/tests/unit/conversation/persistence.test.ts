/**
 * Unit tests for Conversation session persistence
 */

import * as core from '@ank1015/llm-core';
import { SessionNotFoundError } from '@ank1015/llm-types';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Conversation } from '../../../src/agent/conversation.js';

import type { KeysAdapter, SessionsAdapter } from '../../../src/adapters/types.js';
import type {
  Model,
  BaseAssistantMessage,
  SessionHeader,
  MessageNode,
  Session,
} from '@ank1015/llm-types';

// Mock the core module
vi.mock('@ank1015/llm-core', async () => {
  const actual = await vi.importActual('@ank1015/llm-core');
  return {
    ...actual,
    complete: vi.fn(),
    stream: vi.fn(),
    runAgentLoop: vi.fn(),
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

const mockProvider = {
  model: mockModel,
  providerOptions: { apiKey: 'test-key' },
};

function createMockKeysAdapter(): KeysAdapter {
  return {
    get: vi.fn().mockResolvedValue('test-api-key'),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

function createMockSessionsAdapter(): SessionsAdapter {
  return {
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'auto-session-id',
      header: {
        type: 'session',
        id: 'header-node-id',
        parentId: null,
        branch: 'main',
        sessionName: 'Test Session',
        timestamp: new Date().toISOString(),
      } as SessionHeader,
    }),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    updateSessionName: vi.fn(),
    listSessions: vi.fn(),
    listProjects: vi.fn(),
    appendMessage: vi.fn().mockResolvedValue({
      sessionId: 'auto-session-id',
      node: {
        type: 'message',
        id: 'new-node-id',
        parentId: 'header-node-id',
        branch: 'main',
        timestamp: new Date().toISOString(),
        message: { role: 'user' },
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      } as MessageNode,
    }),
    appendCustom: vi.fn(),
    getBranches: vi.fn(),
    getBranchHistory: vi.fn(),
    getNode: vi.fn(),
    getLatestNode: vi.fn(),
    getMessages: vi.fn(),
    searchSessions: vi.fn(),
  };
}

describe('Conversation persistence', () => {
  let appendNodeId = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    appendNodeId = 0;

    // Default runAgentLoop mock: returns immediately with an assistant message
    vi.mocked(core.runAgentLoop).mockImplementation(
      async (_cfg, _msgs, emit, _signal, callbacks) => {
        const assistantMsg: BaseAssistantMessage<'anthropic'> = {
          role: 'assistant',
          id: 'assistant-msg-1',
          content: [],
          response: {
            id: 'resp-1',
            content: [{ type: 'text', text: 'Hi' }],
            stopReason: 'end_turn',
          },
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

        emit({ type: 'agent_start' });
        emit({ type: 'turn_start' });
        emit({
          type: 'message_start',
          messageId: assistantMsg.id,
          messageType: 'assistant',
          message: assistantMsg,
        });
        emit({
          type: 'message_end',
          messageId: assistantMsg.id,
          messageType: 'assistant',
          message: assistantMsg,
        });
        callbacks.appendMessage(assistantMsg);
        emit({ type: 'turn_end', agentMessages: [assistantMsg] });
        emit({ type: 'agent_end', agentMessages: [assistantMsg] });

        return { messages: [assistantMsg] };
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('without persistence', () => {
    it('should work normally without session config', async () => {
      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
      });
      conversation.setProvider(mockProvider);

      const messages = await conversation.prompt('Hello');
      expect(messages).toHaveLength(1);
    });
  });

  describe('auto-create session', () => {
    it('should auto-create session on first message when sessionId is omitted', async () => {
      const sessions = createMockSessionsAdapter();
      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project', sessionName: 'My Chat' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');

      // Should have created a session
      expect(sessions.createSession).toHaveBeenCalledWith({
        projectName: 'test-project',
        sessionName: 'My Chat',
      });
    });

    it('should persist user message and assistant message', async () => {
      const sessions = createMockSessionsAdapter();

      // Track node IDs across calls
      let nodeIdCounter = 0;
      vi.mocked(sessions.appendMessage).mockImplementation(async () => {
        nodeIdCounter++;
        return {
          sessionId: 'auto-session-id',
          node: {
            type: 'message',
            id: `node-${nodeIdCounter}`,
            parentId: 'prev',
            branch: 'main',
            timestamp: new Date().toISOString(),
          } as MessageNode,
        };
      });

      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');

      // Should have appended 2 messages: user + assistant
      expect(sessions.appendMessage).toHaveBeenCalledTimes(2);

      // First call: user message
      const firstCall = vi.mocked(sessions.appendMessage).mock.calls[0]![0];
      expect(firstCall.message.role).toBe('user');
      expect(firstCall.parentId).toBe('header-node-id'); // header from createSession
      expect(firstCall.sessionId).toBe('auto-session-id');
      expect(firstCall.api).toBe('anthropic');

      // Second call: assistant message
      const secondCall = vi.mocked(sessions.appendMessage).mock.calls[1]![0];
      expect(secondCall.message.role).toBe('assistant');
      expect(secondCall.parentId).toBe('node-1'); // lastNodeId from first append
    });

    it('should not persist when session config is missing', async () => {
      const sessions = createMockSessionsAdapter();
      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        // No session config!
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');

      expect(sessions.createSession).not.toHaveBeenCalled();
      expect(sessions.appendMessage).not.toHaveBeenCalled();
    });

    it('should not persist when sessions adapter is missing', async () => {
      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        // No sessionsAdapter!
        session: { projectName: 'test-project' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');
      // Should complete without error — no persistence happens
      expect(conversation.state.messages).toHaveLength(2);
    });
  });

  describe('resume existing session', () => {
    it('should validate session exists and load latest node', async () => {
      const sessions = createMockSessionsAdapter();
      const mockSession: Session = {
        location: { projectName: 'test-project', path: '', sessionId: 'existing-session' },
        header: {
          type: 'session',
          id: 'header-id',
          parentId: null,
          branch: 'main',
          sessionName: 'Old Chat',
          timestamp: '2024-01-01T00:00:00Z',
        },
        nodes: [
          {
            type: 'session',
            id: 'header-id',
            parentId: null,
            branch: 'main',
            sessionName: 'Old Chat',
            timestamp: '2024-01-01T00:00:00Z',
          },
          {
            type: 'message',
            id: 'last-node-on-main',
            parentId: 'header-id',
            branch: 'main',
            timestamp: '2024-01-01T00:01:00Z',
            message: { role: 'user' },
            api: 'anthropic',
            modelId: 'claude-sonnet-4-20250514',
            providerOptions: {},
          },
        ],
      };
      vi.mocked(sessions.getSession).mockResolvedValue(mockSession);
      vi.mocked(sessions.appendMessage).mockResolvedValue({
        sessionId: 'existing-session',
        node: { type: 'message', id: 'new-node' } as MessageNode,
      });

      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project', sessionId: 'existing-session' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello again');

      // Should have validated the session
      expect(sessions.getSession).toHaveBeenCalledWith({
        projectName: 'test-project',
        path: '',
        sessionId: 'existing-session',
      });

      // Should NOT create a new session
      expect(sessions.createSession).not.toHaveBeenCalled();

      // First persisted message should use the latest node as parent
      const firstCall = vi.mocked(sessions.appendMessage).mock.calls[0]![0];
      expect(firstCall.parentId).toBe('last-node-on-main');
      expect(firstCall.sessionId).toBe('existing-session');
    });

    it('should throw SessionNotFoundError for non-existent session', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.getSession).mockResolvedValue(undefined);

      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project', sessionId: 'nonexistent' },
      });
      conversation.setProvider(mockProvider);

      await expect(conversation.prompt('Hello')).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('branch support', () => {
    it('should use custom branch name', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.appendMessage).mockResolvedValue({
        sessionId: 'auto-session-id',
        node: { type: 'message', id: 'node-1' } as MessageNode,
      });

      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project', branch: 'feature-1' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');

      const firstCall = vi.mocked(sessions.appendMessage).mock.calls[0]![0];
      expect(firstCall.branch).toBe('feature-1');
    });
  });

  describe('path support', () => {
    it('should pass path to session operations', async () => {
      const sessions = createMockSessionsAdapter();
      vi.mocked(sessions.appendMessage).mockResolvedValue({
        sessionId: 'auto-session-id',
        node: { type: 'message', id: 'node-1' } as MessageNode,
      });

      const conversation = new Conversation({
        keysAdapter: createMockKeysAdapter(),
        sessionsAdapter: sessions,
        session: { projectName: 'test-project', path: 'chats/2024' },
      });
      conversation.setProvider(mockProvider);

      await conversation.prompt('Hello');

      expect(sessions.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'chats/2024' })
      );

      const firstCall = vi.mocked(sessions.appendMessage).mock.calls[0]![0];
      expect(firstCall.path).toBe('chats/2024');
    });
  });
});
