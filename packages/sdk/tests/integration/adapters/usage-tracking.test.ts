/**
 * Integration tests for usage tracking with complete/stream
 *
 * Tests end-to-end usage tracking with real API calls.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSqliteUsageAdapter, SqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { complete, stream, getModel } from '../../../src/index.js';

import type { Context } from '@ank1015/llm-types';

describe('Usage Tracking Integration', () => {
  let usageAdapter: SqliteUsageAdapter;
  let testDir: string;

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-usage-track-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    usageAdapter = createSqliteUsageAdapter(join(testDir, 'usage.db'));
  });

  afterEach(() => {
    usageAdapter.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('complete with usageAdapter', () => {
    it.skipIf(!anthropicApiKey)(
      'should track usage after completion',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: "Say 'test' and nothing else." }],
            },
          ],
        };

        const response = await complete(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 50,
          },
          usageAdapter,
        });

        // Verify response
        expect(response.api).toBe('anthropic');
        expect(response.id).toBeDefined();

        // Verify usage was tracked
        const tracked = await usageAdapter.getMessage(response.id);
        expect(tracked).toBeDefined();
        expect(tracked?.id).toBe(response.id);
        expect(tracked?.api).toBe('anthropic');
        expect(tracked?.usage.input).toBeGreaterThan(0);
        expect(tracked?.usage.output).toBeGreaterThan(0);
      },
      30000
    );

    it.skipIf(!anthropicApiKey)(
      'should accumulate stats across multiple calls',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        // Make multiple calls
        for (let i = 0; i < 3; i++) {
          const context: Context = {
            messages: [
              {
                role: 'user',
                id: `test-msg-${i}`,
                content: [{ type: 'text', content: `Say '${i}'` }],
              },
            ],
          };

          await complete(model!, context, {
            providerOptions: {
              apiKey: anthropicApiKey,
              max_tokens: 20,
            },
            usageAdapter,
          });
        }

        // Verify stats
        const stats = await usageAdapter.getStats();
        expect(stats.totalMessages).toBe(3);
        expect(stats.tokens.input).toBeGreaterThan(0);
        expect(stats.tokens.output).toBeGreaterThan(0);
        expect(stats.cost.total).toBeGreaterThan(0);

        // Verify byApi
        expect(stats.byApi['anthropic']).toBeDefined();
        expect(stats.byApi['anthropic']?.messages).toBe(3);

        // Verify byModel
        expect(stats.byModel['claude-haiku-4-5']).toBeDefined();
        expect(stats.byModel['claude-haiku-4-5']?.messages).toBe(3);
      },
      60000
    );
  });

  describe('stream with usageAdapter', () => {
    it.skipIf(!anthropicApiKey)(
      'should track usage after streaming completes',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'stream-msg-1',
              content: [{ type: 'text', content: "Say 'streaming test'" }],
            },
          ],
        };

        const eventStream = await stream(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 50,
          },
          usageAdapter,
        });

        // Consume the stream
        for await (const _ of eventStream) {
          // Just consume events
        }

        // Get the result (this triggers usage tracking)
        const response = await eventStream.result();

        expect(response.api).toBe('anthropic');

        // Verify usage was tracked
        const tracked = await usageAdapter.getMessage(response.id);
        expect(tracked).toBeDefined();
        expect(tracked?.id).toBe(response.id);
        expect(tracked?.usage.input).toBeGreaterThan(0);
      },
      30000
    );
  });

  describe('without usageAdapter', () => {
    it.skipIf(!anthropicApiKey)(
      'should not track when adapter not provided',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'no-track-msg',
              content: [{ type: 'text', content: "Say 'no tracking'" }],
            },
          ],
        };

        const response = await complete(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 50,
          },
          // No usageAdapter provided
        });

        expect(response.api).toBe('anthropic');

        // Verify nothing was tracked
        const stats = await usageAdapter.getStats();
        expect(stats.totalMessages).toBe(0);
      },
      30000
    );
  });
});
