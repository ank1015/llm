import type { SubstackPost, SubstackPostDetail } from './substack.types.js';
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

/** Sleep for a randomised duration within a range (ms) */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Browser-side JS snippets (run inside the page via debugger.evaluate)
// ---------------------------------------------------------------------------

/**
 * Extract structured data from every search result currently in the DOM.
 *
 * Container: div.reader2-post-container
 * Each wraps a single <a> tag containing the entire card.
 *
 * Structure:
 *   a (href = post URL)
 *     div.reader2-post-head
 *       div > div > img (publication icon)
 *       div.pub-name (publication name)
 *       div.reader2-post-info
 *         div (date text, e.g. "Jan 20")
 *     div.reader2-post-body
 *       div
 *         div.reader2-post-title (title)
 *         div.reader2-paragraph  (subtitle)
 *         div.reader2-item-meta  (author + read time, e.g. "Joe∙4 min read")
 *       div > picture > img (thumbnail)
 */
const EXTRACT_SEARCH_RESULTS_JS = `(() => {
  const containers = document.querySelectorAll('.reader2-post-container');

  return Array.from(containers).map(container => {
    const link = container.querySelector('a');
    const rawUrl = link?.getAttribute('href') || '';

    // Strip UTM params from URL
    let url = rawUrl;
    try {
      const u = new URL(rawUrl);
      for (const key of [...u.searchParams.keys()]) {
        if (key.startsWith('utm_') || key === 'lli') u.searchParams.delete(key);
      }
      url = u.toString();
    } catch {}

    // Publication info
    const pubNameEl = container.querySelector('.pub-name');
    const publicationName = pubNameEl?.textContent?.trim() || '';

    // Publication URL: second <a> in container (points to publication root)
    const allLinks = container.querySelectorAll('a[href]');
    let publicationUrl = '';
    for (const a of allLinks) {
      const href = a.getAttribute('href') || '';
      if (href && !href.includes('/p/')) {
        publicationUrl = href;
        break;
      }
    }

    // Publication icon
    const iconImg = container.querySelector('.reader2-post-head img');
    const publicationIconUrl = iconImg?.getAttribute('src') || '';

    // Date
    const postInfoEl = container.querySelector('.reader2-post-info');
    const dateEl = postInfoEl?.querySelector('div');
    const date = dateEl?.textContent?.trim() || '';

    // Title
    const titleEl = container.querySelector('.reader2-post-title');
    const title = titleEl?.textContent?.trim() || '';

    // Subtitle / preview
    const subtitleEl = container.querySelector('.reader2-paragraph');
    const subtitle = subtitleEl?.textContent?.trim() || '';

    // Meta: "Author∙N min read" or just "N min read"
    const metaEl = container.querySelector('.reader2-item-meta');
    const metaText = metaEl?.textContent?.trim() || '';
    let author = '';
    let readTime = '';
    if (metaText.includes('\\u2219')) {
      // Middle dot separator (∙)
      const parts = metaText.split('\\u2219');
      author = parts[0].trim();
      readTime = parts[1]?.trim() || '';
    } else {
      readTime = metaText;
    }

    // Thumbnail (second img, inside reader2-post-body picture)
    const thumbImg = container.querySelector('.reader2-post-body picture img')
      || container.querySelector('.reader2-post-body img');
    const thumbnailUrl = thumbImg?.getAttribute('src') || '';

    return {
      title,
      subtitle,
      url,
      publicationName,
      publicationUrl,
      publicationIconUrl,
      author,
      readTime,
      date,
      thumbnailUrl,
    };
  }).filter(p => p.title);
})()`;

/**
 * Extract full post data from a Substack post page.
 *
 * Key selectors:
 *   .post-title            → post title (h1, distinct from publication name h1)
 *   .subtitle              → subtitle
 *   .byline-wrapper        → author name + date
 *   a[href*="/@"]          → author profile link
 *   .body.markup           → article body content
 *   .post-ufi-button       → like/comment/share buttons (counts in aria-label)
 *   [class*="paywall"]     → paywall indicator
 */
const EXTRACT_POST_JS = `(() => {
  // --- Title ---
  // Page has two h1s: publication name and post title. Use .post-title class.
  const titleEl = document.querySelector('.post-title, h1[class*="post-title"]');
  const title = titleEl?.textContent?.trim() || '';

  // --- Subtitle ---
  const subtitleEl = document.querySelector('.subtitle');
  const subtitle = subtitleEl?.textContent?.trim() || '';

  // --- URL ---
  const url = window.location.href.split('?')[0];

  // --- Publication name ---
  // First h1 (without post-title class), or from meta/header
  const allH1s = document.querySelectorAll('h1');
  let publicationName = '';
  for (const h of allH1s) {
    if (!String(h.className || '').includes('post-title')) {
      publicationName = h.textContent?.trim() || '';
      break;
    }
  }

  // --- Author ---
  // Multiple a[href*="/@"] exist — first is often an avatar (no text). Find one with text.
  let author = '';
  let authorUrl = '';
  const authorCandidates = document.querySelectorAll('.byline-wrapper a[href*="/@"], a[href*="/@"]');
  for (const a of authorCandidates) {
    const text = a.textContent?.trim() || '';
    if (text) {
      author = text;
      authorUrl = a.getAttribute('href') || '';
      break;
    }
  }
  // If no text link found, still grab the URL from any match
  if (!authorUrl && authorCandidates.length > 0) {
    authorUrl = authorCandidates[0].getAttribute('href') || '';
  }

  // --- Date ---
  // From the byline area — look for the date div inside byline-wrapper
  const byline = document.querySelector('.byline-wrapper');
  let date = '';
  if (byline) {
    const metaDivs = byline.querySelectorAll('div[class*="font-meta"]');
    for (const div of metaDivs) {
      const text = div.textContent?.trim() || '';
      // Date strings contain month names or look like "Jan 29, 2026"
      if (/^[A-Z][a-z]{2}\\s+\\d/.test(text)) {
        date = text;
        break;
      }
    }
  }
  // Fallback: try time element
  if (!date) {
    const timeEl = document.querySelector('.post-header time, .byline-wrapper time');
    date = timeEl?.textContent?.trim() || '';
  }

  // --- Body text ---
  const bodyEl = document.querySelector('.body.markup');
  const bodyText = bodyEl?.textContent?.trim() || '';

  // --- Engagement ---
  // Like count from aria-label: "Like (78)" or button text
  let likes = '';
  let comments = '';
  const ufiBtns = document.querySelectorAll('.post-ufi-button');
  for (const btn of ufiBtns) {
    const label = btn.getAttribute('aria-label') || '';
    const likeMatch = label.match(/^Like\\s*\\((\\d[\\d,.KkMm]*)\\)/);
    const commentMatch = label.match(/^View comments\\s*\\((\\d[\\d,.KkMm]*)\\)/);
    if (likeMatch && !likes) likes = likeMatch[1];
    if (commentMatch && !comments) comments = commentMatch[1];
  }

  // --- Paywall detection ---
  const hasPaywall = !!(
    document.querySelector('[class*="paywall"]') ||
    document.querySelector('.subscription-widget-wrap') ||
    document.querySelector('[class*="gate"]')
  );
  // Also check for subscribe prompts inside the article area
  const articleArea = document.querySelector('.single-post');
  let hasSubscribePrompt = false;
  if (articleArea) {
    const btns = articleArea.querySelectorAll('a, button');
    for (const b of btns) {
      const text = b.textContent?.trim()?.toLowerCase() || '';
      if (/subscribe to continue|upgrade to read|unlock this post|continue reading/i.test(text)) {
        hasSubscribePrompt = true;
        break;
      }
    }
  }
  const isPaywalled = hasPaywall || hasSubscribePrompt;

  return {
    title,
    subtitle,
    url,
    publicationName,
    author,
    authorUrl,
    date,
    bodyText,
    likes,
    comments,
    isPaywalled,
  };
})()`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SubstackSourceOptions {
  /** ChromeClient instance connected to Chrome */
  chrome: ChromeClient;
}

export interface SearchPostsParams {
  /** Search query */
  query: string;
  /** Maximum number of posts to return (default 20, max 20 — Substack shows a fixed page) */
  count?: number;
  /** Date range filter: "day" (24h), "week", "month", "year" */
  dateRange?: 'day' | 'week' | 'month' | 'year';
}

export interface GetPostParams {
  /** Full Substack post URL (e.g. "https://example.substack.com/p/my-post") */
  url: string;
}

export interface SubstackSource {
  /** Search Substack posts by query */
  searchPosts: (params: SearchPostsParams) => Promise<SubstackPost[]>;
  /** Get full post content from a Substack post URL */
  getPost: (params: GetPostParams) => Promise<SubstackPostDetail>;
}

export function createSubstackSource(options: SubstackSourceOptions): SubstackSource {
  const { chrome } = options;

  async function searchPosts(params: SearchPostsParams): Promise<SubstackPost[]> {
    const { query, count = 20, dateRange } = params;

    let url = `https://substack.com/search/${encodeURIComponent(query)}?searching=all_posts`;
    if (dateRange) {
      url += `&dateRange=${dateRange}`;
    }

    const tab = (await chrome.call('tabs.create', {
      url,
      active: false,
    })) as { id: number };
    const tabId = tab.id;

    try {
      await humanDelay(4000, 6000);

      const results = (await evaluate(chrome, tabId, EXTRACT_SEARCH_RESULTS_JS)) as Array<
        Record<string, unknown>
      >;

      const posts = (results ?? []) as unknown as SubstackPost[];
      return posts.slice(0, count);
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  async function getPost(params: GetPostParams): Promise<SubstackPostDetail> {
    const { url } = params;

    const tab = (await chrome.call('tabs.create', {
      url,
      active: false,
    })) as { id: number };
    const tabId = tab.id;

    try {
      await humanDelay(4000, 6000);

      const result = (await evaluate(chrome, tabId, EXTRACT_POST_JS)) as Record<string, unknown>;
      return result as unknown as SubstackPostDetail;
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  return { searchPosts, getPost };
}
