/**
 * Test script: Substack getPost
 *
 * Run: npx tsx scripts/substack/test-substack-post.ts [url]
 *
 * Examples:
 *   npx tsx scripts/substack/test-substack-post.ts https://www.neuroai.science/p/claude-code-for-scientists
 *   npx tsx scripts/substack/test-substack-post.ts https://www.bensbites.com/p/claude-code-for-everybody
 */
import { connect } from '@ank1015/llm-extension';

import { createSubstackSource } from '../../src/sources/substack/index.js';

async function main(): Promise<void> {
  const url = process.argv[2] || 'https://www.neuroai.science/p/claude-code-for-scientists';

  console.log(`--- Substack getPost ---`);
  console.log(`URL: ${url}\n`);

  const chrome = await connect({ launch: true });
  const substack = createSubstackSource({ chrome });

  const post = await substack.getPost({ url });

  console.log(`Title: ${post.title}`);
  if (post.subtitle) console.log(`Subtitle: ${post.subtitle}`);
  console.log(`Publication: ${post.publicationName}`);
  console.log(`Author: ${post.author}`);
  if (post.authorUrl) console.log(`Author URL: ${post.authorUrl}`);
  console.log(`Date: ${post.date}`);
  console.log(`URL: ${post.url}`);
  console.log(`Likes: ${post.likes || '0'}`);
  console.log(`Comments: ${post.comments || '0'}`);
  console.log(`Paywalled: ${post.isPaywalled}`);
  console.log(`Body length: ${post.bodyText.length} chars`);
  console.log(`\n--- Body preview (first 500 chars) ---`);
  console.log(post.bodyText.substring(0, 500));
}

main().catch(console.error);
