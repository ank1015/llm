import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setConfig } from '../../src/core/config.js';

const mockPrompt = vi.fn();

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    Conversation: vi.fn().mockImplementation(() => ({
      setProvider: vi.fn(),
      setTools: vi.fn(),
      setSystemPrompt: vi.fn(),
      replaceMessages: vi.fn(),
      prompt: mockPrompt,
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

      // Check history
      const res = await get(`${BASE}/${created.id}/messages`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].role).toBe('user');
      expect(body[1].role).toBe('assistant');
    });
  });
});
