/**
 * Test script: run createXSource().getFeedPosts() against a real browser.
 *
 * Run: npx tsx scripts/test-x-feed.ts
 */
import { connect } from '@ank1015/llm-extension';

import { createXSource } from '../src/sources/x/index.js';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const x = createXSource({ chrome });

  console.log('Fetching 10 feed posts...\n');
  const posts = await x.getFeedPosts({ count: 10 });
  console.log(`\nCollected ${posts.length} posts:\n`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    console.log(`--- ${i + 1}. ${p.displayName} (${p.handle})${p.isVerified ? ' ✓' : ''} ---`);
    console.log(`  ${p.timestamp} (${p.relativeTime})`);
    const text = p.text.length > 150 ? p.text.substring(0, 150) + '...' : p.text;
    console.log(`  ${text}`);
    console.log(`  ${p.replies} replies | ${p.retweets} RTs | ${p.likes} likes | ${p.views} views`);
    if (p.isRepost) console.log(`  ↻ ${p.socialContext}`);
    if (p.isPinned) console.log(`  📌 Pinned`);
    if (p.images.length > 0) console.log(`  🖼 ${p.images.length} image(s)`);
    if (p.hasVideo) console.log(`  ▶ Video`);
    if (p.quoteTweet) console.log(`  ↪ Quoting: ${p.quoteTweet.permalink}`);
    if (p.links.length > 0) console.log(`  🔗 ${p.links.map((l) => l.href).join(', ')}`);
    console.log(`  https://x.com${p.permalink}`);
    console.log('');
  }

  // Also dump raw JSON of the first post for full inspection
  console.log('=== Raw first post ===');
  console.log(JSON.stringify(posts[0], null, 2));
}

main().catch(console.error);
