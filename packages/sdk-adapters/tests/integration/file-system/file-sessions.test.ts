/**
 * Integration tests for FileSessionsAdapter
 *
 * These tests use a temporary directory for file operations.
 */

import { existsSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFileSessionsAdapter,
  FileSessionsAdapter,
} from '../../../src/file-system/file-sessions.js';

import type { Message, UserMessage } from '@ank1015/llm-types';

// Helper to create a user message
function createUserMessage(content: string): UserMessage {
  return {
    role: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    content: [{ type: 'text', content }],
  };
}

describe('FileSessionsAdapter Integration', () => {
  let adapter: FileSessionsAdapter;
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `llm-sessions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    adapter = createFileSessionsAdapter(testDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createSession', () => {
    it('should create a new session with auto-generated name', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      expect(sessionId).toBeDefined();
      expect(header.type).toBe('session');
      expect(header.id).toBe(sessionId);
      expect(header.branch).toBe('main');
      expect(header.parentId).toBeNull();
      expect(header.sessionName).toContain('Session');
    });

    it('should create a session with custom name', async () => {
      const { header } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'My Custom Session',
      });

      expect(header.sessionName).toBe('My Custom Session');
    });

    it('should create session in nested path', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
        path: 'nested/path',
      });

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: 'nested/path',
        sessionId,
      });

      expect(session).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
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
      expect(session?.header.sessionName).toBe('Test Session');
      expect(session?.nodes.length).toBe(1); // Just the header
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

  describe('deleteSession', () => {
    it('should delete an existing session', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
      });

      const deleted = await adapter.deleteSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(deleted).toBe(true);

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session).toBeUndefined();
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

  describe('updateSessionName', () => {
    it('should update the session name', async () => {
      const { sessionId } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Original Name',
      });

      const updated = await adapter.updateSessionName(
        { projectName: 'test-project', path: '', sessionId },
        'New Name'
      );

      expect(updated?.sessionName).toBe('New Name');

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session?.header.sessionName).toBe('New Name');
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions', async () => {
      const sessions = await adapter.listSessions('test-project');
      expect(sessions).toEqual([]);
    });

    it('should list all sessions in a project', async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Session 1' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Session 2' });
      await adapter.createSession({ projectName: 'other-project', sessionName: 'Session 3' });

      const sessions = await adapter.listSessions('test-project');

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.sessionName)).toContain('Session 1');
      expect(sessions.map((s) => s.sessionName)).toContain('Session 2');
    });

    it('should return sessions sorted by updatedAt descending', async () => {
      const { sessionId: id1 } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'First',
      });

      // Add a delay and append to second session to make it "newer"
      const { sessionId: id2 } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Second',
      });

      // Append message to second session to update its mtime
      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId: id2,
        parentId: id2,
        branch: 'main',
        message: createUserMessage('test'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const older = new Date('2025-01-01T00:00:00.000Z');
      const newer = new Date('2025-01-01T00:00:10.000Z');
      utimesSync(join(testDir, 'test-project', `${id1}.jsonl`), older, older);
      utimesSync(join(testDir, 'test-project', `${id2}.jsonl`), newer, newer);

      const sessions = await adapter.listSessions('test-project');

      // Second session should be first (most recently updated)
      expect(sessions[0]?.sessionName).toBe('Second');
    });
  });

  describe('listProjects', () => {
    it('should return empty array when no projects', async () => {
      const projects = await adapter.listProjects();
      expect(projects).toEqual([]);
    });

    it('should list all projects', async () => {
      await adapter.createSession({ projectName: 'project-a' });
      await adapter.createSession({ projectName: 'project-b' });
      await adapter.createSession({ projectName: 'project-c' });

      const projects = await adapter.listProjects();

      expect(projects).toContain('project-a');
      expect(projects).toContain('project-b');
      expect(projects).toContain('project-c');
    });
  });

  describe('appendMessage', () => {
    it('should append a message to a session', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const message = createUserMessage('Hello!');
      const { node } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      expect(node.type).toBe('message');
      expect(node.parentId).toBe(header.id);
      expect(node.branch).toBe('main');
      expect(node.message).toEqual(message);

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session?.nodes.length).toBe(2);
    });

    it('should auto-create session if not exists', async () => {
      const message = createUserMessage('Hello!');
      const { sessionId, node } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        parentId: 'dummy', // Will be ignored for new session
        branch: 'main',
        message,
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      expect(sessionId).toBeDefined();

      const session = await adapter.getSession({
        projectName: 'test-project',
        path: '',
        sessionId,
      });
      expect(session).toBeDefined();
    });
  });

  describe('appendCustom', () => {
    it('should append a custom node', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const customNode = await adapter.appendCustom({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        payload: { type: 'bookmark', note: 'Important point' },
      });

      expect(customNode?.type).toBe('custom');
      expect(customNode?.payload).toEqual({ type: 'bookmark', note: 'Important point' });
    });

    it('should return undefined for non-existent session', async () => {
      const result = await adapter.appendCustom({
        projectName: 'test-project',
        path: '',
        sessionId: 'non-existent',
        parentId: 'dummy',
        branch: 'main',
        payload: {},
      });

      expect(result).toBeUndefined();
    });
  });

  describe('branching', () => {
    let sessionId: string;
    let headerId: string;
    let msg1Id: string;
    let msg2Id: string;

    beforeEach(async () => {
      // Create a session with a linear history on main branch
      const { sessionId: sid, header } = await adapter.createSession({
        projectName: 'test-project',
        sessionName: 'Branch Test',
      });
      sessionId = sid;
      headerId = header.id;

      // Add messages on main branch
      const { node: node1 } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: headerId,
        branch: 'main',
        message: createUserMessage('Message 1'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });
      msg1Id = node1.id;

      const { node: node2 } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: msg1Id,
        branch: 'main',
        message: createUserMessage('Message 2'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });
      msg2Id = node2.id;
    });

    it('should create a new branch from a message', async () => {
      // Create a branch from msg1
      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: msg1Id,
        branch: 'feature-branch',
        message: createUserMessage('Branch message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const branches = await adapter.getBranches({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(branches?.length).toBe(2);
      expect(branches?.map((b) => b.name)).toContain('main');
      expect(branches?.map((b) => b.name)).toContain('feature-branch');

      const featureBranch = branches?.find((b) => b.name === 'feature-branch');
      expect(featureBranch?.branchPointId).toBe(msg1Id);
    });

    it('should get branch history', async () => {
      const history = await adapter.getBranchHistory(
        { projectName: 'test-project', path: '', sessionId },
        'main'
      );

      expect(history?.length).toBe(3); // header + 2 messages
      expect(history?.[0]?.type).toBe('session');
      expect(history?.[1]?.type).toBe('message');
      expect(history?.[2]?.type).toBe('message');
    });

    it('should get separate history for each branch', async () => {
      // Add message to feature branch
      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: msg1Id,
        branch: 'feature',
        message: createUserMessage('Feature message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const mainHistory = await adapter.getBranchHistory(
        { projectName: 'test-project', path: '', sessionId },
        'main'
      );
      const featureHistory = await adapter.getBranchHistory(
        { projectName: 'test-project', path: '', sessionId },
        'feature'
      );

      expect(mainHistory?.length).toBe(3);
      expect(featureHistory?.length).toBe(1); // Only the feature message
    });
  });

  describe('getNode and getLatestNode', () => {
    it('should get a specific node by ID', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      const { node } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Test message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const retrieved = await adapter.getNode(
        { projectName: 'test-project', path: '', sessionId },
        node.id
      );

      expect(retrieved?.id).toBe(node.id);
      expect(retrieved?.type).toBe('message');
    });

    it('should get latest node in session', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('First'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const { node: lastNode } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Last'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const latest = await adapter.getLatestNode({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(latest?.id).toBe(lastNode.id);
    });

    it('should get latest node on specific branch', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Main message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const { node: featureNode } = await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'feature',
        message: createUserMessage('Feature message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const latestFeature = await adapter.getLatestNode(
        { projectName: 'test-project', path: '', sessionId },
        'feature'
      );

      expect(latestFeature?.id).toBe(featureNode.id);
    });
  });

  describe('getMessages', () => {
    it('should get all message nodes', async () => {
      const { sessionId, header } = await adapter.createSession({
        projectName: 'test-project',
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Message 1'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      await adapter.appendMessage({
        projectName: 'test-project',
        path: '',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Message 2'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const messages = await adapter.getMessages({
        projectName: 'test-project',
        path: '',
        sessionId,
      });

      expect(messages?.length).toBe(2);
      expect(messages?.every((m) => m.type === 'message')).toBe(true);
    });

    it('should filter messages by branch', async () => {
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
        modelId: 'claude-haiku-4-5',
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
        modelId: 'claude-haiku-4-5',
        providerOptions: {},
      });

      const mainMessages = await adapter.getMessages(
        { projectName: 'test-project', path: '', sessionId },
        'main'
      );

      expect(mainMessages?.length).toBe(1);
      expect(mainMessages?.[0]?.branch).toBe('main');
    });
  });

  describe('searchSessions', () => {
    beforeEach(async () => {
      await adapter.createSession({ projectName: 'test-project', sessionName: 'React Tutorial' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'Vue.js Guide' });
      await adapter.createSession({ projectName: 'test-project', sessionName: 'React Components' });
    });

    it('should search sessions by name', async () => {
      const results = await adapter.searchSessions('test-project', 'React');

      expect(results.length).toBe(2);
      expect(results.every((s) => s.sessionName.includes('React'))).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const results = await adapter.searchSessions('test-project', 'react');

      expect(results.length).toBe(2);
    });

    it('should return empty array for no matches', async () => {
      const results = await adapter.searchSessions('test-project', 'Angular');

      expect(results).toEqual([]);
    });
  });

  describe('directory management', () => {
    it('should return correct base directory', () => {
      expect(adapter.getSessionsBaseDir()).toBe(testDir);
    });
  });
});
