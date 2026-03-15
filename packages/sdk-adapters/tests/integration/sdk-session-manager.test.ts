/**
 * Integration tests for SessionManager
 *
 * Tests the SessionManager wrapper around the SessionsAdapter.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSessionManager, SessionManager } from '../../../sdk/src/session/session-manager.js';
import { createFileSessionsAdapter } from '../../src/file-sessions.js';

import type { UserMessage } from '@ank1015/llm-types';

// Helper to create a user message
function createUserMessage(content: string): UserMessage {
  return {
    role: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    content: [{ type: 'text', content }],
  };
}

describe('SessionManager Integration', () => {
  let manager: SessionManager;
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-session-mgr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    const adapter = createFileSessionsAdapter(testDir);
    manager = createSessionManager(adapter);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('session lifecycle', () => {
    it('should create, get, and delete a session', async () => {
      // Create
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
        sessionName: 'Test Session',
      });

      expect(sessionId).toBeDefined();
      expect(header.sessionName).toBe('Test Session');

      // Get
      const session = await manager.getSession('test-project', sessionId);
      expect(session).toBeDefined();
      expect(session?.header.sessionName).toBe('Test Session');

      // Delete
      const deleted = await manager.deleteSession('test-project', sessionId);
      expect(deleted).toBe(true);

      // Verify deleted
      const deletedSession = await manager.getSession('test-project', sessionId);
      expect(deletedSession).toBeUndefined();
    });

    it('should update session name', async () => {
      const { sessionId } = await manager.createSession({
        projectName: 'test-project',
        sessionName: 'Original',
      });

      const updated = await manager.updateSessionName('test-project', sessionId, 'Updated Name');
      expect(updated?.sessionName).toBe('Updated Name');

      const session = await manager.getSession('test-project', sessionId);
      expect(session?.header.sessionName).toBe('Updated Name');
    });
  });

  describe('listing', () => {
    it('should list sessions in a project', async () => {
      await manager.createSession({ projectName: 'project-a', sessionName: 'Session 1' });
      await manager.createSession({ projectName: 'project-a', sessionName: 'Session 2' });
      await manager.createSession({ projectName: 'project-b', sessionName: 'Session 3' });

      const sessionsA = await manager.listSessions('project-a');
      expect(sessionsA.length).toBe(2);

      const sessionsB = await manager.listSessions('project-b');
      expect(sessionsB.length).toBe(1);
    });

    it('should list all projects', async () => {
      await manager.createSession({ projectName: 'alpha' });
      await manager.createSession({ projectName: 'beta' });
      await manager.createSession({ projectName: 'gamma' });

      const projects = await manager.listProjects();
      expect(projects).toContain('alpha');
      expect(projects).toContain('beta');
      expect(projects).toContain('gamma');
    });

    it('should search sessions by name', async () => {
      await manager.createSession({ projectName: 'proj', sessionName: 'TypeScript Guide' });
      await manager.createSession({ projectName: 'proj', sessionName: 'JavaScript Basics' });
      await manager.createSession({ projectName: 'proj', sessionName: 'TypeScript Advanced' });

      const results = await manager.searchSessions('proj', 'TypeScript');
      expect(results.length).toBe(2);
    });
  });

  describe('message management', () => {
    it('should append and retrieve messages', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      // Append message
      const { node } = await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Hello!'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      expect(node.type).toBe('message');

      // Get messages
      const messages = await manager.getMessages('test-project', sessionId);
      expect(messages?.length).toBe(1);
    });

    it('should append custom nodes', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      const customNode = await manager.appendCustom({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        payload: { type: 'note', text: 'Important' },
      });

      expect(customNode?.type).toBe('custom');
      expect(customNode?.payload).toEqual({ type: 'note', text: 'Important' });
    });
  });

  describe('node retrieval', () => {
    it('should get a specific node', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      const { node } = await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Test'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      const retrieved = await manager.getNode('test-project', sessionId, node.id);
      expect(retrieved?.id).toBe(node.id);
    });

    it('should get latest node', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('First'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      const { node: lastNode } = await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Last'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      const latest = await manager.getLatestNode('test-project', sessionId);
      expect(latest?.id).toBe(lastNode.id);
    });
  });

  describe('branching', () => {
    it('should get branch information', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      // Add to main branch
      const { node: msg1 } = await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Main message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      // Create a new branch
      await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: msg1.id,
        branch: 'experiment',
        message: createUserMessage('Experiment message'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      const branches = await manager.getBranches('test-project', sessionId);
      expect(branches?.length).toBe(2);
      expect(branches?.map((b) => b.name)).toContain('main');
      expect(branches?.map((b) => b.name)).toContain('experiment');
    });

    it('should get branch history', async () => {
      const { sessionId, header } = await manager.createSession({
        projectName: 'test-project',
      });

      // Chain messages: header -> msg1 -> msg2
      const { node: msg1 } = await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: header.id,
        branch: 'main',
        message: createUserMessage('Message 1'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      await manager.appendMessage({
        projectName: 'test-project',
        sessionId,
        parentId: msg1.id, // Chain from msg1, not header
        branch: 'main',
        message: createUserMessage('Message 2'),
        api: 'anthropic',
        modelId: 'claude-haiku-4-5',
      });

      const history = await manager.getBranchHistory('test-project', sessionId, 'main');
      expect(history?.length).toBe(3); // header + 2 messages
    });
  });

  describe('with path parameter', () => {
    it('should handle nested paths', async () => {
      const { sessionId } = await manager.createSession({
        projectName: 'test-project',
        path: 'sub/folder',
        sessionName: 'Nested Session',
      });

      const session = await manager.getSession('test-project', sessionId, 'sub/folder');
      expect(session?.header.sessionName).toBe('Nested Session');

      const sessions = await manager.listSessions('test-project', 'sub/folder');
      expect(sessions.length).toBe(1);
    });
  });
});
