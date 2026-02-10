import type { SubstackPost } from './substack.types.js';
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

export interface SubstackSource {
  /** Search Substack posts by query */
  searchPosts: (params: SearchPostsParams) => Promise<SubstackPost[]>;
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

  return { searchPosts };
}
