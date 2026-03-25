import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CancelSessionRunResponseSchema,
  SessionMessagesResponseSchema,
  SessionMetadataDtoSchema,
  SessionNameResponseSchema,
  SessionPromptResponseSchema,
  SessionSummaryDtoSchema,
  SessionTreeResponseSchema,
  StreamConflictResponseSchema,
  StreamDoneEventDataSchema,
  StreamReadyEventDataSchema,
} from '@ank1015/llm-app-contracts';
import { Value } from '@sinclair/typebox/value';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setConfig } from '../../../src/core/config.js';
import { resetSessionRunRegistry } from '../../../src/core/session/run-registry.js';
import { resetAgentMocks } from '../../helpers/mock-agents.js';

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
      promptMessage: vi.fn((message: unknown, callback?: (msg: unknown) => Promise<void>) =>
        mockPrompt(message, undefined, callback)
      ),
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
const { app } = await import('../../../src/index.js');

let projectsRoot: string;
let dataRoot: string;

const PROJECT = 'test-project';
const ARTIFACT = 'research';
const BASE = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/sessions`;
const PDF_ATTACHMENT = {
  id: 'pdf-1',
  type: 'file' as const,
  fileName: 'research-paper.pdf',
  mimeType: 'application/pdf',
  size: 8,
  content: Buffer.from('%PDF-test').toString('base64'),
};

beforeEach(async () => {
  resetAgentMocks();
  resetSessionRunRegistry();
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
  resetSessionRunRegistry();
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
      expect(Value.Check(SessionMetadataDtoSchema, body)).toBe(true);
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
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('should list created sessions', async () => {
      await createSession('Session A');
      await createSession('Session B');

      const res = await get(BASE);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.every((session: unknown) => Value.Check(SessionSummaryDtoSchema, session))).toBe(
        true
      );
      expect(body[0]).not.toHaveProperty('filePath');
      expect(body[0]).not.toHaveProperty('branches');
    });
  });

  describe('GET /api/.../sessions/:sessionId', () => {
    it('should return session metadata', async () => {
      const created = await createSession('Fetch Me');

      const res = await get(`${BASE}/${created.id}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Value.Check(SessionMetadataDtoSchema, body)).toBe(true);
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
      const body = await res.json();
      expect(Value.Check(SessionMessagesResponseSchema, body)).toBe(true);
      expect(body).toEqual([]);
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
      expect(Value.Check(SessionTreeResponseSchema, body)).toBe(true);
      expect(body.nodes).toHaveLength(6);
      expect(body.activeBranch).not.toBe('main');

      const persistedLeafNode = body.nodes.find((node: { id: string }) => {
        return node.id === body.persistedLeafNodeId;
      });
      expect(persistedLeafNode?.message.id).toBe('asst-tree-branch');
    });

    it('should include liveRun metadata while a detached stream is active', async () => {
      const created = await createSession();
      const mockUserMsg = {
        role: 'user',
        id: 'user-live-run',
        content: [{ type: 'text', content: 'Live run prompt' }],
        timestamp: Date.now(),
      };
      let rejectPrompt: ((error: Error) => void) | undefined;

      mockPrompt.mockImplementationOnce(
        async (
          _prompt: string,
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(mockUserMsg);
          return await new Promise<never>((_resolve, reject) => {
            rejectPrompt = reject;
          });
        }
      );
      mockAbort.mockImplementationOnce(() => {
        rejectPrompt?.(new Error('aborted'));
      });

      const streamRes = await post(`${BASE}/${created.id}/stream`, { message: 'Live run prompt' });
      const treeRes = await get(`${BASE}/${created.id}/tree`);

      expect(treeRes.status).toBe(200);
      const treeBody = await treeRes.json();
      expect(Value.Check(SessionTreeResponseSchema, treeBody)).toBe(true);
      expect(treeBody.liveRun).toBeDefined();
      expect(treeBody.liveRun.status).toBe('running');
      expect(treeBody.liveRun.mode).toBe('prompt');

      const cancelRes = await post(
        `${BASE}/${created.id}/runs/${treeBody.liveRun.runId}/cancel`,
        {}
      );
      expect(cancelRes.status).toBe(200);
      await streamRes.text();
    });
  });

  describe('POST /api/.../sessions/:sessionId/prompt', () => {
    it('should return 400 when message is missing', async () => {
      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('message or attachments are required');
    });

    it('should allow attachment-only prompts and persist uploaded files into the artifact', async () => {
      const mockAssistantMsg = {
        role: 'assistant' as const,
        id: 'asst-attachment-prompt',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Loaded the PDF.' }] }],
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop' as const,
        timestamp: Date.now(),
        duration: 100,
        message: {},
      };
      mockPrompt.mockResolvedValue([mockAssistantMsg]);

      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/prompt`, {
        attachments: [PDF_ATTACHMENT],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0]?.role).toBe('user');

      const userBlocks = body[0]?.content ?? [];
      expect(
        userBlocks.some(
          (block: { type: string; metadata?: Record<string, unknown> }) =>
            block.type === 'text' && block.metadata?.hiddenFromUI === true
        )
      ).toBe(true);
      expect(
        userBlocks.some(
          (block: { type: string; metadata?: Record<string, unknown> }) =>
            block.type === 'file' &&
            block.metadata?.artifactRelativePath === '.max/user-artifacts/research-paper.pdf'
        )
      ).toBe(true);
      expect(
        await readFile(
          join(projectsRoot, PROJECT, ARTIFACT, '.max', 'user-artifacts', 'research-paper.pdf'),
          'utf-8'
        )
      ).toBe('%PDF-test');

      const savedRes = await get(`${BASE}/${created.id}/messages`);
      const savedBody = await savedRes.json();
      expect(
        savedBody[0]?.message?.content?.some((block: { type: string }) => block.type === 'file')
      ).toBe(true);
      expect(
        savedBody[0]?.message?.content?.some(
          (block: { type: string; metadata?: Record<string, unknown> }) =>
            block.type === 'text' && block.metadata?.hiddenFromUI === true
        )
      ).toBe(true);
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
      expect(Value.Check(SessionPromptResponseSchema, body)).toBe(true);
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
      expect(Value.Check(SessionMessagesResponseSchema, body)).toBe(true);
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
      expect(body.error).toBe('message or attachments are required');
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

    it('should stream attachment-only prompts and persist uploaded files into the artifact', async () => {
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-stream-attachment',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'PDF loaded' }] }],
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
          userMessage: { role: string; content: Array<{ type: string }> },
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(userMessage);
          await callback(mockAssistantMsg);
          return [userMessage, mockAssistantMsg];
        }
      );

      const created = await createSession();

      const res = await post(`${BASE}/${created.id}/stream`, {
        attachments: [PDF_ATTACHMENT],
      });

      expect(res.status).toBe(200);
      const events = parseSseEvents(await res.text());
      expect(events.some((event) => event.event === 'done')).toBe(true);

      const savedRes = await get(`${BASE}/${created.id}/messages`);
      const savedBody = await savedRes.json();
      const userBlocks = savedBody[0]?.message?.content ?? [];
      expect(
        userBlocks.some(
          (block: { type: string; metadata?: Record<string, unknown> }) =>
            block.type === 'file' &&
            block.metadata?.artifactRelativePath === '.max/user-artifacts/research-paper.pdf'
        )
      ).toBe(true);
      expect(
        await readFile(
          join(projectsRoot, PROJECT, ARTIFACT, '.max', 'user-artifacts', 'research-paper.pdf'),
          'utf-8'
        )
      ).toBe('%PDF-test');
    });

    it('should return SSE stream with ready, agent_event, node_persisted, and done events', async () => {
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
      expect(Value.Check(StreamReadyEventDataSchema, events[0]?.data)).toBe(true);
      expect(events[0]?.data.ok).toBe(true);
      expect(events[0]?.data.sessionId).toBe(created.id);
      expect((events[0]?.data as { runId?: string }).runId).toBeDefined();
      expect((events[0]?.data as { status?: string }).status).toBe('running');

      const nodePersistedEvents = events.filter((e) => e.event === 'node_persisted');
      expect(nodePersistedEvents).toHaveLength(2);

      // Last event should be 'done'
      const doneEvent = events.find((e) => e.event === 'done');
      expect(doneEvent).toBeDefined();
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);
      expect(doneEvent?.data.ok).toBe(true);
      expect(doneEvent?.data.messageCount).toBe(2);
      expect((doneEvent?.data as { status?: string }).status).toBe('completed');
    });

    it('should replay buffered events from the run attach endpoint', async () => {
      const mockUserMsg = {
        role: 'user',
        id: 'user-stream-replay',
        content: [{ type: 'text', content: 'Replay this run' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant',
        id: 'asst-stream-replay',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Replay result' }] }],
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
          await callback(mockUserMsg);
          await callback(mockAssistantMsg);
          await new Promise((resolve) => setTimeout(resolve, 20));
          return [mockUserMsg, mockAssistantMsg];
        }
      );
      mockSubscribe.mockImplementationOnce((handler: (event: unknown) => void) => {
        setTimeout(() => {
          handler({ type: 'message_update', messageType: 'assistant', message: mockAssistantMsg });
        }, 10);
        return vi.fn();
      });

      const created = await createSession();
      const startRes = await post(`${BASE}/${created.id}/stream`, { message: 'Replay this run' });
      const startEvents = parseSseEvents(await startRes.text());
      const runId = (startEvents[0]?.data as { runId?: string } | undefined)?.runId;

      expect(runId).toBeDefined();

      const attachRes = await get(`${BASE}/${created.id}/runs/${runId}/stream`);
      expect(attachRes.status).toBe(200);

      const replayEvents = parseSseEvents(await attachRes.text());
      expect(replayEvents[0]?.event).toBe('ready');
      expect(Value.Check(StreamReadyEventDataSchema, replayEvents[0]?.data)).toBe(true);
      expect(replayEvents.some((event) => event.event === 'agent_event')).toBe(true);
      expect(replayEvents.filter((event) => event.event === 'node_persisted')).toHaveLength(2);
      const doneEvent = replayEvents.find((event) => event.event === 'done');
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);
      expect(doneEvent?.data).toMatchObject({
        ok: true,
        sessionId: created.id,
        runId,
        status: 'completed',
        messageCount: 2,
      });
    });

    it('should cancel a live run through the cancel endpoint', async () => {
      const created = await createSession();

      let rejectPrompt: ((error: Error) => void) | undefined;
      mockPrompt.mockImplementationOnce(
        async () =>
          await new Promise<never>((_resolve, reject) => {
            rejectPrompt = reject;
          })
      );
      mockAbort.mockImplementationOnce(() => {
        rejectPrompt?.(new Error('aborted'));
      });

      const streamRes = await post(`${BASE}/${created.id}/stream`, { message: 'Stop this run' });
      const treeRes = await get(`${BASE}/${created.id}/tree`);
      const treeBody = await treeRes.json();
      const runId = treeBody.liveRun?.runId as string | undefined;

      expect(runId).toBeDefined();

      const cancelRes = await post(`${BASE}/${created.id}/runs/${runId}/cancel`, {});
      expect(cancelRes.status).toBe(200);
      expect(Value.Check(CancelSessionRunResponseSchema, await cancelRes.clone().json())).toBe(
        true
      );

      const streamEvents = parseSseEvents(await streamRes.text());
      const doneEvent = streamEvents.find((event) => event.event === 'done');
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);
      expect(doneEvent?.data).toMatchObject({
        ok: true,
        sessionId: created.id,
        runId,
        status: 'cancelled',
      });
    }, 45_000);

    it('should return 409 with liveRun metadata when another run is already active', async () => {
      const created = await createSession();

      mockPrompt.mockImplementationOnce(
        async () =>
          await new Promise<unknown[]>((resolve) => {
            setTimeout(() => {
              resolve([]);
            }, 50);
          })
      );

      const firstRunRes = await post(`${BASE}/${created.id}/stream`, { message: 'First run' });
      const duplicateRes = await post(`${BASE}/${created.id}/stream`, { message: 'Second run' });

      expect(duplicateRes.status).toBe(409);
      const duplicateBody = await duplicateRes.json();
      expect(Value.Check(StreamConflictResponseSchema, duplicateBody)).toBe(true);
      expect(duplicateBody.error).toBe('A stream is already running for this session.');
      expect(duplicateBody.liveRun).toBeDefined();
      expect(duplicateBody.liveRun.status).toBe('running');

      await firstRunRes.text();
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
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);

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
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);

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
      expect(Value.Check(StreamDoneEventDataSchema, doneEvent?.data)).toBe(true);

      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      expect(history).toHaveLength(4);
      expect(history[2]?.message.id).toBe('user-leaf-edit');
      expect(history[3]?.message.id).toBe('asst-leaf-edit');
    });

    it('should reject new attachments when editing a message', async () => {
      const created = await createSession();
      const res = await post(`${BASE}/${created.id}/messages/missing/edit/stream`, {
        message: 'Edited text',
        attachments: [PDF_ATTACHMENT],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('attachments are not supported when editing a message');
    });

    it('should edit an attachment-only user message without duplicating persisted files', async () => {
      const created = await createSession();
      const originalAssistantMsg = {
        role: 'assistant',
        id: 'asst-attachment-original',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [
          { type: 'response', content: [{ type: 'text', content: 'Original attachment turn' }] },
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
      mockPrompt.mockResolvedValueOnce([originalAssistantMsg]);

      await post(`${BASE}/${created.id}/prompt`, { attachments: [PDF_ATTACHMENT] });
      const historyRes = await get(`${BASE}/${created.id}/messages`);
      const history = await historyRes.json();
      const userNodeId = history[0]?.id as string;
      const initialFiles = await readdir(
        join(projectsRoot, PROJECT, ARTIFACT, '.max', 'user-artifacts')
      );

      const editedAssistantMsg = {
        role: 'assistant',
        id: 'asst-attachment-edited',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-5', api: 'anthropic' },
        content: [
          { type: 'response', content: [{ type: 'text', content: 'Edited attachment turn' }] },
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
          userMessage: {
            role: string;
            content: Array<{ type: string; metadata?: Record<string, unknown> }>;
          },
          _attachments: unknown,
          callback: (msg: unknown) => Promise<void>
        ) => {
          await callback(userMessage);
          await callback(editedAssistantMsg);
          return [userMessage, editedAssistantMsg];
        }
      );

      const res = await post(`${BASE}/${created.id}/messages/${userNodeId}/edit/stream`, {
        message: '',
      });

      expect(res.status).toBe(200);
      await res.text();

      const updatedHistoryRes = await get(`${BASE}/${created.id}/messages`);
      const updatedHistory = await updatedHistoryRes.json();
      const editedBlocks = updatedHistory[0]?.message?.content ?? [];
      expect(
        editedBlocks.some(
          (block: { type: string; metadata?: Record<string, unknown> }) =>
            block.type === 'text' && block.metadata?.hiddenFromUI === true
        )
      ).toBe(true);
      expect(editedBlocks.some((block: { type: string }) => block.type === 'file')).toBe(true);

      const finalFiles = await readdir(
        join(projectsRoot, PROJECT, ARTIFACT, '.max', 'user-artifacts')
      );
      expect(finalFiles).toEqual(initialFiles);
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
      expect(Value.Check(SessionNameResponseSchema, body)).toBe(true);
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
      expect(Value.Check(SessionNameResponseSchema, body)).toBe(true);
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
      expect(Value.Check(SessionNameResponseSchema, body)).toBe(true);
      expect(body.ok).toBe(true);
      // Fallback should use first 50 chars of query
      expect(body.sessionName).toBe('Help me design a web app architecture');
    });
  });
});
