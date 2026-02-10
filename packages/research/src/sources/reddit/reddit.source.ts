import type { RedditPost } from './reddit.types.js';
import type { ChromeClient } from '@ank1015/llm-extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EvalResult = { result: unknown };

async function evaluate(chrome: ChromeClient, tabId: number, code: string): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', {
    tabId,
    code,
  })) as EvalResult;
  return res.result;
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep for a randomised duration within a range (ms) */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randInt(minMs, maxMs)));
}

// ---------------------------------------------------------------------------
// Browser-side JS snippets (run inside the page via debugger.evaluate)
// ---------------------------------------------------------------------------

/**
 * Extract structured data from shreddit-post elements on subreddit pages.
 * Reddit stores almost all data as attributes on the element.
 * Filters out promoted/ad posts.
 */
const EXTRACT_POSTS_JS = `(() => {
  const posts = document.querySelectorAll('shreddit-post');
  return Array.from(posts).map(post => {
    const get = (name) => post.getAttribute(name) || '';

    const isPromoted = post.hasAttribute('is-promoted') || post.hasAttribute('is-blank');
    if (isPromoted) return null;

    const flairEl = post.querySelector('shreddit-post-flair, flair-badge');
    const flair = flairEl?.textContent?.trim() || '';

    const thumbEl = post.querySelector('img[src*="preview"], img[src*="thumb"], img[src*="external-preview"]');
    const thumbnailUrl = thumbEl?.getAttribute('src') || '';

    const bodyEl = post.querySelector('[slot="text-body"], .md, .RichTextJSON-root');
    const bodyText = bodyEl?.textContent?.trim()?.substring(0, 500) || '';

    return {
      postId: get('id'),
      title: get('post-title'),
      author: get('author'),
      subreddit: get('subreddit-prefixed-name'),
      score: get('score'),
      commentCount: get('comment-count'),
      permalink: get('permalink'),
      contentHref: get('content-href'),
      createdTimestamp: get('created-timestamp'),
      postType: get('post-type'),
      domain: get('domain'),
      flair,
      bodyText,
      thumbnailUrl,
      isNsfw: post.hasAttribute('nsfw'),
      isSpoiler: post.hasAttribute('spoiler'),
      isPromoted: false,
      isStickied: post.hasAttribute('stickied'),
      awardCount: get('award-count'),
    };
  }).filter(Boolean);
})()`;

/**
 * Extract structured data from search result elements (sdui-post-unit).
 * Search pages use a completely different DOM — no shreddit-post.
 * Score and comments come from faceplate-number inside search-counter-row.
 * Author, flair, post type, domain, and flags are not available on search.
 */
const EXTRACT_SEARCH_POSTS_JS = `(() => {
  const units = document.querySelectorAll('[data-testid="sdui-post-unit"]');
  return Array.from(units).map(unit => {
    // --- Title & permalink ---
    // post-title lives outside sdui-post-unit; post-title-text is inside it
    const titleLink = unit.querySelector('[data-testid="post-title-text"]');
    const title = titleLink?.textContent?.trim() || '';
    const permalink = titleLink?.getAttribute('href') || '';

    // Post ID from permalink: /r/sub/comments/<id>/slug/
    const postId = permalink.match(/\\/comments\\/([a-z0-9]+)/)?.[1] || '';
    if (!postId) return null;

    // --- Subreddit ---
    // Match short /r/<name>/ links, not the permalink which also starts with /r/
    const allLinks = unit.querySelectorAll('a[href*="/r/"]');
    let subreddit = '';
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      if (href.match(/^\\/r\\/[^/]+\\/$/) && !href.includes('/comments/')) {
        subreddit = a.textContent?.trim() || '';
        break;
      }
    }

    // --- Score & comment count from search-counter-row ---
    const counterRow = unit.querySelector('[data-testid="search-counter-row"]');
    const counterNums = counterRow
      ? Array.from(counterRow.querySelectorAll('faceplate-number'))
      : [];
    const score = counterNums[0]?.getAttribute('number') || '';
    const commentCount = counterNums[1]?.getAttribute('number') || '';

    // --- Timestamp (may be in parent container, not inside sdui-post-unit) ---
    const parent = unit.closest('[data-testid="search-post-with-content-preview"], [data-testid="search-post-unit"]');
    const timeEl = unit.querySelector('faceplate-timeago')
      || parent?.querySelector('faceplate-timeago');
    const createdTimestamp = timeEl?.getAttribute('ts') || '';

    // --- Thumbnail (may be in parent container) ---
    const thumbEl = unit.querySelector('img[src*="preview"], img[src*="thumb"]')
      || parent?.querySelector('[data-testid="search_post_thumbnail"] img');
    const thumbnailUrl = thumbEl?.getAttribute('src') || '';

    // --- Body preview (from sibling content preview link) ---
    const bodyLink = parent?.querySelector('a:not([data-testid])');
    const bodyText = bodyLink && bodyLink.getAttribute('href')?.includes('/comments/')
      ? bodyLink.textContent?.trim()?.substring(0, 500) || ''
      : '';

    return {
      postId: 't3_' + postId,
      title,
      author: '',
      subreddit,
      score,
      commentCount,
      permalink,
      contentHref: '',
      createdTimestamp,
      postType: '',
      domain: '',
      flair: '',
      bodyText,
      thumbnailUrl,
      isNsfw: false,
      isSpoiler: false,
      isPromoted: false,
      isStickied: false,
      awardCount: '',
    };
  }).filter(Boolean);
})()`;

/** Scroll by a given pixel amount using smooth behaviour. */
function scrollByJs(pixels: number): string {
  return `(() => {
    const before = window.scrollY;
    window.scrollBy({ top: ${pixels}, behavior: 'smooth' });
    return { before, after: window.scrollY, docHeight: document.body.scrollHeight };
  })()`;
}

// ---------------------------------------------------------------------------
// Shared scroll-and-collect loop
// ---------------------------------------------------------------------------

interface CollectPostsOptions {
  chrome: ChromeClient;
  tabId: number;
  target: number;
  maxScrollAttempts: number;
  /** Browser JS snippet that returns an array of post objects */
  extractJs: string;
}

async function collectPosts(opts: CollectPostsOptions): Promise<RedditPost[]> {
  const { chrome, tabId, target, maxScrollAttempts, extractJs } = opts;

  const seenIds = new Set<string>();
  const collected: RedditPost[] = [];

  function addNew(raw: Array<Record<string, unknown>>): number {
    let added = 0;
    for (const p of raw) {
      const id = String(p.postId ?? '');
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        collected.push(p as unknown as RedditPost);
        added++;
      }
    }
    return added;
  }

  // Initial batch
  const initial = (await evaluate(chrome, tabId, extractJs)) as Array<Record<string, unknown>>;
  addNew(initial);

  // Scroll loop
  let attempts = 0;
  let staleRounds = 0;
  const maxStaleRecoveries = 2;
  let recoveryAttempts = 0;

  while (collected.length < target && attempts < maxScrollAttempts) {
    attempts++;

    const scrollPx = randInt(500, 900);
    await evaluate(chrome, tabId, scrollByJs(scrollPx));
    await humanDelay(1200, 2500);

    // Occasional longer pause
    if (Math.random() < 0.15) {
      await humanDelay(1500, 3500);
    }

    const batch = (await evaluate(chrome, tabId, extractJs)) as Array<Record<string, unknown>>;
    const newCount = addNew(batch);

    if (newCount === 0) {
      staleRounds++;
      if (staleRounds >= 3) {
        // Try a bigger scroll to recover
        await evaluate(chrome, tabId, scrollByJs(randInt(1200, 1800)));
        await humanDelay(2000, 3500);
        staleRounds = 0;
        recoveryAttempts++;

        // If recovery keeps failing, results are exhausted
        if (recoveryAttempts >= maxStaleRecoveries) break;
      }
    } else {
      staleRounds = 0;
      recoveryAttempts = 0;
    }
  }

  return collected.slice(0, target);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RedditSourceOptions {
  /** ChromeClient instance connected to Chrome */
  chrome: ChromeClient;
}

export interface GetSubredditPostsParams {
  /** Subreddit name without r/ (e.g. "programming") */
  subreddit: string;
  /** Number of posts to collect (default 20) */
  count?: number;
  /** Sort order (default "hot") */
  sort?: 'hot' | 'new' | 'top' | 'rising';
  /** Time filter for "top" sort (default "day") */
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
}

export interface SearchPostsParams {
  /** Search query */
  query: string;
  /** Limit search to a specific subreddit (without r/) */
  subreddit?: string;
  /** Number of posts to collect (default 20) */
  count?: number;
  /** Sort order (default "relevance") */
  sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  /** Time filter (default "all") */
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
}

export interface GetPostCommentsParams {
  /** Post permalink (e.g. "/r/claude/comments/1r0vtn9/clauding/") or full URL */
  postUrl: string;
  /** Number of top-level comments to collect (default 20) */
  count?: number;
}

export interface RedditSource {
  /** Get posts from a subreddit */
  getSubredditPosts: (params: GetSubredditPostsParams) => Promise<RedditPost[]>;
  /** Search posts across Reddit or within a subreddit */
  searchPosts: (params: SearchPostsParams) => Promise<RedditPost[]>;
}

export function createRedditSource(options: RedditSourceOptions): RedditSource {
  const { chrome } = options;

  async function getSubredditPosts(params: GetSubredditPostsParams): Promise<RedditPost[]> {
    const { subreddit, count = 20, sort = 'hot', time = 'day' } = params;

    // Build URL: /r/<sub>/ or /r/<sub>/top/?t=week etc.
    let url = `https://www.reddit.com/r/${subreddit}/`;
    if (sort !== 'hot') {
      url += `${sort}/`;
    }
    if (sort === 'top') {
      url += `?t=${time}`;
    }

    const tab = (await chrome.call('tabs.create', {
      url,
      active: true,
    })) as { id: number };
    const tabId = tab.id;

    try {
      await humanDelay(4000, 6000);
      return await collectPosts({
        chrome,
        tabId,
        target: count,
        maxScrollAttempts: Math.max(count * 2, 30),
        extractJs: EXTRACT_POSTS_JS,
      });
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  async function searchPosts(params: SearchPostsParams): Promise<RedditPost[]> {
    const { query, subreddit, count = 20, sort = 'relevance', time = 'all' } = params;

    // Reddit search URL:
    // Global: https://www.reddit.com/search/?q=...&sort=...&t=...
    // Scoped: https://www.reddit.com/r/<sub>/search/?q=...&restrict_sr=1&sort=...&t=...
    let url: string;
    if (subreddit) {
      url =
        `https://www.reddit.com/r/${subreddit}/search/` +
        `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=${sort}&t=${time}`;
    } else {
      url =
        `https://www.reddit.com/search/` + `?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}`;
    }

    const tab = (await chrome.call('tabs.create', {
      url,
      active: true,
    })) as { id: number };
    const tabId = tab.id;

    try {
      await humanDelay(4000, 6000);
      return await collectPosts({
        chrome,
        tabId,
        target: count,
        maxScrollAttempts: Math.max(count * 2, 30),
        extractJs: EXTRACT_SEARCH_POSTS_JS,
      });
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  return {
    getSubredditPosts,
    searchPosts,
  };
}
