import { Hono } from 'hono';

import type { XPostsRepository } from '../db/x-posts.repository.js';
import type { XFeedJob } from '../jobs/x-feed.job.js';

export interface XRouteDeps {
  xFeedJob: XFeedJob;
  xPostsRepo: XPostsRepository;
}

export function createXRoutes(deps: XRouteDeps): Hono {
  const { xFeedJob, xPostsRepo } = deps;
  const app = new Hono();

  app.get('/feed', (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 10)));
    const posts = xPostsRepo.findAll(page, limit);
    const total = xPostsRepo.count();

    return c.json({ posts, page, limit, total });
  });

  app.post('/feed/fetch', async (c) => {
    const posts = await xFeedJob.run();
    return c.json({ posts, count: posts.length });
  });

  return app;
}
