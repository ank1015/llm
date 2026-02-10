/**
 * Test script: run createRedditSource().getSubredditPosts() against a real browser.
 *
 * Run: npx tsx scripts/reddit/test-reddit-subreddit.ts [subreddit] [count] [sort] [time]
 *
 * Examples:
 *   npx tsx scripts/reddit/test-reddit-subreddit.ts programming 10
 *   npx tsx scripts/reddit/test-reddit-subreddit.ts claude 15 top week
 */
import { connect } from '@ank1015/llm-extension';

import { createRedditSource } from '../../src/sources/reddit/index.js';

async function main(): Promise<void> {
  const subreddit = process.argv[2] || 'programming';
  const count = Number(process.argv[3]) || 10;
  const sort = (process.argv[4] as 'hot' | 'new' | 'top' | 'rising') || 'hot';
  const time = (process.argv[5] as 'hour' | 'day' | 'week' | 'month' | 'year' | 'all') || 'day';

  const chrome = await connect({ launch: true });
  const reddit = createRedditSource({ chrome });

  console.log(`Fetching ${count} posts from r/${subreddit} (sort: ${sort})...\n`);
  const posts = await reddit.getSubredditPosts({ subreddit, count, sort, time });
  console.log(`\nCollected ${posts.length} posts:\n`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    const flags = [
      p.isStickied ? '[STICKIED]' : '',
      p.isNsfw ? '[NSFW]' : '',
      p.isSpoiler ? '[SPOILER]' : '',
    ]
      .filter(Boolean)
      .join(' ');

    console.log(`--- ${i + 1}. [${p.postType}] ${p.title} ---`);
    console.log(`  by u/${p.author} in ${p.subreddit} ${flags}`);
    console.log(`  ${p.score} pts | ${p.commentCount} comments | ${p.createdTimestamp}`);
    if (p.flair) console.log(`  Flair: ${p.flair}`);
    if (p.bodyText) {
      const body = p.bodyText.length > 150 ? p.bodyText.substring(0, 150) + '...' : p.bodyText;
      console.log(`  Body: ${body}`);
    }
    if (p.thumbnailUrl) console.log(`  Thumb: ${p.thumbnailUrl.substring(0, 80)}...`);
    if (p.domain && !p.domain.startsWith('self.')) console.log(`  Domain: ${p.domain}`);
    console.log(`  https://www.reddit.com${p.permalink}`);
    console.log('');
  }

  // Dump raw JSON of the first post
  if (posts.length > 0) {
    console.log('=== Raw first post ===');
    console.log(JSON.stringify(posts[0], null, 2));
  }
}

main().catch(console.error);
