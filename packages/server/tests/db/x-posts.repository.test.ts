import { describe, it, expect, beforeEach } from 'vitest';

import { createDb } from '../../src/db/index.js';
import { createXPostsRepository } from '../../src/db/x-posts.repository.js';

import type { XPostsRepository } from '../../src/db/x-posts.repository.js';
import type { XTweet } from '@ank1015/llm-research';

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

describe('XPostsRepository', () => {
  let repo: XPostsRepository;

  beforeEach(() => {
    const db = createDb(':memory:');
    repo = createXPostsRepository(db);
  });

  describe('insert', () => {
    it('should insert tweets and return inserted count', () => {
      const tweets = [makeTweet({ tweetId: '1' }), makeTweet({ tweetId: '2' })];
      const inserted = repo.insert(tweets);

      expect(inserted).toBe(2);
      expect(repo.count()).toBe(2);
    });

    it('should skip duplicates via INSERT OR IGNORE', () => {
      const tweet = makeTweet({ tweetId: '1' });
      repo.insert([tweet]);
      const inserted = repo.insert([tweet]);

      expect(inserted).toBe(0);
      expect(repo.count()).toBe(1);
    });

    it('should handle mixed new and duplicate tweets', () => {
      repo.insert([makeTweet({ tweetId: '1' })]);
      const inserted = repo.insert([makeTweet({ tweetId: '1' }), makeTweet({ tweetId: '2' })]);

      expect(inserted).toBe(1);
      expect(repo.count()).toBe(2);
    });
  });

  describe('findAll', () => {
    it('should return paginated results ordered by timestamp desc', () => {
      repo.insert([
        makeTweet({ tweetId: '1', timestamp: '2025-01-01T00:00:00.000Z' }),
        makeTweet({ tweetId: '2', timestamp: '2025-01-03T00:00:00.000Z' }),
        makeTweet({ tweetId: '3', timestamp: '2025-01-02T00:00:00.000Z' }),
      ]);

      const page1 = repo.findAll(1, 2);
      expect(page1).toHaveLength(2);
      expect(page1[0]!.tweetId).toBe('2');
      expect(page1[1]!.tweetId).toBe('3');

      const page2 = repo.findAll(2, 2);
      expect(page2).toHaveLength(1);
      expect(page2[0]!.tweetId).toBe('1');
    });

    it('should return empty array when no posts exist', () => {
      const posts = repo.findAll(1, 10);
      expect(posts).toEqual([]);
    });

    it('should correctly deserialize JSON fields', () => {
      const tweet = makeTweet({
        tweetId: '1',
        links: [{ text: 'example', href: 'https://example.com' }],
        images: [{ src: 'https://img.com/1.jpg', alt: 'test' }],
        quoteTweet: { text: 'quoted', user: '@other', permalink: '/other/status/99' },
      });
      repo.insert([tweet]);

      const result = repo.findAll(1, 10);
      expect(result[0]!.links).toEqual([{ text: 'example', href: 'https://example.com' }]);
      expect(result[0]!.images).toEqual([{ src: 'https://img.com/1.jpg', alt: 'test' }]);
      expect(result[0]!.quoteTweet).toEqual({
        text: 'quoted',
        user: '@other',
        permalink: '/other/status/99',
      });
    });
  });

  describe('count', () => {
    it('should return 0 when empty', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return correct count', () => {
      repo.insert([makeTweet({ tweetId: '1' }), makeTweet({ tweetId: '2' })]);
      expect(repo.count()).toBe(2);
    });
  });
});
