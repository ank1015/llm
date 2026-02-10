/**
 * Test script: run createXSource().getUserProfile() against a real browser.
 *
 * Run: npx tsx scripts/test-x-profile.ts
 */
import { connect } from '@ank1015/llm-extension';

import { createXSource } from '../../src/sources/x/index.js';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const x = createXSource({ chrome });

  const username = process.argv[2] ?? 'ank1015';
  console.log(`Fetching profile for @${username}...\n`);

  const { profile, tweets } = await x.getUserProfile({ username, postCount: 5 });

  console.log('=== PROFILE ===');
  console.log(
    `  Name: ${profile.displayName} (${profile.handle})${profile.isVerified ? ' ✓' : ''}`
  );
  console.log(`  Bio: ${profile.bio}`);
  if (profile.location) console.log(`  Location: ${profile.location}`);
  if (profile.website) console.log(`  Website: ${profile.website} -> ${profile.websiteUrl}`);
  console.log(`  Joined: ${profile.joinDate}`);
  console.log(`  Following: ${profile.followingCount}`);
  console.log(`  Followers: ${profile.followersCount}`);
  if (profile.avatarUrl) console.log(`  Avatar: ${profile.avatarUrl.substring(0, 80)}...`);
  if (profile.bannerUrl) console.log(`  Banner: ${profile.bannerUrl.substring(0, 80)}...`);

  console.log(`\n=== TWEETS (${tweets.length}) ===\n`);
  for (let i = 0; i < tweets.length; i++) {
    const t = tweets[i]!;
    const text = t.text.length > 120 ? t.text.substring(0, 120) + '...' : t.text;
    console.log(`  ${i + 1}. [${t.relativeTime}] ${text}`);
    console.log(
      `     ${t.replies} replies | ${t.retweets} RTs | ${t.likes} likes | ${t.views} views`
    );
    if (t.isRepost) console.log(`     ↻ ${t.socialContext}`);
    console.log(`     https://x.com${t.permalink}\n`);
  }

  console.log('\n=== RAW PROFILE JSON ===');
  console.log(JSON.stringify(profile, null, 2));
}

main().catch(console.error);
