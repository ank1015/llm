/**
 * Test script: Substack searchPosts
 *
 * Run: npx tsx scripts/substack/test-substack-search.ts [query] [count] [dateRange]
 *
 * Examples:
 *   npx tsx scripts/substack/test-substack-search.ts "claude code"
 *   npx tsx scripts/substack/test-substack-search.ts "AI agents" 5
 *   npx tsx scripts/substack/test-substack-search.ts "claude code" 10 day
 */
import { connect } from '@ank1015/llm-extension';

import { createSubstackSource } from '../../src/sources/substack/index.js';

async function main(): Promise<void> {
  const query = process.argv[2] || 'claude code';
  const count = process.argv[3] ? parseInt(process.argv[3], 10) : 10;
  const dateRange = process.argv[4] as 'day' | 'week' | 'month' | 'year' | undefined;

  console.log(`--- Substack searchPosts ---`);
  console.log(`Query: "${query}", count: ${count}${dateRange ? `, dateRange: ${dateRange}` : ''}`);

  const chrome = await connect({ launch: true });
  const substack = createSubstackSource({ chrome });

  const posts = await substack.searchPosts({ query, count, dateRange });

  console.log(`\nFound ${posts.length} posts:\n`);

  for (const [i, post] of posts.entries()) {
    console.log(`[${i + 1}] ${post.title}`);
    if (post.subtitle) console.log(`    ${post.subtitle}`);
    console.log(
      `    ${post.publicationName} · ${post.date}${post.author ? ` · ${post.author}` : ''}`
    );
    if (post.readTime) console.log(`    ${post.readTime}`);
    console.log(`    ${post.url}`);
    console.log();
  }
}

main().catch(console.error);
