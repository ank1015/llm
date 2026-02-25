import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setConfig } from '../../src/core/config.js';

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

  describe('POST /api/.../sessions/:sessionId/prompt', () => {
    it('should return 400 when message is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message is required');
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
  });

  describe('POST /api/.../sessions/:sessionId/stream', () => {
    it('should return 400 when message is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message is required');
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
