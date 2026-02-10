/**
 * Test script: run createRedditSource().getPostComments() against a real browser.
 *
 * Run: npx tsx scripts/reddit/test-reddit-comments.ts [postUrl] [count]
 *
 * Examples:
 *   npx tsx scripts/reddit/test-reddit-comments.ts /r/claude/comments/1qzg6q6/claude_daily_limit_is_crazy/
 *   npx tsx scripts/reddit/test-reddit-comments.ts /r/claude/comments/1qzg6q6/claude_daily_limit_is_crazy/ 30
 */
import { connect } from '@ank1015/llm-extension';

import { createRedditSource } from '../../src/sources/reddit/index.js';

async function main(): Promise<void> {
  const postUrl = process.argv[2] || '/r/claude/comments/1qzg6q6/claude_daily_limit_is_crazy/';
  const count = Number(process.argv[3]) || 20;

  const chrome = await connect({ launch: true });
  const reddit = createRedditSource({ chrome });

  console.log(`Fetching post + ${count} comments from: ${postUrl}\n`);
  const result = await reddit.getPostComments({ postUrl, count });

  // Post
  const p = result.post;
  console.log(`=== POST ===`);
  console.log(`  ${p.title}`);
  console.log(`  by u/${p.author} in ${p.subreddit} | ${p.score} pts | ${p.commentCount} comments`);
  console.log(`  ${p.createdTimestamp}`);
  if (p.bodyText) {
    const body = p.bodyText.length > 300 ? p.bodyText.substring(0, 300) + '...' : p.bodyText;
    console.log(`  Body: ${body}`);
  }
  console.log('');

  // Comments
  console.log(`=== COMMENTS (${result.comments.length}) ===\n`);
  for (let i = 0; i < result.comments.length; i++) {
    const c = result.comments[i]!;
    const indent = '  '.repeat(c.depth + 1);
    const op = c.isOP ? ' [OP]' : '';
    const text = c.text.length > 120 ? c.text.substring(0, 120) + '...' : c.text;
    console.log(`${indent}${c.author}${op} (${c.score} pts, depth ${c.depth})`);
    console.log(`${indent}  ${text}`);
    if (c.createdTimestamp) console.log(`${indent}  ${c.createdTimestamp}`);
    console.log('');
  }

  // Raw first comment
  if (result.comments.length > 0) {
    console.log('=== Raw first comment ===');
    console.log(JSON.stringify(result.comments[0], null, 2));
  }
}

main().catch(console.error);
