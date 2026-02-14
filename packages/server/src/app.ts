import { Hono } from 'hono';

import { createXPostsRepository } from './db/x-posts.repository.js';
import { createXFeedJob } from './jobs/x-feed.job.js';
import { createXRoutes } from './routes/x.js';

import type { XSource } from '@ank1015/llm-research';
import type Database from 'better-sqlite3';

export interface AppDeps {
  xSource: XSource;
  db: Database.Database;
}

/**
 * Creates and configures the Hono application.
 */
export function createApp(deps: AppDeps): Hono {
  const xPostsRepo = createXPostsRepository(deps.db);
  const xFeedJob = createXFeedJob(deps.xSource, xPostsRepo);

  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.route('/x', createXRoutes({ xFeedJob, xPostsRepo }));

  return app;
}
