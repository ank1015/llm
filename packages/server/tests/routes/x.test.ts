import { Hono } from 'hono';
import { describe, it, expect, beforeEach } from 'vitest';

import { createDb } from '../../src/db/index.js';
import { createXPostsRepository } from '../../src/db/x-posts.repository.js';
import { createXFeedJob } from '../../src/jobs/x-feed.job.js';
import { createXRoutes } from '../../src/routes/x.js';

import type { XPostsRepository } from '../../src/db/x-posts.repository.js';
import type { XFeedJob } from '../../src/jobs/x-feed.job.js';
import type { XTweet, XSource } from '@ank1015/llm-research';

function makeTweet(overrides: Partial<XTweet> = {}): XTweet {
  return {
    tweetId: '1234567890',
    displayName: 'Test User',
    handle: '@testuser',
    isVerified: false,
    avatarUrl: 'https://example.com/avatar.jpg',
    text: 'Hello world',
    links: [],
    timestamp: '2025-01-15T12:00:00.000Z',
    relativeTime: '2h',
    replies: '5',
    retweets: '10',
    likes: '20',
    views: '100',
    isLiked: false,
    isBookmarked: false,
    socialContext: '',
    isRepost: false,
    isPinned: false,
    images: [],
    hasVideo: false,
    cardLink: '',
    cardTitle: '',
    quoteTweet: null,
    permalink: '/testuser/status/1234567890',
    ...overrides,
  };
}

function createMockXSource(tweets: XTweet[]): XSource {
  return {
    getFeedPosts: async () => tweets,
    searchPosts: async () => [],
    getUserProfile: async () => ({
      profile: {} as never,
      tweets: [],
    }),
  };
}

describe('X Routes', () => {
  let repo: XPostsRepository;
  let xFeedJob: XFeedJob;
  let app: Hono;

  beforeEach(() => {
    const db = createDb(':memory:');
    repo = createXPostsRepository(db);
    const mockSource = createMockXSource([
      makeTweet({ tweetId: '1', text: 'First post' }),
      makeTweet({ tweetId: '2', text: 'Second post' }),
    ]);
    xFeedJob = createXFeedJob(mockSource, repo);
    app = new Hono();
    app.route('/x', createXRoutes({ xFeedJob, xPostsRepo: repo }));
  });

  describe('GET /x/feed', () => {
    it('should return empty paginated response when no posts', async () => {
      const res = await app.request('/x/feed');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ posts: [], page: 1, limit: 10, total: 0 });
    });

    it('should return posts with pagination metadata', async () => {
      repo.insert([
        makeTweet({ tweetId: '1', text: 'First' }),
        makeTweet({ tweetId: '2', text: 'Second' }),
      ]);

      const res = await app.request('/x/feed');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.posts).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
    });

    it('should respect page and limit query params', async () => {
      // Insert 3 posts
      repo.insert([
        makeTweet({ tweetId: '1', timestamp: '2025-01-01T00:00:00.000Z' }),
        makeTweet({ tweetId: '2', timestamp: '2025-01-02T00:00:00.000Z' }),
        makeTweet({ tweetId: '3', timestamp: '2025-01-03T00:00:00.000Z' }),
      ]);

      const res = await app.request('/x/feed?page=2&limit=2');
      const body = await res.json();

      expect(body.posts).toHaveLength(1);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.total).toBe(3);
    });
  });

  describe('POST /x/feed/fetch', () => {
    it('should fetch posts and save to db', async () => {
      const res = await app.request('/x/feed/fetch', { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.count).toBe(2);
      expect(body.posts).toHaveLength(2);

      // Verify they are in the DB
      expect(repo.count()).toBe(2);
    });
  });
});
