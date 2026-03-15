/**
 * Unit tests for FileSessionsAdapter
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SessionNotFoundError, InvalidParentError, PathTraversalError } from '@ank1015/llm-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileSessionsAdapter, createFileSessionsAdapter } from '../../src/file-sessions.js';

import type { Message } from '@ank1015/llm-types';

/**
 * Create a mock user message for testing
 */
function createUserMessage(text: string): Message {
  return {
    role: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    content: [{ type: 'text', content: text }],
  };
}

/**
 * Create a mock assistant message for testing
 */
function createAssistantMessage(text: string): Message {
  return {
    role: 'assistant',
    id: `asst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    api: 'anthropic',
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      api: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: ['function'],
    },
    message: {} as any,
    timestamp: Date.now(),
    duration: 1000,
    stopReason: 'stop',
    content: [{ type: 'response', content: [{ type: 'text', content: text }] }],
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0.0003, output: 0.00075, cacheRead: 0, cacheWrite: 0, total: 0.00105 },
    },
  };
}

describe('FileSessionsAdapter', () => {
  let testDir: string;
  let adapter: FileSessionsAdapter;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-sessions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    adapter = new FileSessionsAdapter(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createSession()', () => {
    it('should create a new session with generated ID', async () => {
      const result = await adapter.createSession({
        projectName: 'test-project',
      });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(result.header.type).toBe('session');
      expect(result.header.id).toBe(result.sessionId);
      expect(result.header.branch).toBe('main');
      expect(result.header.parentId).toBeNull();
    });

    it('should use provided session name', async () => {
      const result = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'My Custom Session',
      });

      expect(result.header.sessionName).toBe('My Custom Session');
    });

    it('should generate default session name if not provided', async () => {
      const result = await adapter.createSession({
        projectName: 'test-project',
      });

      expect(result.header.sessionName).toContain('Session');
    });

    it('should create session file on disk', async () => {
      const result = await adapter.createSession({
        projectName: 'test-project',
      });

      const filePath = join(testDir, 'test-project', `${result.sessionId}.jsonl`);
      expect(existsSync(filePath)).toBe(true);
    });

    it('should create session in nested path', async () => {
      const result = await adapter.createSession({
        projectName: 'test-project',
        path: 'sub/folder',
      });

      const filePath = join(testDir, 'test-project', 'sub', 'folder', `${result.sessionId}.jsonl`);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('getSession()', () => {
    it('should return session with all nodes', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Test Session',
      });

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(session).toBeDefined();
      expect(session?.header.id).toBe(sessionId);
      expect(session?.header.sessionName).toBe('Test Session');
      expect(session?.nodes).toHaveLength(1); // Just the header
      expect(session?.location.projectName).toBe('test-project');
    });

    it('should return undefined for non-existent session', async () => {
      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId: 'non-existent',
      });

      expect(session).toBeUndefined();
    });
  });

  describe('deleteSession()', () => {
    it('should delete existing session', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
      });

      const deleted = await adapter.deleteSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(deleted).toBe(true);
      expect(
        await adapter.getSession({
          projectName: 'test-project',
          path: '',
          sessionId,
        })
      ).toBeUndefined();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await adapter.deleteSession({
        projectName: 'test-project',
        path: '',
        sessionId: 'non-existent',
      });

      expect(deleted).toBe(false);
    });
  });

  describe('updateSessionName()', () => {
    it('should update session name', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Original Name',
      });

      const updatedHeader = await adapter.updateSessionName(
        { projectName: 'test-project', path: '', sessionId },
        'New Name'
      );

      expect(updatedHeader?.sessionName).toBe('New Name');

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session?.header.sessionName).toBe('New Name');
    });

    it('should return undefined for non-existent session', async () => {
      const result = await adapter.updateSessionName(
        { projectName: 'test-project', path: '', sessionId: 'non-existent' },
        'New Name'
      );

      expect(result).toBeUndefined();
    });
  });

  describe('listSessions()', () => {
    it('should return empty array for empty project', async () => {
      const sessions = await adapter.listSessions('empty-project');
      expect(sessions).toEqual([]);
    });

    it('should list all sessions in project', async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Session 1' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Session 2' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Session 3' });

      const sessions = await adapter.listSessions('test-project');

      expect(sessions).toHaveLength(3);
      const names = sessions.map((s) => s.sessionName);
      expect(names).toContain('Session 1');
      expect(names).toContain('Session 2');
      expect(names).toContain('Session 3');
    });

    it('should include session metadata', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Metadata Test',
      });

      const sessions = await adapter.listSessions('test-project');
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session).toBeDefined();
      expect(session?.sessionName).toBe('Metadata Test');
      expect(session?.nodeCount).toBe(1);
      expect(session?.branches).toContain('main');
      expect(session?.createdAt).toBeDefined();
      expect(session?.updatedAt).toBeDefined();
    });

    it('should list sessions in specific path', async () => {
      await adapter.createSession({ projectName: 'test-project', path: 'folder-a' });
      await adapter.createSession({ projectName: 'test-project', path: 'folder-b' });

      const sessionsA = await adapter.listSessions('test-project', 'folder-a');
      const sessionsB = await adapter.listSessions('test-project', 'folder-b');

      expect(sessionsA).toHaveLength(1);
      expect(sessionsB).toHaveLength(1);
    });
  });

  describe('listProjects()', () => {
    it('should return empty array when no projects', async () => {
      const projects = await adapter.listProjects();
      expect(projects).toEqual([]);
    });

    it('should list all projects', async () => {
      await adapter.createSession({ projectName: 'project-1' });
      await adapter.createSession({ projectName: 'project-2' });
      await adapter.createSession({ projectName: 'project-3' });

      const projects = await adapter.listProjects();

      expect(projects).toHaveLength(3);
      expect(projects).toContain('project-1');
      expect(projects).toContain('project-2');
      expect(projects).toContain('project-3');
    });
  });

  describe('appendMessage()', () => {
    it('should append message to existing session', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const message = createUserMessage('Hello');
      const { node } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      expect(node.type).toBe('message');
      expect(node.message).toEqual(message);
      expect(node.parentId).toBe(header.id);
      expect(node.branch).toBe('main');

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session?.nodes).toHaveLength(2);
    });

    it('should auto-create session when sessionId is omitted', async () => {
      // First create a session to get a valid header id, then use appendMessage
      // with no sessionId to test auto-creation
      const { sessionId: createdId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const message = createUserMessage('Hello');
      const { sessionId, node } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId: createdId,
        parentId: header.id,
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      expect(sessionId).toBe(createdId);
      expect(node).toBeDefined();

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session).toBeDefined();
      expect(session?.nodes).toHaveLength(2);
    });

    it('should throw SessionNotFoundError when sessionId is provided but missing', async () => {
      const message = createUserMessage('Hello');
      await expect(
        adapter.appendMessage({
          projectName: 'test-project',
          path: '',
          sessionId: 'nonexistent-id',
          parentId: 'some-parent',
          branch: 'main',
          message,
          api: 'anthropic',
          modelId: 'claude-sonnet-4-20250514',
          providerOptions: {},
        })
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw InvalidParentError when parentId does not exist', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
      });

      const message = createUserMessage('Hello');
      await expect(
        adapter.appendMessage({
          projectName: 'test-project',
          path: '',
          sessionId,
          parentId: 'nonexistent-parent',
          branch: 'main',
          message,
          api: 'anthropic',
          modelId: 'claude-sonnet-4-20250514',
          providerOptions: {},
        })
      ).rejects.toThrow(InvalidParentError);
    });
  });

  describe('appendCustom()', () => {
    it('should append custom node to session', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const node = await adapter.appendCustom({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        payload: { customData: 'test', value: 123 },
      });

      expect(node).toBeDefined();
      expect(node?.type).toBe('custom');
      expect(node?.payload).toEqual({ customData: 'test', value: 123 });
    });

    it('should return undefined for non-existent session', async () => {
      const node = await adapter.appendCustom({
        projectName: 'test-project',
        path: '',
        sessionId: 'non-existent',
        parentId: 'parent',
        branch: 'main',
        payload: {},
      });

      expect(node).toBeUndefined();
    });

    it('should throw InvalidParentError when parentId does not exist', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
      });

      await expect(
        adapter.appendCustom({
          projectName: 'test-project',
          path: '',
          sessionId,
          parentId: 'nonexistent-parent',
          branch: 'main',
          payload: { data: true },
        })
      ).rejects.toThrow(InvalidParentError);
    });
  });

  describe('getBranches()', () => {
    it('should return branch info for session', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Hello'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const branches = await adapter.getBranches({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(branches).toBeDefined();
      expect(branches).toHaveLength(1);
      expect(branches?.[0]?.name).toBe('main');
      expect(branches?.[0]?.nodeCount).toBe(2);
    });

    it('should return multiple branches', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      // Add to main branch
      const { node: mainNode } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Main message'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      // Create a new branch from header
      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'feature',
        message: createUserMessage('Feature message'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const branches = await adapter.getBranches({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(branches).toHaveLength(2);
      const branchNames = branches?.map((b) => b.name);
      expect(branchNames).toContain('main');
      expect(branchNames).toContain('feature');
    });

    it('should return undefined for non-existent session', async () => {
      const branches = await adapter.getBranches({
        projectName: 'test-project',
        path: '',
        sessionId: 'non-existent',
      });

      expect(branches).toBeUndefined();
    });
  });

  describe('getBranchHistory()', () => {
    it('should return linear history for branch', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const { node: node1 } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('First'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: node1.id,
        branch: 'main',
        message: createAssistantMessage('Second'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const history = await adapter.getBranchHistory(
        { projectName: 'test-project', path: '', sessionId },
        'main'
      );

      expect(history).toHaveLength(3); // header + 2 messages
      expect(history?.[0]?.type).toBe('session');
      expect(history?.[1]?.type).toBe('message');
      expect(history?.[2]?.type).toBe('message');
    });

    it('should return undefined for non-existent session', async () => {
      const history = await adapter.getBranchHistory(
        { projectName: 'test-project', path: '', sessionId: 'non-existent' },
        'main'
      );

      expect(history).toBeUndefined();
    });
  });

  describe('getNode()', () => {
    it('should return specific node by ID', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const { node: messageNode } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Test'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const node = await adapter.getNode(
        { projectName: 'test-project', path: '', sessionId },
        messageNode.id
      );

      expect(node).toBeDefined();
      expect(node?.id).toBe(messageNode.id);
    });

    it('should return undefined for non-existent node', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
      });

      const node = await adapter.getNode(
        { projectName: 'test-project', path: '', sessionId },
        'non-existent'
      );

      expect(node).toBeUndefined();
    });
  });

  describe('getLatestNode()', () => {
    it('should return the most recent node', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const { node: node1 } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('First'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const { node: node2 } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: node1.id,
        branch: 'main',
        message: createAssistantMessage('Second'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const latest = await adapter.getLatestNode({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(latest?.id).toBe(node2.id);
    });

    it('should filter by branch', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Main'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const { node: featureNode } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'feature',
        message: createUserMessage('Feature'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const latest = await adapter.getLatestNode(
        { projectName: 'test-project', path: '', sessionId },
        'feature'
      );

      expect(latest?.id).toBe(featureNode.id);
    });
  });

  describe('getMessages()', () => {
    it('should return only message nodes', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Message'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      await adapter.appendCustom({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        payload: { custom: true },
      });

      const messages = await adapter.getMessages({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(messages).toHaveLength(1);
      expect(messages?.[0]?.type).toBe('message');
    });

    it('should filter by branch', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Main'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'feature',
        message: createUserMessage('Feature'),
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        providerOptions: {},
      });

      const mainMessages = await adapter.getMessages(
        { projectName: 'test-project', path: '', sessionId },
        'main'
      );

      expect(mainMessages).toHaveLength(1);
    });
  });

  describe('searchSessions()', () => {
    it('should find sessions by name', async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Alpha Session' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Beta Session' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Alpha Beta' });

      const results = await adapter.searchSessions('test-project', 'alpha');

      expect(results).toHaveLength(2);
      const names = results.map((s) => s.sessionName);
      expect(names).toContain('Alpha Session');
      expect(names).toContain('Alpha Beta');
    });

    it('should be case-insensitive', async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'My Session' });

      const results = await adapter.searchSessions('test-project', 'MY');

      expect(results).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Test' });

      const results = await adapter.searchSessions('test-project', 'xyz');

      expect(results).toEqual([]);
    });
  });

  describe('getSessionsBaseDir()', () => {
    it('should return the configured base directory', () => {
      expect(adapter.getSessionsBaseDir()).toBe(testDir);
    });
  });

  describe('createFileSessionsAdapter()', () => {
    it('should create adapter with custom directory', () => {
      const customAdapter = createFileSessionsAdapter(testDir);
      expect(customAdapter.getSessionsBaseDir()).toBe(testDir);
    });

    it('should create adapter with default directory when not specified', () => {
      const defaultAdapter = createFileSessionsAdapter();
      expect(defaultAdapter.getSessionsBaseDir()).toContain('.llm');
      expect(defaultAdapter.getSessionsBaseDir()).toContain('sessions');
    });
  });

  describe('path traversal protection', () => {
    it('should throw PathTraversalError for projectName with ../', async () => {
      await expect(adapter.createSession({ projectName: '../../etc' })).rejects.toThrow(
        PathTraversalError
      );
    });

    it('should throw PathTraversalError for path with ../', async () => {
      await expect(
        adapter.createSession({ projectName: 'valid', path: '../../../etc' })
      ).rejects.toThrow(PathTraversalError);
    });

    it('should throw PathTraversalError for absolute projectName', async () => {
      await expect(adapter.createSession({ projectName: '/etc/passwd' })).rejects.toThrow(
        PathTraversalError
      );
    });

    it('should throw PathTraversalError for sessionId with ../', async () => {
      await expect(
        adapter.getSession({ projectName: 'valid', path: '', sessionId: '../../../etc/passwd' })
      ).rejects.toThrow(PathTraversalError);
    });
  });
});
