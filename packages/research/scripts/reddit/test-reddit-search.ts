/**
 * Test script: run createRedditSource().searchPosts() against a real browser.
 *
 * Run: npx tsx scripts/reddit/test-reddit-search.ts [query] [subreddit] [sort] [time]
 *
 * Examples:
 *   npx tsx scripts/reddit/test-reddit-search.ts "claude code"
 *   npx tsx scripts/reddit/test-reddit-search.ts "rate limit" claude
 *   npx tsx scripts/reddit/test-reddit-search.ts "best practices" programming top week
 */
import { connect } from '@ank1015/llm-extension';

import { createRedditSource } from '../../src/sources/reddit/index.js';

async function main(): Promise<void> {
  const query = process.argv[2] || 'claude code';
  const subreddit = process.argv[3] || undefined;
  const sort = (process.argv[4] as 'relevance' | 'hot' | 'top' | 'new' | 'comments') || 'relevance';
  const time = (process.argv[5] as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all') || 'all';

  const chrome = await connect({ launch: true });
  const reddit = createRedditSource({ chrome });

  console.log(
    `Searching "${query}"${subreddit ? ` in r/${subreddit}` : ''} (sort: ${sort}, time: ${time})...\n`
  );
  const posts = await reddit.searchPosts({ query, subreddit, count: 10, sort, time });
  console.log(`\nCollected ${posts.length} posts:\n`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    console.log(`--- ${i + 1}. ${p.title} ---`);
    console.log(`  in ${p.subreddit} | ${p.score} pts | ${p.commentCount} comments`);
    console.log(`  ${p.createdTimestamp}`);
    if (p.bodyText) {
      const body = p.bodyText.length > 150 ? p.bodyText.substring(0, 150) + '...' : p.bodyText;
      console.log(`  Body: ${body}`);
    }
    if (p.thumbnailUrl) console.log(`  Thumb: ${p.thumbnailUrl.substring(0, 80)}...`);
    console.log(`  https://www.reddit.com${p.permalink}`);
    console.log('');
  }

  if (posts.length > 0) {
    console.log('=== Raw first post ===');
    console.log(JSON.stringify(posts[0], null, 2));
  }
}

main().catch(console.error);
