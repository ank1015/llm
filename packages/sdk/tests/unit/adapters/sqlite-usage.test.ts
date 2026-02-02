/**
 * Unit tests for SqliteUsageAdapter
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SqliteUsageAdapter,
  createSqliteUsageAdapter,
} from '../../../src/adapters/sqlite-usage.js';

import type { BaseAssistantMessage } from '@ank1015/llm-types';

/**
 * Create a mock assistant message for testing
 */
function createMockMessage(
  overrides: Partial<BaseAssistantMessage<'anthropic'>> = {}
): BaseAssistantMessage<'anthropic'> {
  const id = overrides.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    role: 'assistant',
    id,
    api: 'anthropic',
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      api: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: ['function'],
    },
    message: {
      id: 'native-id',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    } as any,
    timestamp: Date.now(),
    duration: 1000,
    stopReason: 'stop',
    content: [{ type: 'response', content: [{ type: 'text', content: 'Hello!' }] }],
    usage: {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      totalTokens: 165,
      cost: {
        input: 0.0003,
        output: 0.00075,
        cacheRead: 0.000003,
        cacheWrite: 0.00001875,
        total: 0.00107175,
      },
    },
    ...overrides,
  };
}

describe('SqliteUsageAdapter', () => {
  let testDir: string;
  let dbPath: string;
  let adapter: SqliteUsageAdapter;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `llm-usage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    adapter = new SqliteUsageAdapter(dbPath);
  });

  afterEach(() => {
    // Close database and clean up
    adapter.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('track()', () => {
    it('should store a message', async () => {
      const message = createMockMessage({ id: 'test-msg-1' });

      await adapter.track(message);

      const retrieved = await adapter.getMessage('test-msg-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-msg-1');
    });

    it('should store all message fields correctly', async () => {
      const message = createMockMessage({
        id: 'test-msg-fields',
        timestamp: 1700000000000,
        duration: 2500,
        stopReason: 'stop',
      });

      await adapter.track(message);

      const retrieved = await adapter.getMessage<'anthropic'>('test-msg-fields');
      expect(retrieved).toBeDefined();
      expect(retrieved?.api).toBe('anthropic');
      expect(retrieved?.model.id).toBe('claude-sonnet-4-20250514');
      expect(retrieved?.timestamp).toBe(1700000000000);
      expect(retrieved?.duration).toBe(2500);
      expect(retrieved?.stopReason).toBe('stop');
      expect(retrieved?.usage.input).toBe(100);
      expect(retrieved?.usage.output).toBe(50);
      expect(retrieved?.usage.cost.total).toBeCloseTo(0.00107175);
    });

    it('should store errorMessage when present', async () => {
      const message = createMockMessage({
        id: 'test-msg-error',
        stopReason: 'error',
        errorMessage: 'Something went wrong',
      });

      await adapter.track(message);

      const retrieved = await adapter.getMessage('test-msg-error');
      expect(retrieved?.errorMessage).toBe('Something went wrong');
    });

    it('should replace message with same ID', async () => {
      const message1 = createMockMessage({ id: 'same-id', duration: 1000 });
      const message2 = createMockMessage({ id: 'same-id', duration: 2000 });

      await adapter.track(message1);
      await adapter.track(message2);

      const retrieved = await adapter.getMessage('same-id');
      expect(retrieved?.duration).toBe(2000);
    });
  });

  describe('getMessage()', () => {
    it('should return undefined for non-existent message', async () => {
      const result = await adapter.getMessage('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return the message with parsed content', async () => {
      const message = createMockMessage({ id: 'content-test' });
      await adapter.track(message);

      const retrieved = await adapter.getMessage('content-test');
      expect(retrieved?.content).toEqual(message.content);
    });
  });

  describe('getMessages()', () => {
    beforeEach(async () => {
      // Insert test messages with different attributes
      await adapter.track(
        createMockMessage({
          id: 'msg-1',
          api: 'anthropic',
          timestamp: 1700000000000,
        })
      );
      await adapter.track(
        createMockMessage({
          id: 'msg-2',
          api: 'anthropic',
          timestamp: 1700000001000,
        })
      );
      await adapter.track(
        createMockMessage({
          id: 'msg-3',
          api: 'openai' as 'anthropic', // Type hack for testing
          timestamp: 1700000002000,
        })
      );
    });

    it('should return all messages without filters', async () => {
      const messages = await adapter.getMessages();
      expect(messages).toHaveLength(3);
    });

    it('should filter by api', async () => {
      const messages = await adapter.getMessages({ api: 'anthropic' });
      expect(messages).toHaveLength(2);
      expect(messages.every((m) => m.api === 'anthropic')).toBe(true);
    });

    it('should filter by startTime', async () => {
      const messages = await adapter.getMessages({ startTime: 1700000001000 });
      expect(messages).toHaveLength(2);
    });

    it('should filter by endTime', async () => {
      const messages = await adapter.getMessages({ endTime: 1700000001000 });
      expect(messages).toHaveLength(2);
    });

    it('should filter by time range', async () => {
      const messages = await adapter.getMessages({
        startTime: 1700000000500,
        endTime: 1700000001500,
      });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe('msg-2');
    });

    it('should apply limit', async () => {
      const messages = await adapter.getMessages({ limit: 2 });
      expect(messages).toHaveLength(2);
    });

    it('should apply offset', async () => {
      const messages = await adapter.getMessages({ limit: 2, offset: 1 });
      expect(messages).toHaveLength(2);
      // Messages are ordered by timestamp DESC, so offset 1 skips the most recent
      expect(messages[0]?.id).toBe('msg-2');
    });

    it('should order by timestamp descending', async () => {
      const messages = await adapter.getMessages();
      expect(messages[0]?.id).toBe('msg-3'); // Most recent first
      expect(messages[2]?.id).toBe('msg-1'); // Oldest last
    });
  });

  describe('deleteMessage()', () => {
    it('should delete an existing message', async () => {
      const message = createMockMessage({ id: 'to-delete' });
      await adapter.track(message);

      const deleted = await adapter.deleteMessage('to-delete');

      expect(deleted).toBe(true);
      expect(await adapter.getMessage('to-delete')).toBeUndefined();
    });

    it('should return false for non-existent message', async () => {
      const deleted = await adapter.deleteMessage('non-existent');
      expect(deleted).toBe(false);
    });

    it('should not affect other messages', async () => {
      await adapter.track(createMockMessage({ id: 'keep-1' }));
      await adapter.track(createMockMessage({ id: 'delete-me' }));
      await adapter.track(createMockMessage({ id: 'keep-2' }));

      await adapter.deleteMessage('delete-me');

      expect(await adapter.getMessage('keep-1')).toBeDefined();
      expect(await adapter.getMessage('keep-2')).toBeDefined();
    });
  });

  describe('getStats()', () => {
    beforeEach(async () => {
      // Insert messages with known values for testing aggregations
      await adapter.track(
        createMockMessage({
          id: 'stat-1',
          api: 'anthropic',
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
          usage: {
            input: 200,
            output: 100,
            cacheRead: 20,
            cacheWrite: 10,
            totalTokens: 330,
            cost: { input: 0.02, output: 0.04, cacheRead: 0.002, cacheWrite: 0.004, total: 0.066 },
          },
        })
      );
      await adapter.track(
        createMockMessage({
          id: 'stat-3',
          api: 'openai' as 'anthropic',
          usage: {
            input: 50,
            output: 25,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 75,
            cost: { input: 0.005, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.015 },
          },
        })
      );
    });

    it('should return correct total message count', async () => {
      const stats = await adapter.getStats();
      expect(stats.totalMessages).toBe(3);
    });

    it('should return correct total tokens', async () => {
      const stats = await adapter.getStats();
      expect(stats.tokens.input).toBe(350);
      expect(stats.tokens.output).toBe(175);
      expect(stats.tokens.cacheRead).toBe(30);
      expect(stats.tokens.cacheWrite).toBe(15);
      expect(stats.tokens.total).toBe(570);
    });

    it('should return correct total costs', async () => {
      const stats = await adapter.getStats();
      expect(stats.cost.input).toBeCloseTo(0.035);
      expect(stats.cost.output).toBeCloseTo(0.07);
      expect(stats.cost.total).toBeCloseTo(0.114);
    });

    it('should return stats grouped by API', async () => {
      const stats = await adapter.getStats();

      expect(stats.byApi['anthropic']).toBeDefined();
      expect(stats.byApi['anthropic']?.messages).toBe(2);
      expect(stats.byApi['anthropic']?.tokens.input).toBe(300);

      expect(stats.byApi['openai']).toBeDefined();
      expect(stats.byApi['openai']?.messages).toBe(1);
      expect(stats.byApi['openai']?.tokens.input).toBe(50);
    });

    it('should return stats grouped by model', async () => {
      const stats = await adapter.getStats();

      expect(stats.byModel['claude-sonnet-4-20250514']).toBeDefined();
      expect(stats.byModel['claude-sonnet-4-20250514']?.messages).toBe(3);
      expect(stats.byModel['claude-sonnet-4-20250514']?.modelName).toBe('Claude Sonnet 4');
    });

    it('should apply filters to stats', async () => {
      const stats = await adapter.getStats({ api: 'anthropic' });

      expect(stats.totalMessages).toBe(2);
      expect(stats.tokens.input).toBe(300);
    });

    it('should return zeros for empty database', async () => {
      // Create a new empty adapter
      const emptyDbPath = join(testDir, 'empty.db');
      const emptyAdapter = new SqliteUsageAdapter(emptyDbPath);

      const stats = await emptyAdapter.getStats();

      expect(stats.totalMessages).toBe(0);
      expect(stats.tokens.total).toBe(0);
      expect(stats.cost.total).toBe(0);
      expect(Object.keys(stats.byApi)).toHaveLength(0);
      expect(Object.keys(stats.byModel)).toHaveLength(0);

      emptyAdapter.close();
    });
  });

  describe('getDbPath()', () => {
    it('should return the configured database path', () => {
      expect(adapter.getDbPath()).toBe(dbPath);
    });
  });

  describe('createSqliteUsageAdapter()', () => {
    it('should create adapter with custom path', () => {
      const customPath = join(testDir, 'custom.db');
      const customAdapter = createSqliteUsageAdapter(customPath);
      expect(customAdapter.getDbPath()).toBe(customPath);
      customAdapter.close();
    });

    it('should create adapter with default path when not specified', () => {
      const defaultAdapter = createSqliteUsageAdapter();
      expect(defaultAdapter.getDbPath()).toContain('.llm');
      expect(defaultAdapter.getDbPath()).toContain('messages.db');
      defaultAdapter.close();
    });
  });

  describe('database handling', () => {
    it('should create database directory if it does not exist', () => {
      const newDir = join(testDir, 'nested', 'db', 'dir');
      const newDbPath = join(newDir, 'test.db');
      const newAdapter = new SqliteUsageAdapter(newDbPath);

      // Trigger database creation by tracking a message
      newAdapter.track(createMockMessage({ id: 'init' }));

      expect(existsSync(newDir)).toBe(true);
      newAdapter.close();
    });

    it('should persist data across adapter instances', async () => {
      const message = createMockMessage({ id: 'persist-test' });
      await adapter.track(message);
      adapter.close();

      // Create new adapter with same path
      const adapter2 = new SqliteUsageAdapter(dbPath);
      const retrieved = await adapter2.getMessage('persist-test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('persist-test');
      adapter2.close();
    });
  });
});
