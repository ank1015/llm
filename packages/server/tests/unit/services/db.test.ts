/**
 * DbService unit tests
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Api, BaseAssistantMessage } from '@ank1015/llm-types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock the home directory to use a temp directory for tests
const TEST_HOME = join(tmpdir(), `llm-test-db-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

// Import after mocking
const { DbService } = await import('../../../src/services/db.js');

/**
 * Create a mock BaseAssistantMessage for testing
 */
function createMockMessage<TApi extends Api>(
  api: TApi,
  overrides: Partial<BaseAssistantMessage<TApi>> = {}
): BaseAssistantMessage<TApi> {
  const base: BaseAssistantMessage<TApi> = {
    role: 'assistant',
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    api,
    model: {
      id: `test-model-${api}`,
      name: `Test Model (${api})`,
      api,
      baseUrl: 'https://api.test.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
      tools: ['function_calling'],
    },
    message: {} as BaseAssistantMessage<TApi>['message'],
    timestamp: Date.now(),
    duration: 1500,
    stopReason: 'stop',
    content: [{ type: 'response', content: [{ type: 'text', content: 'Test response' }] }],
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0.0001, output: 0.0001, cacheRead: 0, cacheWrite: 0, total: 0.0002 },
    },
  };

  return { ...base, ...overrides } as BaseAssistantMessage<TApi>;
}

describe('DbService', () => {
  beforeAll(() => {
    // Create test home directory
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterAll(() => {
    // Close database and clean up
    DbService.close();
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Close and remove database after each test
    DbService.close();
    const dbPath = DbService.getDbPath();
    const dbDir = join(dbPath, '..');
    if (existsSync(dbDir)) {
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  describe('init', () => {
    it('should initialize the database without error', () => {
      expect(() => DbService.init()).not.toThrow();
    });

    it('should create the database file', () => {
      DbService.init();
      expect(existsSync(DbService.getDbPath())).toBe(true);
    });
  });

  describe('saveMessage and getMessage', () => {
    it('should save and retrieve a message', () => {
      const message = createMockMessage('anthropic');
      DbService.saveMessage(message);

      const retrieved = DbService.getMessage(message.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(message.id);
      expect(retrieved?.api).toBe('anthropic');
      expect(retrieved?.stopReason).toBe('stop');
    });

    it('should save messages for different providers', () => {
      const anthropicMsg = createMockMessage('anthropic', { id: 'msg-anthropic' });
      const openaiMsg = createMockMessage('openai', { id: 'msg-openai' });
      const googleMsg = createMockMessage('google', { id: 'msg-google' });

      DbService.saveMessage(anthropicMsg);
      DbService.saveMessage(openaiMsg);
      DbService.saveMessage(googleMsg);

      expect(DbService.getMessage('msg-anthropic')?.api).toBe('anthropic');
      expect(DbService.getMessage('msg-openai')?.api).toBe('openai');
      expect(DbService.getMessage('msg-google')?.api).toBe('google');
    });

    it('should update an existing message with same ID', () => {
      const message = createMockMessage('anthropic', { id: 'msg-update-test' });
      DbService.saveMessage(message);

      const updatedMessage = createMockMessage('anthropic', {
        id: 'msg-update-test',
        stopReason: 'length',
      });
      DbService.saveMessage(updatedMessage);

      const retrieved = DbService.getMessage('msg-update-test');
      expect(retrieved?.stopReason).toBe('length');
    });

    it('should return undefined for non-existent message', () => {
      expect(DbService.getMessage('non-existent-id')).toBeUndefined();
    });

    it('should preserve usage data', () => {
      const message = createMockMessage('anthropic', {
        usage: {
          input: 500,
          output: 250,
          cacheRead: 100,
          cacheWrite: 50,
          totalTokens: 900,
          cost: { input: 0.005, output: 0.005, cacheRead: 0.001, cacheWrite: 0.001, total: 0.012 },
        },
      });
      DbService.saveMessage(message);

      const retrieved = DbService.getMessage(message.id);
      expect(retrieved?.usage.input).toBe(500);
      expect(retrieved?.usage.output).toBe(250);
      expect(retrieved?.usage.cacheRead).toBe(100);
      expect(retrieved?.usage.cacheWrite).toBe(50);
      expect(retrieved?.usage.cost.total).toBeCloseTo(0.012);
    });

    it('should preserve content', () => {
      const message = createMockMessage('anthropic', {
        content: [
          { type: 'thinking', thinkingText: 'Let me think...' },
          { type: 'response', content: [{ type: 'text', content: 'Here is my answer' }] },
        ],
      });
      DbService.saveMessage(message);

      const retrieved = DbService.getMessage(message.id);
      expect(retrieved?.content).toHaveLength(2);
      expect(retrieved?.content[0]?.type).toBe('thinking');
      expect(retrieved?.content[1]?.type).toBe('response');
    });

    it('should handle errorMessage', () => {
      const message = createMockMessage('anthropic', {
        stopReason: 'error',
        errorMessage: 'API rate limit exceeded',
      });
      DbService.saveMessage(message);

      const retrieved = DbService.getMessage(message.id);
      expect(retrieved?.stopReason).toBe('error');
      expect(retrieved?.errorMessage).toBe('API rate limit exceeded');
    });
  });

  describe('getMessages', () => {
    it('should return all messages when no filters', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-1' }));
      DbService.saveMessage(createMockMessage('openai', { id: 'msg-2' }));
      DbService.saveMessage(createMockMessage('google', { id: 'msg-3' }));

      const messages = DbService.getMessages();
      expect(messages).toHaveLength(3);
    });

    it('should filter by api', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-1' }));
      DbService.saveMessage(createMockMessage('openai', { id: 'msg-2' }));
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-3' }));

      const messages = DbService.getMessages({ api: 'anthropic' });
      expect(messages).toHaveLength(2);
      expect(messages.every((m) => m.api === 'anthropic')).toBe(true);
    });

    it('should filter by modelId', () => {
      DbService.saveMessage(
        createMockMessage('anthropic', {
          id: 'msg-1',
          model: { ...createMockMessage('anthropic').model, id: 'claude-3' },
        })
      );
      DbService.saveMessage(
        createMockMessage('anthropic', {
          id: 'msg-2',
          model: { ...createMockMessage('anthropic').model, id: 'claude-4' },
        })
      );

      const messages = DbService.getMessages({ modelId: 'claude-3' });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.model.id).toBe('claude-3');
    });

    it('should limit results', () => {
      for (let i = 0; i < 10; i++) {
        DbService.saveMessage(createMockMessage('anthropic', { id: `msg-${i}` }));
      }

      const messages = DbService.getMessages({ limit: 5 });
      expect(messages).toHaveLength(5);
    });

    it('should support offset', () => {
      for (let i = 0; i < 10; i++) {
        DbService.saveMessage(
          createMockMessage('anthropic', { id: `msg-${i}`, timestamp: Date.now() + i })
        );
      }

      const allMessages = DbService.getMessages({ limit: 10 });
      const offsetMessages = DbService.getMessages({ limit: 5, offset: 3 });

      expect(offsetMessages).toHaveLength(5);
      expect(offsetMessages[0]?.id).toBe(allMessages[3]?.id);
    });

    it('should filter by time range', () => {
      const baseTime = Date.now();
      DbService.saveMessage(
        createMockMessage('anthropic', { id: 'msg-1', timestamp: baseTime - 10000 })
      );
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-2', timestamp: baseTime }));
      DbService.saveMessage(
        createMockMessage('anthropic', { id: 'msg-3', timestamp: baseTime + 10000 })
      );

      const messages = DbService.getMessages({
        startTime: baseTime - 5000,
        endTime: baseTime + 5000,
      });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('msg-2');
    });

    it('should order by timestamp descending', () => {
      const baseTime = Date.now();
      DbService.saveMessage(
        createMockMessage('anthropic', { id: 'msg-old', timestamp: baseTime - 10000 })
      );
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-new', timestamp: baseTime }));

      const messages = DbService.getMessages();
      expect(messages[0]?.id).toBe('msg-new');
      expect(messages[1]?.id).toBe('msg-old');
    });
  });

  describe('deleteMessage', () => {
    it('should delete an existing message', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-to-delete' }));
      expect(DbService.getMessage('msg-to-delete')).toBeDefined();

      const deleted = DbService.deleteMessage('msg-to-delete');
      expect(deleted).toBe(true);
      expect(DbService.getMessage('msg-to-delete')).toBeUndefined();
    });

    it('should return false for non-existent message', () => {
      const deleted = DbService.deleteMessage('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getUsageStats', () => {
    it('should return zero stats for empty database', () => {
      const stats = DbService.getUsageStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(Object.keys(stats.byApi)).toHaveLength(0);
    });

    it('should calculate total stats', () => {
      DbService.saveMessage(
        createMockMessage('anthropic', {
          id: 'msg-1',
          usage: {
            input: 100,
            output: 50,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 150,
            cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
          },
        })
      );
      DbService.saveMessage(
        createMockMessage('openai', {
          id: 'msg-2',
          usage: {
            input: 200,
            output: 100,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 300,
            cost: { input: 0.02, output: 0.04, cacheRead: 0, cacheWrite: 0, total: 0.06 },
          },
        })
      );

      const stats = DbService.getUsageStats();
      expect(stats.totalMessages).toBe(2);
      expect(stats.totalInputTokens).toBe(300);
      expect(stats.totalOutputTokens).toBe(150);
      expect(stats.totalCost).toBeCloseTo(0.09);
    });

    it('should group stats by api', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-1' }));
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-2' }));
      DbService.saveMessage(createMockMessage('openai', { id: 'msg-3' }));

      const stats = DbService.getUsageStats();
      expect(stats.byApi['anthropic']?.messages).toBe(2);
      expect(stats.byApi['openai']?.messages).toBe(1);
    });

    it('should filter stats by api', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-1' }));
      DbService.saveMessage(createMockMessage('openai', { id: 'msg-2' }));

      const stats = DbService.getUsageStats({ api: 'anthropic' });
      expect(stats.totalMessages).toBe(1);
      expect(Object.keys(stats.byApi)).toHaveLength(1);
      expect(stats.byApi['anthropic']).toBeDefined();
    });

    it('should filter stats by time range', () => {
      const baseTime = Date.now();
      DbService.saveMessage(
        createMockMessage('anthropic', { id: 'msg-1', timestamp: baseTime - 10000 })
      );
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-2', timestamp: baseTime }));

      const stats = DbService.getUsageStats({ startTime: baseTime - 5000 });
      expect(stats.totalMessages).toBe(1);
    });
  });

  describe('getDbPath', () => {
    it('should return the database file path', () => {
      const dbPath = DbService.getDbPath();
      expect(dbPath).toContain('.llm');
      expect(dbPath).toContain('usages');
      expect(dbPath).toContain('messages.db');
    });
  });

  describe('close', () => {
    it('should close the database without error', () => {
      DbService.init();
      expect(() => DbService.close()).not.toThrow();
    });

    it('should allow reopening after close', () => {
      DbService.saveMessage(createMockMessage('anthropic', { id: 'msg-before-close' }));
      DbService.close();

      // Should reinitialize on next operation
      const retrieved = DbService.getMessage('msg-before-close');
      expect(retrieved).toBeDefined();
    });
  });
});
