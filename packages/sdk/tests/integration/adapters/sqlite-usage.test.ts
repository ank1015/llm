/**
 * Integration tests for SqliteUsageAdapter
 *
 * These tests use a temporary database file.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSqliteUsageAdapter, SqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { BaseAssistantMessage } from '@ank1015/llm-types';

// Helper to create a mock assistant message
function createMockMessage(
  overrides: Partial<BaseAssistantMessage<'anthropic'>> = {}
): BaseAssistantMessage<'anthropic'> {
  return {
    role: 'assistant',
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    api: 'anthropic',
    model: {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      api: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3 },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: ['function'],
    },
    message: {} as BaseAssistantMessage<'anthropic'>['message'],
    timestamp: Date.now(),
    duration: 500,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        content: [{ type: 'text', content: 'Hello!' }],
      },
    ],
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: {
        input: 0.000025,
        output: 0.0000625,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0.0000875,
      },
    },
    ...overrides,
  };
}

describe('SqliteUsageAdapter Integration', () => {
  let adapter: SqliteUsageAdapter;
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `llm-usage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    adapter = createSqliteUsageAdapter(dbPath);
  });

  afterEach(() => {
    // Close adapter and clean up
    adapter.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('track and getMessage', () => {
    it('should track and retrieve a message', async () => {
      const message = createMockMessage({ id: 'test-msg-1' });
      await adapter.track(message);

      const retrieved = await adapter.getMessage<'anthropic'>('test-msg-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-msg-1');
      expect(retrieved?.api).toBe('anthropic');
      expect(retrieved?.usage.input).toBe(100);
      expect(retrieved?.usage.output).toBe(50);
    });

    it('should return undefined for non-existent message', async () => {
      const retrieved = await adapter.getMessage('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should handle message with error', async () => {
      const message = createMockMessage({
        id: 'error-msg',
        stopReason: 'error',
        errorMessage: 'Something went wrong',
      });
      await adapter.track(message);

      const retrieved = await adapter.getMessage<'anthropic'>('error-msg');
      expect(retrieved?.stopReason).toBe('error');
      expect(retrieved?.errorMessage).toBe('Something went wrong');
    });

    it('should update existing message on re-track', async () => {
      const message1 = createMockMessage({
        id: 'update-msg',
        usage: { ...createMockMessage().usage, input: 100 },
      });
      await adapter.track(message1);

      const message2 = createMockMessage({
        id: 'update-msg',
        usage: { ...createMockMessage().usage, input: 200 },
      });
      await adapter.track(message2);

      const retrieved = await adapter.getMessage<'anthropic'>('update-msg');
      expect(retrieved?.usage.input).toBe(200);
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      // Seed with test data - 2 anthropic, 1 openai
      await adapter.track(createMockMessage({ id: 'msg-1', api: 'anthropic', timestamp: 1000 }));
      await adapter.track(createMockMessage({ id: 'msg-2', api: 'anthropic', timestamp: 2000 }));
      await adapter.track(
        createMockMessage({
          id: 'msg-3',
          api: 'openai' as any,
          timestamp: 3000,
          model: { ...createMockMessage().model, id: 'gpt-4', api: 'openai' as any },
        }) as any
      );
    });

    it('should return all messages', async () => {
      const messages = await adapter.getMessages();
      expect(messages.length).toBe(3);
    });

    it('should filter by api', async () => {
      const messages = await adapter.getMessages({ api: 'anthropic' });
      expect(messages.length).toBe(2);
      expect(messages.every((m) => m.api === 'anthropic')).toBe(true);
    });

    it('should filter by time range', async () => {
      const messages = await adapter.getMessages({ startTime: 1500, endTime: 2500 });
      expect(messages.length).toBe(1);
      expect(messages[0]?.id).toBe('msg-2');
    });

    it('should apply limit', async () => {
      const messages = await adapter.getMessages({ limit: 2 });
      expect(messages.length).toBe(2);
    });

    it('should apply offset', async () => {
      const messages = await adapter.getMessages({ offset: 1, limit: 10 });
      expect(messages.length).toBe(2);
    });

    it('should order by timestamp descending', async () => {
      const messages = await adapter.getMessages();
      expect(messages[0]?.timestamp).toBeGreaterThanOrEqual(messages[1]?.timestamp ?? 0);
      expect(messages[1]?.timestamp).toBeGreaterThanOrEqual(messages[2]?.timestamp ?? 0);
    });
  });

  describe('deleteMessage', () => {
    it('should delete an existing message', async () => {
      const message = createMockMessage({ id: 'to-delete' });
      await adapter.track(message);

      const deleted = await adapter.deleteMessage('to-delete');
      expect(deleted).toBe(true);

      const retrieved = await adapter.getMessage('to-delete');
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting non-existent message', async () => {
      const deleted = await adapter.deleteMessage('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      // Seed with varied test data
      await adapter.track(
        createMockMessage({
          id: 'stat-1',
          api: 'anthropic',
          model: { ...createMockMessage().model, id: 'claude-haiku-4-5' },
          usage: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 5,
            totalTokens: 165,
            cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
          },
        })
      );
      await adapter.track(
        createMockMessage({
          id: 'stat-2',
          api: 'anthropic',
          model: { ...createMockMessage().model, id: 'claude-sonnet-4-20250514' },
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
      await adapter.track(
        createMockMessage({
          id: 'stat-3',
          api: 'openai' as any,
          model: { ...createMockMessage().model, id: 'gpt-4', api: 'openai' as any },
          usage: {
            input: 150,
            output: 75,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 225,
            cost: { input: 0.015, output: 0.03, cacheRead: 0, cacheWrite: 0, total: 0.045 },
          },
        }) as any
      );
    });

    it('should return correct totals', async () => {
      const stats = await adapter.getStats();

      expect(stats.totalMessages).toBe(3);
      expect(stats.tokens.input).toBe(450); // 100 + 200 + 150
      expect(stats.tokens.output).toBe(225); // 50 + 100 + 75
      expect(stats.tokens.cacheRead).toBe(10);
      expect(stats.tokens.cacheWrite).toBe(5);
      expect(stats.cost.total).toBeCloseTo(0.138, 5); // 0.033 + 0.06 + 0.045
    });

    it('should return correct byApi breakdown', async () => {
      const stats = await adapter.getStats();

      expect(stats.byApi['anthropic']).toBeDefined();
      expect(stats.byApi['anthropic']?.messages).toBe(2);
      expect(stats.byApi['anthropic']?.tokens.input).toBe(300);

      expect(stats.byApi['openai']).toBeDefined();
      expect(stats.byApi['openai']?.messages).toBe(1);
    });

    it('should return correct byModel breakdown', async () => {
      const stats = await adapter.getStats();

      expect(stats.byModel['claude-haiku-4-5']).toBeDefined();
      expect(stats.byModel['claude-haiku-4-5']?.messages).toBe(1);

      expect(stats.byModel['claude-sonnet-4-20250514']).toBeDefined();
      expect(stats.byModel['gpt-4']).toBeDefined();
    });

    it('should apply filters to stats', async () => {
      const stats = await adapter.getStats({ api: 'anthropic' });

      expect(stats.totalMessages).toBe(2);
      expect(stats.byApi['openai']).toBeUndefined();
    });
  });

  describe('database management', () => {
    it('should create database file', async () => {
      await adapter.track(createMockMessage());
      expect(existsSync(dbPath)).toBe(true);
    });

    it('should return correct database path', () => {
      expect(adapter.getDbPath()).toBe(dbPath);
    });

    it('should persist data across adapter instances', async () => {
      await adapter.track(createMockMessage({ id: 'persist-test' }));
      adapter.close();

      const adapter2 = createSqliteUsageAdapter(dbPath);
      const retrieved = await adapter2.getMessage('persist-test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('persist-test');

      adapter2.close();
    });
  });
});
