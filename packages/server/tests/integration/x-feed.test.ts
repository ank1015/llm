/**
 * Integration tests for X feed fetch endpoint.
 *
 * Connects to Chrome via native messaging (auto-launches if needed).
 *
 * Run with: pnpm test:integration
 */


import { connect } from '@ank1015/llm-extension';
import { createXSource } from '@ank1015/llm-research';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db/index.js';

import type Database from 'better-sqlite3';
import type { Hono } from 'hono';

let app: Hono;
let db: Database.Database;

beforeAll(async () => {
  const chrome = await connect({ launch: true });
  const xSource = createXSource({ chrome });
  db = createDb(':memory:');
  app = createApp({ xSource, db });
}, 60_000);

afterAll(() => {
  db?.close();
});

describe('X Feed Integration', () => {
  it(
    'POST /x/feed/fetch should fetch real posts from X and store in DB',
    async () => {
      const res = await app.request('/x/feed/fetch', { method: 'POST' });
      const body = (await res.json()) as { posts: unknown[]; count: number };

      expect(res.status).toBe(200);
      expect(body.count).toBeGreaterThan(0);
      expect(body.posts.length).toBe(body.count);

      // Verify posts are persisted — fetch them back via GET
      const feedRes = await app.request('/x/feed?page=1&limit=10');
      const feedBody = (await feedRes.json()) as {
        posts: unknown[];
        total: number;
        page: number;
        limit: number;
      };

      expect(feedRes.status).toBe(200);
      expect(feedBody.total).toBe(body.count);
      expect(feedBody.posts.length).toBe(body.count);
    },
    { timeout: 120_000 }
  );

  it(
    'POST /x/feed/fetch should deduplicate on subsequent calls',
    async () => {
      // First fetch
      const res1 = await app.request('/x/feed/fetch', { method: 'POST' });
      const body1 = (await res1.json()) as { count: number };
      expect(res1.status).toBe(200);

      // Get count after first fetch
      const feed1 = await app.request('/x/feed?page=1&limit=100');
      const feedBody1 = (await feed1.json()) as { total: number };
      const countAfterFirst = feedBody1.total;

      // Second fetch — may get some of the same posts
      const res2 = await app.request('/x/feed/fetch', { method: 'POST' });
      const body2 = (await res2.json()) as { count: number };
      expect(res2.status).toBe(200);

      // Total in DB should be >= first count (new posts may have appeared)
      // but should not double-count duplicates
      const feed2 = await app.request('/x/feed?page=1&limit=100');
      const feedBody2 = (await feed2.json()) as { total: number };

      expect(feedBody2.total).toBeGreaterThanOrEqual(countAfterFirst);
      expect(feedBody2.total).toBeLessThanOrEqual(body1.count + body2.count);
    },
    { timeout: 120_000 }
  );
});
