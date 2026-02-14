import { connect } from '@ank1015/llm-extension';
import { createXSource } from '@ank1015/llm-research';
import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { createDb } from './db/index.js';
import { createXPostsRepository } from './db/x-posts.repository.js';
import { createXFeedJob, startJobs } from './jobs/index.js';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const xSource = createXSource({ chrome });
  const db = createDb();
  const xPostsRepo = createXPostsRepository(db);
  const xFeedJob = createXFeedJob(xSource, xPostsRepo);

  const app = createApp({ xSource, db });
  const port = Number(process.env['PORT'] ?? 3000);

  startJobs({ xFeed: xFeedJob });
  serve({ fetch: app.fetch, port });
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
