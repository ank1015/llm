import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { setConfig } from '../../../src/core/config.js';
import { pathExists } from '../../../src/core/storage/fs.js';
import {
  mockCreateAllTools,
  mockCreateSystemPrompt,
  resetAgentMocks,
} from '../../helpers/mock-agents.js';

// Mock the Conversation class so we don't make real LLM calls
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

const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { Project } = await import('../../../src/core/project/project.js');
const { Session } = await import('../../../src/core/session/session.js');

let projectsRoot: string;
let dataRoot: string;

const PROJECT_NAME = 'test-project';
const ARTIFACT_DIR_NAME = 'research';

beforeEach(async () => {
  resetAgentMocks();
  projectsRoot = await mkdtemp(join(tmpdir(), 'test-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'test-data-'));
  setConfig({ projectsRoot, dataRoot });

  await Project.create({ name: PROJECT_NAME });
  await ArtifactDir.create(PROJECT_NAME, { name: ARTIFACT_DIR_NAME });

  mockPrompt.mockReset();
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('Session', () => {
  describe('create', () => {
    it('should create a session and write metadata', async () => {
      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Test Session',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.api).toBe('anthropic');
      expect(session.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('should persist session metadata to disk', async () => {
      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Persisted Session',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const metadata = await session.getMetadata();
      expect(metadata.id).toBe(session.sessionId);
      expect(metadata.name).toBe('Persisted Session');
      expect(metadata.api).toBe('anthropic');
      expect(metadata.modelId).toBe('claude-sonnet-4-20250514');
      expect(metadata.createdAt).toBeDefined();
      expect(metadata.activeBranch).toBe('main');
    });

    it('should use default name when not provided', async () => {
      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        api: 'openai',
        modelId: 'gpt-5.2',
      });

      const metadata = await session.getMetadata();
      expect(metadata.name).toBe('Untitled Session');
      expect(metadata.activeBranch).toBe('main');
    });

    it('should store session files in the data path', async () => {
      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const metaDir = join(
        dataRoot,
        PROJECT_NAME,
        'artifacts',
        ARTIFACT_DIR_NAME,
        'sessions',
        'meta',
        session.sessionId
      );
      expect(await pathExists(metaDir)).toBe(true);
    });
  });

  describe('getById', () => {
    it('should load session with correct api and modelId from metadata', async () => {
      const created = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Load Test',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const loaded = await Session.getById(PROJECT_NAME, ARTIFACT_DIR_NAME, created.sessionId);

      expect(loaded.sessionId).toBe(created.sessionId);
      expect(loaded.api).toBe('anthropic');
      expect(loaded.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('should throw if session does not exist', async () => {
      await expect(Session.getById(PROJECT_NAME, ARTIFACT_DIR_NAME, 'nonexistent')).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('list', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await Session.list(PROJECT_NAME, ARTIFACT_DIR_NAME);
      expect(sessions).toEqual([]);
    });

    it('should list created sessions', async () => {
      await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Session A',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });
      await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Session B',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const sessions = await Session.list(PROJECT_NAME, ARTIFACT_DIR_NAME);
      expect(sessions).toHaveLength(2);
    });
  });

  describe('prompt', () => {
    it('should call Conversation.prompt and save messages', async () => {
      const mockUserMsg = {
        role: 'user' as const,
        id: 'user-1',
        content: [{ type: 'text' as const, content: 'Hello' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant' as const,
        id: 'asst-1',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-20250514', api: 'anthropic' },
        content: [{ type: 'response', content: [{ type: 'text', content: 'Hi there!' }] }],
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

      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Prompt Test',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const messages = await session.prompt({ message: 'Hello' });

      expect(mockPrompt).toHaveBeenCalledWith('Hello');
      expect(messages).toHaveLength(2);
    });

    it('should persist messages to session history', async () => {
      const mockUserMsg = {
        role: 'user' as const,
        id: 'user-2',
        content: [{ type: 'text' as const, content: 'Test' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant' as const,
        id: 'asst-2',
        api: 'anthropic',
        model: { id: 'claude-sonnet-4-20250514', api: 'anthropic' },
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

      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'History Test',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      await session.prompt({ message: 'Test' });

      const history = await session.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.role).toBe('user');
      expect(history[1]?.role).toBe('assistant');
    });

    it('should persist per-turn api and model overrides on saved nodes', async () => {
      const mockUserMsg = {
        role: 'user' as const,
        id: 'user-override',
        content: [{ type: 'text' as const, content: 'Switch models' }],
        timestamp: Date.now(),
      };
      const mockAssistantMsg = {
        role: 'assistant' as const,
        id: 'asst-override',
        api: 'claude-code',
        model: { id: 'claude-opus-4-6', api: 'claude-code' },
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

      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        name: 'Override Test',
        api: 'codex',
        modelId: 'gpt-5.3-codex',
      });

      await session.prompt({
        message: 'Switch models',
        api: 'claude-code',
        modelId: 'claude-opus-4-6',
        reasoningLevel: 'medium',
      });

      const historyNodes = await session.getHistoryNodes();
      expect(historyNodes).toHaveLength(2);
      expect(historyNodes[0]?.api).toBe('claude-code');
      expect(historyNodes[0]?.modelId).toBe('claude-opus-4-6');
      expect(historyNodes[1]?.api).toBe('claude-code');
      expect(historyNodes[1]?.modelId).toBe('claude-opus-4-6');
    });

    it('should use the shared agents package prompt and tools', async () => {
      mockPrompt.mockResolvedValue([]);

      await Project.create({ name: 'My Project' });
      await ArtifactDir.create('my-project', { name: 'Research Docs' });
      const session = await Session.create('my-project', 'research-docs', {
        name: 'Shared Agent Test',
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      await session.prompt({ message: 'Inspect the artifact' });

      expect(mockCreateAllTools).toHaveBeenCalledWith(
        join(projectsRoot, 'my-project', 'research-docs')
      );
      expect(mockCreateSystemPrompt).toHaveBeenCalledWith({
        projectName: 'My Project',
        projectDir: join(projectsRoot, 'my-project'),
        artifactName: 'Research Docs',
        artifactDir: join(projectsRoot, 'my-project', 'research-docs'),
      });
    });
  });

  describe('getHistory', () => {
    it('should return empty array for new session', async () => {
      const session = await Session.create(PROJECT_NAME, ARTIFACT_DIR_NAME, {
        api: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
      });

      const history = await session.getHistory();
      expect(history).toEqual([]);
    });
  });
});
