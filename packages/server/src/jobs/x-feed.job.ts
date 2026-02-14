import type { XPostsRepository } from '../db/x-posts.repository.js';
import type { XSource, XTweet } from '@ank1015/llm-research';

export interface XFeedJob {
  /** Fetch posts from X feed and save to DB. Returns the fetched posts. */
  run: () => Promise<XTweet[]>;
}

/**
 * Creates the X feed fetch job.
 * Pure logic — scheduling is handled by the job orchestrator.
 */
export function createXFeedJob(xSource: XSource, repo: XPostsRepository): XFeedJob {
  return {
    async run(): Promise<XTweet[]> {
      const tweets = await xSource.getFeedPosts({ count: 10 });
      repo.insert(tweets);
      return tweets;
    },
  };
}
