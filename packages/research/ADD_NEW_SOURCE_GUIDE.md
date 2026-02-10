# Adding a New Source to @ank1015/llm-research

This guide walks through the full process of adding a new browser-based data source. Follow these steps exactly — they mirror how the X (Twitter) source was built.

## Overview

Each source extracts structured data from a website using the `@ank1015/llm-extension` package, which provides a `ChromeClient` that can control a real Chrome browser. The user is already logged in — no auth handling needed.

The workflow is: **Explore DOM** → **Define extraction JS** → **Define types** → **Implement with scroll/dedup** → **Test with real browser**.

## Step 1: Create the Directory Structure

```
src/sources/<name>/
  index.ts          # Barrel exports
  <name>.source.ts  # Factory function + implementation
  <name>.types.ts   # Return types

scripts/<name>/
  explore-<name>-<page>.ts   # DOM exploration scripts
  test-<name>-<page>.ts      # Test scripts for each method
```

Example for a source called "reddit":

```
src/sources/reddit/
  index.ts
  reddit.source.ts
  reddit.types.ts

scripts/reddit/
  explore-reddit-subreddit.ts
  test-reddit-subreddit.ts
```

## Step 2: Write an Exploration Script

Before writing any types or implementation, explore the target page DOM in a real browser. Create a script in `scripts/<name>/`:

```ts
import { connect } from '@ank1015/llm-extension';

type EvalResult = { result: unknown };

async function evaluate(
  chrome: Awaited<ReturnType<typeof connect>>,
  tabId: number,
  code: string
): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', { tabId, code })) as EvalResult;
  return res.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });

  const tab = (await chrome.call('tabs.create', {
    url: 'https://example.com/page',
    active: true,
  })) as { id: number };
  const tabId = tab.id;

  await sleep(5000); // Wait for page load

  // Explore: find data-testid, class names, semantic elements
  const structure = await evaluate(
    chrome,
    tabId,
    `(() => {
    // Your DOM inspection code here
    return document.title;
  })()`
  );
  console.log(structure);
}

main().catch(console.error);
```

Run with: `npx tsx scripts/<name>/explore-<page>.ts`

### What to Look For

1. **Unique selectors** — `data-testid` attributes are ideal (stable across deploys). Fall back to semantic selectors (`article`, `[role="..."]`, class patterns).
2. **Content elements** — Where is the text, author, timestamp, stats, media?
3. **Pagination** — Does the page use infinite scroll (like X) or numbered pages? Does it virtualise the DOM (remove old elements when scrolling)?
4. **Truncation** — Are there "Show more" / "Read more" buttons that need clicking?
5. **Structural variety** — Check multiple items. Are promoted/ad items different? Are reposts/shares structured differently?

### Key Chrome APIs

```ts
// Use debugger.evaluate for pages with strict CSP (most modern sites)
await chrome.call('debugger.evaluate', { tabId, code: 'document.title' });

// Use scripting.executeScript for simpler pages (no CSP issues)
await chrome.call('scripting.executeScript', {
  target: { tabId },
  code: 'document.title',
});

// Navigate
await chrome.call('tabs.create', { url: '...', active: false });

// Clean up
await chrome.call('tabs.remove', tabId);
```

Use `debugger.evaluate` by default — it bypasses CSP restrictions that block `scripting.executeScript` on most major sites.

## Step 3: Define Types

Based on exploration results, create `<name>.types.ts` with interfaces for the extracted data. Return types should be **specific and well-documented**:

```ts
export interface RedditPost {
  /** Unique post ID */
  postId: string;
  /** Post title */
  title: string;
  /** Author username */
  author: string;
  // ... etc
}
```

Keep types flat where possible. Use `string` for counts displayed as "1.2K" — don't parse them into numbers (the display format is useful context).

## Step 4: Implement the Source

Create `<name>.source.ts` following this pattern:

```ts
import type { ChromeClient } from '@ank1015/llm-extension';
import type { RedditPost } from './reddit.types.js';

// --- Helpers (copy from x.source.ts) ---

type EvalResult = { result: unknown };

async function evaluate(chrome: ChromeClient, tabId: number, code: string): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', { tabId, code })) as EvalResult;
  return res.result;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randInt(minMs, maxMs)));
}

// --- Browser JS snippets ---

const EXTRACT_POSTS_JS = `(() => {
  // DOM extraction logic here — returns a JSON-serialisable array
})()`;

// --- Factory ---

export interface RedditSourceOptions {
  chrome: ChromeClient;
}

export interface RedditSource {
  getSubredditPosts: (params: ...) => Promise<RedditPost[]>;
}

export function createRedditSource(options: RedditSourceOptions): RedditSource {
  const { chrome } = options;

  async function getSubredditPosts(params: ...): Promise<RedditPost[]> {
    const tab = (await chrome.call('tabs.create', {
      url: `https://reddit.com/r/${subreddit}`,
      active: false,
    })) as { id: number };
    const tabId = tab.id;

    try {
      await humanDelay(4000, 6000);
      // Extract, scroll, deduplicate...
      return collected;
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  return { getSubredditPosts };
}
```

### Key Implementation Patterns

**Always open tabs with `active: false`** — don't steal focus from the user.

**Always clean up in `finally`** — close tabs even if extraction fails.

**Human-like behaviour** — randomise delays and scroll distances to avoid detection:

```ts
await humanDelay(1200, 2500); // Variable wait
const scrollPx = randInt(500, 900); // Variable scroll
if (Math.random() < 0.15) {
  // Occasional longer pause
  await humanDelay(1500, 3500);
}
```

**Scroll + dedup for infinite scroll pages** — use a unique ID (post ID, URL) to deduplicate as the DOM virtualises:

```ts
const seenIds = new Set<string>();
const collected: Post[] = [];

// Extract → scroll → extract → deduplicate by ID
// Break when: target reached, or stale recovery exhausted
```

**Stale detection** — if scrolling produces no new items for several rounds, try a bigger scroll. If that also fails, break (results exhausted):

```ts
let staleRounds = 0;
let recoveryAttempts = 0;
const maxStaleRecoveries = 2;

if (newCount === 0) {
  staleRounds++;
  if (staleRounds >= 3) {
    // Big scroll recovery
    staleRounds = 0;
    recoveryAttempts++;
    if (recoveryAttempts >= maxStaleRecoveries) break;
  }
} else {
  staleRounds = 0;
  recoveryAttempts = 0;
}
```

**Click "Show more" / "Read more"** — expand truncated content before extracting:

```ts
const CLICK_EXPAND_JS = `(() => {
  const btns = document.querySelectorAll('button.expand-text');
  let n = 0;
  btns.forEach(b => { b.click(); n++; });
  return n;
})()`;
```

## Step 5: Wire Up Exports

**`src/sources/<name>/index.ts`** — export factory + all types:

```ts
export { createRedditSource } from './reddit.source.js';
export type { RedditSource, RedditSourceOptions, ... } from './reddit.source.js';
export type { RedditPost, ... } from './reddit.types.js';
```

**`src/sources/index.ts`** — add re-export:

```ts
export * from './x/index.js';
export * from './reddit/index.js'; // <-- add this
```

Everything flows through to the package root via `src/index.ts` which already has `export * from './sources/index.js'`.

## Step 6: Write Test Scripts

Create test scripts in `scripts/<name>/` that use the actual source API:

```ts
import { connect } from '@ank1015/llm-extension';

import { createRedditSource } from '../../src/sources/reddit/index.js';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const reddit = createRedditSource({ chrome });

  const posts = await reddit.getSubredditPosts({ subreddit: 'programming', count: 10 });
  for (const p of posts) {
    console.log(`${p.title} (${p.score} points)`);
  }
}

main().catch(console.error);
```

Run with: `npx tsx scripts/<name>/test-<page>.ts`

## Step 7: Verify

1. `pnpm --filter @ank1015/llm-research typecheck` — no type errors
2. `pnpm --filter @ank1015/llm-research build` — builds cleanly
3. Run test scripts against real browser — data looks correct
4. Update `AGENTS.md` if new conventions emerged

## Checklist

- [ ] Exploration script(s) written and run
- [ ] Types defined in `<name>.types.ts`
- [ ] Source implemented in `<name>.source.ts` with factory pattern
- [ ] Barrel exports in `<name>/index.ts`
- [ ] Re-exported from `sources/index.ts`
- [ ] Test scripts created and verified with real browser
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes

## Reference: X Source File Map

The X source is the reference implementation:

```
src/sources/x/
  x.types.ts      — XTweet, XProfile, XUserProfileResult, etc.
  x.source.ts     — createXSource() with getFeedPosts, getUserProfile, searchPosts
  index.ts         — barrel exports

scripts/x/
  explore-x-feed.ts      — DOM exploration for feed page
  explore-x-profile.ts   — DOM exploration for profile page
  explore-x-search.ts    — DOM exploration for search page
  test-x-feed.ts         — Tests getFeedPosts()
  test-x-profile.ts      — Tests getUserProfile()
  test-x-search.ts       — Tests searchPosts()
```
