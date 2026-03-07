import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setConfig } from '../../src/core/config.js';
import { resetAgentMocks } from '../helpers/mock-agents.js';

const mockPrompt = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue(vi.fn()); // returns unsubscribe
const mockAbort = vi.fn();
const mockComplete = vi.fn();

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    complete: mockComplete,
    Conversation: vi.fn().mockImplementation(() => ({
      setProvider: vi.fn(),
      setTools: vi.fn(),
      setSystemPrompt: vi.fn(),
      replaceMessages: vi.fn(),
      prompt: mockPrompt,
      subscribe: mockSubscribe,
      abort: mockAbort,
    })),
    getModel: vi.fn().mockReturnValue({
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet',
      api: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: [],
    }),
  };
});

// Import app after mock setup
const { app } = await import('../../src/index.js');

let projectsRoot: string;
let dataRoot: string;

const PROJECT = 'test-project';
const ARTIFACT = 'research';
const BASE = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/sessions`;

beforeEach(async () => {
  resetAgentMocks();
  projectsRoot = await mkdtemp(join(tmpdir(), 'test-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'test-data-'));
  setConfig({ projectsRoot, dataRoot });

  // Create project and artifact dir
  await app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PROJECT }),
  });
  await app.request(`/api/projects/${PROJECT}/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ARTIFACT }),
  });

  mockPrompt.mockReset();
  mockSubscribe.mockReset().mockReturnValue(vi.fn());
  mockAbort.mockReset();
  mockComplete.mockReset();
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return app.request(path);
}

async function createSession(name = 'Test Session') {
  const res = await post(BASE, {
    name,
    api: 'anthropic',
    modelId: 'claude-sonnet-4-5',
  });
  return res.json();
}

function parseSseEvents(text: string): Array<{ event: string | undefined; data: unknown }> {
  return text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event:'));
      const dataLine = lines.find((line) => line.startsWith('data:'));

      return {
        event: eventLine?.slice('event:'.length).trim(),
        data: dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null,
      };
    });
}

describe('Session Routes', () => {
  describe('POST /api/.../sessions', () => {
    it('should create a session and return 201', async () => {
      const res = await post(BASE, {
        name: 'My Session',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('My Session');
      expect(body.api).toBe('anthropic');
      expect(body.modelId).toBe('claude-sonnet-4-5');
      expect(body.createdAt).toBeDefined();
      expect(body.activeBranch).toBe('main');
    });

    it('should return 400 when modelId is missing', async () => {
      const res = await post(BASE, { api: 'anthropic' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('modelId and api are required');
    });

    it('should return 400 when api is missing', async () => {
      const res = await post(BASE, { modelId: 'claude-sonnet-4-5' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('modelId and api are required');
    });
  });

  describe('GET /api/.../sessions', () => {
    it('should return empty array when no sessions', async () => {
      const res = await get(BASE);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('should list created sessions', async () => {
      await createSession('Session A');
      await createSession('Session B');

      const res = await get(BASE);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /api/.../sessions/:sessionId', () => {
    it('should return session metadata', async () => {
      const created = await createSession('Fetch Me');

      const res = await get(`${BASE}/${created.id}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(created.id);
      expect(body.name).toBe('Fetch Me');
      expect(body.api).toBe('anthropic');
      expect(body.activeBranch).toBe('main');
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await get(`${BASE}/nonexistent`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/.../sessions/:sessionId/messages', () => {
    it('should return empty array for new session', async () => {
      const created = await createSession();

      const res = await get(`${BASE}/${created.id}/messages`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await get(`${BASE}/nonexistent/messages`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/.../sessions/:sessionId/tree', () => {
    it('should return the full message tree and persisted leaf metadata', async () => {
      const created = await createSession();

      mockPrompt
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-tree-1',
            content: [{ type: 'text', content: 'Tree prompt 1' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-tree-1',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Tree answer 1' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-tree-2',
            content: [{ type: 'text', content: 'Tree prompt 2' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-tree-2',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Tree answer 2' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'Tree prompt 1' });
      await post(`${BASE}/${created.id}/prompt`, { message: 'Tree prompt 2' });

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      const firstUserNodeId = history[0]?.id as string;

      const retriedUserMsg = {
        role: 'user',
        id: 'user-tree-branch',
        content: [{ type: 'text', content: 'Tree prompt 1' }],
        timestamp: Date.now(),
      };
      const retriedAssistantMsg = {
        role: 'assistant',
        id: 'asst-tree-branch',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Tree branch answer' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(retriedUserMsg);
          await callback(retriedAssistantMsg);
          return [retriedUserMsg, retriedAssistantMsg];
        }
      );

      const retryRes = await post(
        `${BASE}/${created.id}/messages/${firstUserNodeId}/retry/stream`,
        {}
      );
      expect(retryRes.status).toBe(200);
      await retryRes.text();

      const res = await get(`${BASE}/${created.id}/tree`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.nodes).toHaveLength(6);
      expect(body.activeBranch).not.toBe('main');

      const persistedLeafNode = body.nodes.find((node: { id: string }) => {
        return node.id === body.persistedLeafNodeId;
      });
      expect(persistedLeafNode?.message.id).toBe('asst-tree-branch');
    });
  });

  describe('POST /api/.../sessions/:sessionId/prompt', () => {
    it('should return 400 when message is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message is required');
    });

    it('should return 400 when api or modelId override is incomplete', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, {
        message: 'Hello',
        api: 'google',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('api and modelId must be provided together');
    });

    it('should call prompt and return new messages', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Hello' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-1',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Hi!' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockResolvedValue([mockUserMsg, mockAssistantMsg]);

      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, { message: 'Hello' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].role).toBe('user');
      expect(body[1].role).toBe('assistant');
    });

    it('should persist messages and return them via history endpoint', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'Test' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-2',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Response' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockResolvedValue([mockUserMsg, mockAssistantMsg]);

      const created = await createSession();

      // Prompt
      await post(`${BASE}/${created.id}/prompt`, { message: 'Test' });

      // Check history (returns MessageNode[] now)
      const res = await get(`${BASE}/${created.id}/messages`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].message.role).toBe('user');
      expect(body[1].message.role).toBe('assistant');
    });

    it('should persist prompt override api and model metadata', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-override-route',
        content: [{ type: 'text', content: 'Override prompt' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-override-route',
        api: 'google',
        model: { id: 'gemini-3.1-pro-preview', api: 'google' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Done' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockResolvedValue([mockUserMsg, mockAssistantMsg]);

      const created = await createSession();

      const promptRes = await post(`${BASE}/${created.id}/prompt`, {
        message: 'Override prompt',
        api: 'google',
        modelId: 'gemini-3.1-pro-preview',
        reasoningLevel: 'high',
      });

      expect(promptRes.status).toBe(200);

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history[0].api).toBe('google');
      expect(history[0].modelId).toBe('gemini-3.1-pro-preview');
      expect(history[1].api).toBe('google');
      expect(history[1].modelId).toBe('gemini-3.1-pro-preview');
    });

    it('should append from the selected leafNodeId instead of the persisted active branch', async () => {
      const created = await createSession();

      mockPrompt
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-main-1',
            content: [{ type: 'text', content: 'Main prompt 1' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-main-1',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Main answer 1' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-main-2',
            content: [{ type: 'text', content: 'Main prompt 2' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-main-2',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Main answer 2' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'Main prompt 1' });
      await post(`${BASE}/${created.id}/prompt`, { message: 'Main prompt 2' });

      const mainHistoryRes = await get(`${BASE}/${created.id}/messages`);
      const mainHistory = await mainHistoryRes.json();
      const firstUserNodeId = mainHistory[0]?.id as string;
      const mainLeafNodeId = mainHistory[3]?.id as string;

      const retryUserMsg = {
        role: 'user',
        id: 'user-main-retry',
        content: [{ type: 'text', content: 'Main prompt 1' }],
        timestamp: Date.now(),
      };
      const retryAssistantMsg = {
        role: 'assistant',
        id: 'asst-main-retry',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Retry answer' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(retryUserMsg);
          await callback(retryAssistantMsg);
          return [retryUserMsg, retryAssistantMsg];
        }
      );

      const retryRes = await post(
        `${BASE}/${created.id}/messages/${firstUserNodeId}/retry/stream`,
        {}
      );
      expect(retryRes.status).toBe(200);
      await retryRes.text();

      const followUpUserMsg = {
        role: 'user',
        id: 'user-main-3',
        content: [{ type: 'text', content: 'Continue on main branch' }],
        timestamp: Date.now(),
      };
      const followUpAssistantMsg = {
        role: 'assistant',
        id: 'asst-main-3',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [
          { type: 'response', content: [{ type: 'text', content: 'Main branch continued' }] },
        ],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockResolvedValueOnce([followUpUserMsg, followUpAssistantMsg]);

      const res = await post(`${BASE}/${created.id}/prompt`, {
        message: 'Continue on main branch',
        leafNodeId: mainLeafNodeId,
      });

      expect(res.status).toBe(200);

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history).toHaveLength(6);
      expect(history[4]?.message.id).toBe('user-main-3');
      expect(history[5]?.message.id).toBe('asst-main-3');

      const metaRes = await get(`${BASE}/${created.id}`);
      const metadata = await metaRes.json();
      expect(metadata.activeBranch).toBe('main');
    });
  });

  describe('POST /api/.../sessions/:sessionId/stream', () => {
    it('should return 400 when message is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message is required');
    });

    it('should return 400 when api or modelId override is incomplete', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, {
        message: 'Hello',
        modelId: 'gpt-5.4',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('api and modelId must be provided together');
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await post(`${BASE}/nonexistent/stream`, { message: 'Hello' });

      expect(res.status).toBe(404);
    });

    it('should return SSE stream with ready, agent_event, and done events', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-stream-1',
        content: [{ type: 'text', content: 'Hello' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-stream-1',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Hi!' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };

      // mockPrompt is called by streamPrompt() — with persistence callback
      mockPrompt.mockImplementation(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          // Simulate the conversation calling the persistence callback
          if (callback) {
            await callback(mockUserMsg);
            await callback(mockAssistantMsg);
          }
          return [mockUserMsg, mockAssistantMsg];
        }
      );

      // mockSubscribe should call the event handler with some events
      mockSubscribe.mockImplementation((handler: (event: unknown) => void) => {
        // Fire a message_update event after a tick
        setTimeout(() => {
          handler({ type: 'message_update', messageType: 'assistant', message: mockAssistantMsg });
        }, 10);
        return vi.fn(); // unsubscribe
      });

      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, { message: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');

      // Read the SSE stream
      const text = await res.text();

      // Parse SSE events
      const events = text
        .split('\n\n')
        .filter((block) => block.trim())
        .map((block) => {
          const lines = block.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event:'));
          const dataLine = lines.find((l) => l.startsWith('data:'));
          return {
            event: eventLine?.slice('event:'.length).trim(),
            data: dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null,
          };
        });

      // First event should be 'ready'
      expect(events[0]?.event).toBe('ready');
      expect(events[0]?.data.ok).toBe(true);
      expect(events[0]?.data.sessionId).toBe(created.id);

      // Last event should be 'done'
      const doneEvent = events.find((e) => e.event === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent?.data.ok).toBe(true);
      expect(doneEvent?.data.messageCount).toBe(2);
    });

    it('should persist stream override api and model metadata', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-stream-override',
        content: [{ type: 'text', content: 'Switch stream model' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-stream-override',
        api: 'claude-code',
        model: { id: 'claude-sonnet-4-6', api: 'claude-code' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Done' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };

      mockPrompt.mockImplementation(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(mockUserMsg);
          await callback(mockAssistantMsg);
          return [mockUserMsg, mockAssistantMsg];
        }
      );

      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, {
        message: 'Switch stream model',
        api: 'claude-code',
        modelId: 'claude-sonnet-4-6',
        reasoningLevel: 'xhigh',
      });

      expect(res.status).toBe(200);
      await res.text();

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history[0].api).toBe('claude-code');
      expect(history[0].modelId).toBe('claude-sonnet-4-6');
      expect(history[1].api).toBe('claude-code');
      expect(history[1].modelId).toBe('claude-sonnet-4-6');
    });
  });

  describe('POST /api/.../sessions/:sessionId/messages/:nodeId/.../stream', () => {
    it('should retry from a user node and switch the active path to the hidden branch', async () => {
      const created = await createSession();

      mockPrompt
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'First prompt' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-1',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'First answer' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-2',
            content: [{ type: 'text', content: 'Second prompt' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-2',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Second answer' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'First prompt' });
      await post(`${BASE}/${created.id}/prompt`, { message: 'Second prompt' });

      const originalHistoryRes = await get(`${BASE}/${created.id}/messages`);
      const originalHistory = await originalHistoryRes.json();
      const firstUserNodeId = originalHistory[0]?.id as string;

      const retriedUserMsg = {
        role: 'user',
        id: 'user-1-retry',
        content: [{ type: 'text', content: 'First prompt' }],
        timestamp: Date.now(),
      };
      const retriedAssistantMsg = {
        role: 'assistant',
        id: 'asst-1-retry',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Retried answer' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(retriedUserMsg);
          await callback(retriedAssistantMsg);
          return [retriedUserMsg, retriedAssistantMsg];
        }
      );

      const res = await post(`${BASE}/${created.id}/messages/${firstUserNodeId}/retry/stream`, {});

      expect(res.status).toBe(200);
      const events = parseSseEvents(await res.text());
      const doneEvent = events.find((event) => event.event === 'done');
      expect(doneEvent).toBeDefined();

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history).toHaveLength(2);
      expect(history[0]?.message.id).toBe('user-1-retry');
      expect(history[1]?.message.id).toBe('asst-1-retry');

      const metaRes = await get(`${BASE}/${created.id}`);
      const metadata = await metaRes.json();
      expect(metadata.activeBranch).not.toBe('main');
    });

    it('should edit from a user node and return the rewritten active path', async () => {
      const created = await createSession();

      mockPrompt.mockResolvedValueOnce([
        {
          role: 'user',
          id: 'user-edit-1',
          content: [{ type: 'text', content: 'Original prompt' }],
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          id: 'asst-edit-1',
          api: 'anthropic',
          model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
          content: [{ type: 'response', content: [{ type: 'text', content: 'Original answer' }] }],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
          duration: 100,
          message: {},
        },
      ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'Original prompt' });
      const originalHistoryRes = await get(`${BASE}/${created.id}/messages`);
      const originalHistory = await originalHistoryRes.json();
      const userNodeId = originalHistory[0]?.id as string;

      const editedUserMsg = {
        role: 'user',
        id: 'user-edit-1-rewrite',
        content: [{ type: 'text', content: 'Edited prompt' }],
        timestamp: Date.now(),
      };
      const editedAssistantMsg = {
        role: 'assistant',
        id: 'asst-edit-1-rewrite',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Edited answer' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(editedUserMsg);
          await callback(editedAssistantMsg);
          return [editedUserMsg, editedAssistantMsg];
        }
      );

      const res = await post(`${BASE}/${created.id}/messages/${userNodeId}/edit/stream`, {
        message: 'Edited prompt',
      });

      expect(res.status).toBe(200);
      const events = parseSseEvents(await res.text());
      const doneEvent = events.find((event) => event.event === 'done');
      expect(doneEvent).toBeDefined();

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history).toHaveLength(2);
      expect(history[0]?.message.content[0]?.content).toBe('Edited prompt');
      expect(history[1]?.message.id).toBe('asst-edit-1-rewrite');
    });

    it('should validate retry and edit targets against the provided leafNodeId path', async () => {
      const created = await createSession();

      mockPrompt
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-leaf-main-1',
            content: [{ type: 'text', content: 'Leaf prompt 1' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-leaf-main-1',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Leaf answer 1' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ])
        .mockResolvedValueOnce([
          {
            role: 'user',
            id: 'user-leaf-main-2',
            content: [{ type: 'text', content: 'Leaf prompt 2' }],
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            id: 'asst-leaf-main-2',
            api: 'anthropic',
            model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
            content: [{ type: 'response', content: [{ type: 'text', content: 'Leaf answer 2' }] }],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
            duration: 100,
            message: {},
          },
        ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'Leaf prompt 1' });
      await post(`${BASE}/${created.id}/prompt`, { message: 'Leaf prompt 2' });

      const mainHistoryRes = await get(`${BASE}/${created.id}/messages`);
      const mainHistory = await mainHistoryRes.json();
      const firstUserNodeId = mainHistory[0]?.id as string;
      const secondUserNodeId = mainHistory[2]?.id as string;
      const mainLeafNodeId = mainHistory[3]?.id as string;

      const retryUserMsg = {
        role: 'user',
        id: 'user-leaf-retry',
        content: [{ type: 'text', content: 'Leaf prompt 1' }],
        timestamp: Date.now(),
      };
      const retryAssistantMsg = {
        role: 'assistant',
        id: 'asst-leaf-retry',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [
          { type: 'response', content: [{ type: 'text', content: 'Retry branch answer' }] },
        ],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(retryUserMsg);
          await callback(retryAssistantMsg);
          return [retryUserMsg, retryAssistantMsg];
        }
      );

      const retryRes = await post(
        `${BASE}/${created.id}/messages/${firstUserNodeId}/retry/stream`,
        {}
      );
      expect(retryRes.status).toBe(200);
      await retryRes.text();

      const editedUserMsg = {
        role: 'user',
        id: 'user-leaf-edit',
        content: [{ type: 'text', content: 'Leaf prompt 2 edited' }],
        timestamp: Date.now(),
      };
      const editedAssistantMsg = {
        role: 'assistant',
        id: 'asst-leaf-edit',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [
          { type: 'response', content: [{ type: 'text', content: 'Edited from main path' }] },
        ],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(editedUserMsg);
          await callback(editedAssistantMsg);
          return [editedUserMsg, editedAssistantMsg];
        }
      );

      const res = await post(`${BASE}/${created.id}/messages/${secondUserNodeId}/edit/stream`, {
        message: 'Leaf prompt 2 edited',
        leafNodeId: mainLeafNodeId,
      });

      expect(res.status).toBe(200);
      const events = parseSseEvents(await res.text());
      const doneEvent = events.find((event) => event.event === 'done');
      expect(doneEvent).toBeDefined();

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history).toHaveLength(4);
      expect(history[2]?.message.id).toBe('user-leaf-edit');
      expect(history[3]?.message.id).toBe('asst-leaf-edit');
    });

    it('should reject empty edit messages before streaming starts', async () => {
      const created = await createSession();
      const res = await post(`${BASE}/${created.id}/messages/missing/edit/stream`, {
        message: '',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message is required');
    });

    it('should emit an SSE error when retry target is not a user node', async () => {
      const created = await createSession();

      mockPrompt.mockResolvedValueOnce([
        {
          role: 'user',
          id: 'user-invalid-target',
          content: [{ type: 'text', content: 'Hello' }],
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          id: 'asst-invalid-target',
          api: 'anthropic',
          model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
          content: [{ type: 'response', content: [{ type: 'text', content: 'Hi' }] }],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
          duration: 100,
          message: {},
        },
      ]);

      await post(`${BASE}/${created.id}/prompt`, { message: 'Hello' });
      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      const assistantNodeId = history[1]?.id as string;

      const res = await post(`${BASE}/${created.id}/messages/${assistantNodeId}/retry/stream`, {});

      expect(res.status).toBe(200);
      const events = parseSseEvents(await res.text());
      const errorEvent = events.find((event) => event.event === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.data as { message: string }).message).toBe(
        'Only user messages can be edited or retried'
      );
    });
  });

  describe('PATCH /api/.../sessions/:sessionId/name', () => {
    it('should return 400 when name is missing', async () => {
      const created = await createSession();

      const res = await patch(`${BASE}/${created.id}/name`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('name is required and must be non-empty');
    });

    it('should update the session name', async () => {
      const created = await createSession('Old Name');

      const res = await patch(`${BASE}/${created.id}/name`, { name: 'New Name' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.sessionName).toBe('New Name');

      // Verify the name was persisted
      const metaRes = await get(`${BASE}/${created.id}`);
      const meta = await metaRes.json();
      expect(meta.name).toBe('New Name');
    });

    it('should return 500 for nonexistent session', async () => {
      const res = await patch(`${BASE}/nonexistent/name`, { name: 'Test' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/.../sessions/:sessionId/generate-name', () => {
    it('should return 400 when query is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/generate-name`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('query is required');
    });

    it('should generate a name using LLM and update session', async () => {
      // Mock the complete function to return a generated name
      mockComplete.mockResolvedValue({
        role: 'assistant',
        id: 'name-resp',
        content: [
          {
            type: 'response',
            content: [{ type: 'text', content: 'Project Architecture Discussion' }],
          },
        ],
        usage: { input: 10, output: 5, totalTokens: 15, cost: { total: 0 } },
        stopReason: 'stop',
        timestamp: Date.now(),
      });

      const created = await createSession('Untitled Session');

      const res = await post(`${BASE}/${created.id}/generate-name`, {
        query: 'Can you help me design the architecture for my new web app?',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.sessionName).toBe('Project Architecture Discussion');

      // Verify the name was persisted in metadata
      const metaRes = await get(`${BASE}/${created.id}`);
      const meta = await metaRes.json();
      expect(meta.name).toBe('Project Architecture Discussion');
    });

    it('should fallback to truncated query when LLM fails', async () => {
      mockComplete.mockRejectedValue(new Error('API key not found'));

      const created = await createSession('Untitled Session');

      const res = await post(`${BASE}/${created.id}/generate-name`, {
        query: 'Help me design a web app architecture',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // Fallback should use first 50 chars of query
      expect(body.sessionName).toBe('Help me design a web app architecture');
    });
  });
});
