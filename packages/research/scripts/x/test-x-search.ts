/**
 * Test script: run createXSource().searchPosts() against a real browser.
 *
 * Run: npx tsx scripts/test-x-search.ts
 * Run: npx tsx scripts/test-x-search.ts "openai" "2026-02-05" latest
 */
import { connect } from '@ank1015/llm-extension';

import { createXSource } from '../../src/sources/x/index.js';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const x = createXSource({ chrome });

  const query = process.argv[2] ?? 'claude code';
  const since = process.argv[3] ?? undefined;
  const sort = (process.argv[4] as 'top' | 'latest') ?? 'top';

  console.log(`Searching: "${query}"${since ? ` since:${since}` : ''} (${sort})\n`);

  const posts = await x.searchPosts({ query, count: 10, since, sort });
  console.log(`\nCollected ${posts.length} results:\n`);

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    const text = p.text.length > 120 ? p.text.substring(0, 120) + '...' : p.text;
    console.log(`  ${i + 1}. ${p.displayName} (${p.handle})${p.isVerified ? ' ✓' : ''}`);
    console.log(`     [${p.relativeTime}] ${text}`);
    console.log(
      `     ${p.replies} replies | ${p.retweets} RTs | ${p.likes} likes | ${p.views} views`
    );
    console.log(`     https://x.com${p.permalink}\n`);
  }
}

main().catch(console.error);
