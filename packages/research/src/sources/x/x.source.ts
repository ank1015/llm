import type { XTweet } from './x.types.js';
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
 * Extract structured data from every tweet article currently in the DOM.
 * Returns a JSON-serialisable array.
 */
const EXTRACT_TWEETS_JS = `(() => {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  return Array.from(articles).map(article => {
    const permalinkEl = article.querySelector('a[href*="/status/"]');
    const permalink = permalinkEl?.getAttribute('href') || '';
    const tweetId = permalink.match(/\\/status\\/(\\d+)/)?.[1] || '';

    // --- Author ---
    const uc = article.querySelector('[data-testid="User-Name"]');
    let displayName = '';
    let handle = '';
    if (uc) {
      const links = uc.querySelectorAll('a[role="link"]');
      if (links.length >= 1) {
        const spans = links[0].querySelectorAll('span');
        for (const s of spans) {
          const t = s.textContent?.trim();
          if (t && !s.querySelector('span') && !s.querySelector('svg')) { displayName = t; break; }
        }
      }
      if (links.length >= 2) handle = links[1]?.textContent?.trim() || '';
    }
    const isVerified = !!article.querySelector('[data-testid="icon-verified"]');
    const avatarImg = article.querySelector('img[src*="profile_images"]');
    const avatarUrl = avatarImg?.getAttribute('src') || '';

    // --- Text ---
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    const text = tweetTextEl?.textContent || '';
    const hasShowMore = !!article.querySelector('[data-testid="tweet-text-show-more-link"]');
    const links2 = tweetTextEl
      ? Array.from(tweetTextEl.querySelectorAll('a')).map(a => ({
          text: a.textContent || '', href: a.getAttribute('href') || '',
        }))
      : [];

    // --- Time ---
    const timeEl = article.querySelector('time');
    const timestamp = timeEl?.getAttribute('datetime') || '';
    const relativeTime = timeEl?.textContent || '';

    // --- Stats ---
    const replyBtn = article.querySelector('[data-testid="reply"]');
    const retweetBtn = article.querySelector('[data-testid="retweet"]');
    const likeBtn = article.querySelector('[data-testid="like"]');
    const unlikeBtn = article.querySelector('[data-testid="unlike"]');
    const removeBookmarkBtn = article.querySelector('[data-testid="removeBookmark"]');

    const actionBar = article.querySelector('[role="group"]');
    let views = '';
    if (actionBar) {
      const tr = actionBar.querySelectorAll('[data-testid="app-text-transition-container"]');
      if (tr.length >= 4) views = tr[3]?.textContent?.trim() || '';
    }

    // --- Social context ---
    const scEl = article.querySelector('[data-testid="socialContext"]');
    const socialContext = scEl?.textContent || '';

    // --- Media ---
    const images = Array.from(
      article.querySelectorAll('[data-testid="tweetPhoto"] img')
    ).map(img => ({ src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '' }));
    const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]');

    // --- Card ---
    const cardEl = article.querySelector('[data-testid="card.wrapper"]');
    const cardLink = cardEl?.querySelector('a')?.getAttribute('href') || '';
    const cardTitle = cardEl?.querySelector(
      '[data-testid="card.layoutLarge.title"], [data-testid="card.layoutSmall.title"]'
    )?.textContent || '';

    // --- Quote tweet ---
    const qtEl = article.querySelector('[data-testid="quoteTweet"]');
    let quoteTweet = null;
    if (qtEl) {
      quoteTweet = {
        text: qtEl.querySelector('[data-testid="tweetText"]')?.textContent || '',
        user: qtEl.querySelector('[data-testid="User-Name"]')?.textContent || '',
        permalink: qtEl.querySelector('a[href*="/status/"]')?.getAttribute('href') || '',
      };
    }

    return {
      tweetId, displayName, handle, isVerified, avatarUrl,
      text, hasShowMore, links: links2, timestamp, relativeTime,
      replies: replyBtn?.textContent?.trim() || '0',
      retweets: retweetBtn?.textContent?.trim() || '0',
      likes: (likeBtn || unlikeBtn)?.textContent?.trim() || '0',
      views,
      isLiked: !!unlikeBtn,
      isBookmarked: !!removeBookmarkBtn,
      socialContext,
      isRepost: socialContext.toLowerCase().includes('reposted'),
      isPinned: socialContext.toLowerCase().includes('pinned'),
      images, hasVideo, cardLink, cardTitle, quoteTweet, permalink,
    };
  });
})()`;

/** Click all visible "Show more" buttons inside tweets. Returns count. */
const CLICK_SHOW_MORE_JS = `(() => {
  const btns = document.querySelectorAll(
    'article[data-testid="tweet"] [data-testid="tweet-text-show-more-link"]'
  );
  let n = 0;
  btns.forEach(b => { b.click(); n++; });
  return n;
})()`;

/** Scroll by a given pixel amount and return positions. */
function scrollByJs(pixels: number): string {
  return `(() => {
    const before = window.scrollY;
    window.scrollBy({ top: ${pixels}, behavior: 'smooth' });
    return { before, after: window.scrollY, docHeight: document.body.scrollHeight };
  })()`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface XSourceOptions {
  /** ChromeClient instance connected to Chrome */
  chrome: ChromeClient;
}

export interface GetFeedPostsParams {
  /** Number of posts to collect (default 20) */
  count?: number;
}

export interface SearchPostsParams {
  /** Search query */
  query: string;
  /** Number of posts to extract */
  count?: number;
}

export interface GetUserProfileParams {
  /** Twitter/X username (without @) */
  username: string;
  /** Number of posts to extract from the profile */
  postCount?: number;
}

export interface XSource {
  /** Extract top posts from the logged-in user's feed */
  getFeedPosts: (params?: GetFeedPostsParams) => Promise<XTweet[]>;
  /** Search posts with a query */
  searchPosts: (params: SearchPostsParams) => Promise<unknown>;
  /** Get a user's profile and their recent posts */
  getUserProfile: (params: GetUserProfileParams) => Promise<unknown>;
}

export function createXSource(options: XSourceOptions): XSource {
  const { chrome } = options;

  async function getFeedPosts(params?: GetFeedPostsParams): Promise<XTweet[]> {
    const target = params?.count ?? 20;
    const maxScrollAttempts = Math.max(target * 2, 30);

    // Open feed in a new tab
    const tab = (await chrome.call('tabs.create', {
      url: 'https://x.com/home',
      active: false,
    })) as { id: number };
    const tabId = tab.id;

    try {
      // Wait for initial page load
      await humanDelay(4000, 6000);

      // Expand any truncated tweets before first extraction
      const expanded = (await evaluate(chrome, tabId, CLICK_SHOW_MORE_JS)) as number;
      if (expanded > 0) await humanDelay(400, 800);

      // Collect tweets with deduplication
      const seenIds = new Set<string>();
      const collected: XTweet[] = [];

      function addNewTweets(raw: Array<Record<string, unknown>>): number {
        let added = 0;
        for (const t of raw) {
          const id = String(t.tweetId ?? '');
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            collected.push(t as unknown as XTweet);
            added++;
          }
        }
        return added;
      }

      // Extract initial batch
      const initial = (await evaluate(chrome, tabId, EXTRACT_TWEETS_JS)) as Array<
        Record<string, unknown>
      >;
      addNewTweets(initial);

      // Scroll loop
      let scrollAttempts = 0;
      let staleRounds = 0;

      while (collected.length < target && scrollAttempts < maxScrollAttempts) {
        scrollAttempts++;

        // Randomised scroll distance (0.6–1.2 viewport heights)
        const scrollPx = randInt(500, 900);
        await evaluate(chrome, tabId, scrollByJs(scrollPx));

        // Human-like wait for content to load
        await humanDelay(1200, 2500);

        // Small chance of a longer pause (simulates reading)
        if (Math.random() < 0.15) {
          await humanDelay(1500, 3500);
        }

        // Expand truncated tweets
        const exp = (await evaluate(chrome, tabId, CLICK_SHOW_MORE_JS)) as number;
        if (exp > 0) await humanDelay(300, 600);

        // Extract and deduplicate
        const batch = (await evaluate(chrome, tabId, EXTRACT_TWEETS_JS)) as Array<
          Record<string, unknown>
        >;
        const newCount = addNewTweets(batch);

        if (newCount === 0) {
          staleRounds++;
          // If we haven't seen new tweets for a while, try a bigger scroll
          if (staleRounds >= 3) {
            await evaluate(chrome, tabId, scrollByJs(randInt(1200, 1800)));
            await humanDelay(2000, 3500);
            staleRounds = 0;
          }
        } else {
          staleRounds = 0;
        }
      }

      return collected.slice(0, target);
    } finally {
      // Clean up – close the tab we opened
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  return {
    getFeedPosts,

    async searchPosts(_params: SearchPostsParams) {
      // TODO: implement
      throw new Error('Not implemented');
    },

    async getUserProfile(_params: GetUserProfileParams) {
      // TODO: implement
      throw new Error('Not implemented');
    },
  };
}
