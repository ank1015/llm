/**
 * Unit tests for SessionManager
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionManager, createSessionManager } from '../../../src/session/session-manager.js';

import type { SessionsAdapter } from '../../../src/adapters/types.js';
import type {
  BranchInfo,
  CustomNode,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
} from '@ank1015/llm-types';

/**
 * Create a mock SessionsAdapter
 */
function createMockAdapter(): SessionsAdapter {
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

describe('SessionManager', () => {
  let mockAdapter: SessionsAdapter;
  let manager: SessionManager;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    manager = new SessionManager(mockAdapter);
  });

  describe('createSession()', () => {
    it('should delegate to adapter with correct input', async () => {
      const mockResult = {
        sessionId: 'session-123',
        header: { type: 'session', id: 'session-123', sessionName: 'Test' } as SessionHeader,
      };
      vi.mocked(mockAdapter.createSession).mockResolvedValue(mockResult);

      const result = await manager.createSession({
        projectName: 'my-project',
        path: 'sub/path',
        sessionName: 'My Session',
      });

      expect(mockAdapter.createSession).toHaveBeenCalledWith({
        projectName: 'my-project',
        path: 'sub/path',
        sessionName: 'My Session',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getSession()', () => {
    it('should delegate to adapter with correct location', async () => {
      const mockSession: Session = {
        location: { projectName: 'my-project', path: '', sessionId: 'session-123' },
        header: { type: 'session', id: 'session-123', sessionName: 'Test' } as SessionHeader,
        nodes: [],
      };
      vi.mocked(mockAdapter.getSession).mockResolvedValue(mockSession);

      const result = await manager.getSession('my-project', 'session-123', 'sub/path');

      expect(mockAdapter.getSession).toHaveBeenCalledWith({
        projectName: 'my-project',
        sessionId: 'session-123',
        path: 'sub/path',
      });
      expect(result).toEqual(mockSession);
    });

    it('should use empty string for path when not provided', async () => {
      vi.mocked(mockAdapter.getSession).mockResolvedValue(undefined);

      await manager.getSession('my-project', 'session-123');

      expect(mockAdapter.getSession).toHaveBeenCalledWith({
        projectName: 'my-project',
        sessionId: 'session-123',
        path: '',
      });
    });
  });

  describe('deleteSession()', () => {
    it('should delegate to adapter with correct location', async () => {
      vi.mocked(mockAdapter.deleteSession).mockResolvedValue(true);

      const result = await manager.deleteSession('my-project', 'session-123', 'sub/path');

      expect(mockAdapter.deleteSession).toHaveBeenCalledWith({
        projectName: 'my-project',
        sessionId: 'session-123',
        path: 'sub/path',
      });
      expect(result).toBe(true);
    });
  });

  describe('updateSessionName()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockHeader: SessionHeader = {
        type: 'session',
        id: 'session-123',
        sessionName: 'New Name',
        parentId: null,
        branch: 'main',
        timestamp: new Date().toISOString(),
      };
      vi.mocked(mockAdapter.updateSessionName).mockResolvedValue(mockHeader);

      const result = await manager.updateSessionName(
        'my-project',
        'session-123',
        'New Name',
        'sub/path'
      );

      expect(mockAdapter.updateSessionName).toHaveBeenCalledWith(
        { projectName: 'my-project', sessionId: 'session-123', path: 'sub/path' },
        'New Name'
      );
      expect(result).toEqual(mockHeader);
    });
  });

  describe('listSessions()', () => {
    it('should delegate to adapter', async () => {
      const mockSummaries: SessionSummary[] = [
        {
          sessionId: 'session-1',
          sessionName: 'Session 1',
          filePath: '/path/to/session-1.jsonl',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          nodeCount: 5,
          branches: ['main'],
        },
      ];
      vi.mocked(mockAdapter.listSessions).mockResolvedValue(mockSummaries);

      const result = await manager.listSessions('my-project', 'sub/path');

      expect(mockAdapter.listSessions).toHaveBeenCalledWith('my-project', 'sub/path');
      expect(result).toEqual(mockSummaries);
    });
  });

  describe('listProjects()', () => {
    it('should delegate to adapter', async () => {
      vi.mocked(mockAdapter.listProjects).mockResolvedValue(['project-1', 'project-2']);

      const result = await manager.listProjects();

      expect(mockAdapter.listProjects).toHaveBeenCalled();
      expect(result).toEqual(['project-1', 'project-2']);
    });
  });

  describe('appendMessage()', () => {
    it('should delegate to adapter with correct input', async () => {
      const mockResult = {
        sessionId: 'session-123',
        node: { type: 'message', id: 'node-1' } as MessageNode,
      };
      vi.mocked(mockAdapter.appendMessage).mockResolvedValue(mockResult);

      const message = {
        role: 'user' as const,
        id: 'msg-1',
        content: [{ type: 'text' as const, content: 'Hello' }],
        timestamp: Date.now(),
      };

      const result = await manager.appendMessage({
        projectName: 'my-project',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        path: 'sub/path',
        providerOptions: { temperature: 0.5 },
      });

      expect(mockAdapter.appendMessage).toHaveBeenCalledWith({
        projectName: 'my-project',
        path: 'sub/path',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: { temperature: 0.5 },
      });
      expect(result).toEqual(mockResult);
    });

    it('should use defaults for optional fields', async () => {
      const mockResult = {
        sessionId: 'session-123',
        node: { type: 'message', id: 'node-1' } as MessageNode,
      };
      vi.mocked(mockAdapter.appendMessage).mockResolvedValue(mockResult);

      const message = {
        role: 'user' as const,
        id: 'msg-1',
        content: [{ type: 'text' as const, content: 'Hello' }],
        timestamp: Date.now(),
      };

      await manager.appendMessage({
        projectName: 'my-project',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      expect(mockAdapter.appendMessage).toHaveBeenCalledWith({
        projectName: 'my-project',
        path: '',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });
    });
  });

  describe('appendCustom()', () => {
    it('should delegate to adapter with correct input', async () => {
      const mockNode: CustomNode = {
        type: 'custom',
        id: 'custom-1',
        parentId: 'parent-1',
        branch: 'main',
        timestamp: new Date().toISOString(),
        payload: { data: 'test' },
      };
      vi.mocked(mockAdapter.appendCustom).mockResolvedValue(mockNode);

      const result = await manager.appendCustom({
        projectName: 'my-project',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        payload: { data: 'test' },
        path: 'sub/path',
      });

      expect(mockAdapter.appendCustom).toHaveBeenCalledWith({
        projectName: 'my-project',
        path: 'sub/path',
        sessionId: 'session-123',
        parentId: 'parent-1',
        branch: 'main',
        payload: { data: 'test' },
      });
      expect(result).toEqual(mockNode);
    });
  });

  describe('getBranches()', () => {
    it('should delegate to adapter with correct location', async () => {
      const mockBranches: BranchInfo[] = [
        { name: 'main', branchPointId: null, nodeCount: 5, latestNodeId: 'node-5' },
      ];
      vi.mocked(mockAdapter.getBranches).mockResolvedValue(mockBranches);

      const result = await manager.getBranches('my-project', 'session-123', 'sub/path');

      expect(mockAdapter.getBranches).toHaveBeenCalledWith({
        projectName: 'my-project',
        sessionId: 'session-123',
        path: 'sub/path',
      });
      expect(result).toEqual(mockBranches);
    });
  });

  describe('getBranchHistory()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockHistory: SessionNode[] = [
        { type: 'session', id: 'header' } as SessionNode,
        { type: 'message', id: 'msg-1' } as SessionNode,
      ];
      vi.mocked(mockAdapter.getBranchHistory).mockResolvedValue(mockHistory);

      const result = await manager.getBranchHistory(
        'my-project',
        'session-123',
        'feature',
        'sub/path'
      );

      expect(mockAdapter.getBranchHistory).toHaveBeenCalledWith(
        { projectName: 'my-project', sessionId: 'session-123', path: 'sub/path' },
        'feature'
      );
      expect(result).toEqual(mockHistory);
    });
  });

  describe('getNode()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockNode: SessionNode = { type: 'message', id: 'node-1' } as SessionNode;
      vi.mocked(mockAdapter.getNode).mockResolvedValue(mockNode);

      const result = await manager.getNode('my-project', 'session-123', 'node-1', 'sub/path');

      expect(mockAdapter.getNode).toHaveBeenCalledWith(
        { projectName: 'my-project', sessionId: 'session-123', path: 'sub/path' },
        'node-1'
      );
      expect(result).toEqual(mockNode);
    });
  });

  describe('getLatestNode()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockNode: SessionNode = { type: 'message', id: 'latest' } as SessionNode;
      vi.mocked(mockAdapter.getLatestNode).mockResolvedValue(mockNode);

      const result = await manager.getLatestNode('my-project', 'session-123', 'main', 'sub/path');

      expect(mockAdapter.getLatestNode).toHaveBeenCalledWith(
        { projectName: 'my-project', sessionId: 'session-123', path: 'sub/path' },
        'main'
      );
      expect(result).toEqual(mockNode);
    });
  });

  describe('getMessages()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockMessages: MessageNode[] = [{ type: 'message', id: 'msg-1' } as MessageNode];
      vi.mocked(mockAdapter.getMessages).mockResolvedValue(mockMessages);

      const result = await manager.getMessages('my-project', 'session-123', 'main', 'sub/path');

      expect(mockAdapter.getMessages).toHaveBeenCalledWith(
        { projectName: 'my-project', sessionId: 'session-123', path: 'sub/path' },
        'main'
      );
      expect(result).toEqual(mockMessages);
    });
  });

  describe('searchSessions()', () => {
    it('should delegate to adapter with correct arguments', async () => {
      const mockSummaries: SessionSummary[] = [];
      vi.mocked(mockAdapter.searchSessions).mockResolvedValue(mockSummaries);

      const result = await manager.searchSessions('my-project', 'query', 'sub/path');

      expect(mockAdapter.searchSessions).toHaveBeenCalledWith('my-project', 'query', 'sub/path');
      expect(result).toEqual(mockSummaries);
    });
  });

  describe('createSessionManager()', () => {
    it('should create a SessionManager with the given adapter', () => {
      const adapter = createMockAdapter();
      const mgr = createSessionManager(adapter);

      expect(mgr).toBeInstanceOf(SessionManager);
    });
  });
});
