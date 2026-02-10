/**
 * Exploration script: Reddit search page DOM structure
 *
 * Run: npx tsx scripts/reddit/explore-reddit-search.ts [query] [subreddit]
 *
 * Examples:
 *   npx tsx scripts/reddit/explore-reddit-search.ts "claude code"
 *   npx tsx scripts/reddit/explore-reddit-search.ts "rate limit" claude
 */
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

// ---- Phase 1: Discover search result containers ----

const DISCOVER_SEARCH_UNITS_JS = `(() => {
  // Find all search post units
  const searchPosts = document.querySelectorAll('[data-testid="search-post-unit"]');
  const sduiPosts = document.querySelectorAll('[data-testid="sdui-post-unit"]');
  const searchSduiPosts = document.querySelectorAll('[data-testid="search-sdui-post"]');

  // Get all unique data-testid values inside the first search post
  const firstPost = searchPosts[0] || sduiPosts[0] || searchSduiPosts[0];
  const innerTestIds = new Set();
  if (firstPost) {
    firstPost.querySelectorAll('[data-testid]').forEach(el => {
      innerTestIds.add(el.getAttribute('data-testid'));
    });
  }

  // Also look at what's directly on the post containers
  const postContainerInfo = [];
  const allPosts = searchPosts.length > 0 ? searchPosts : sduiPosts.length > 0 ? sduiPosts : searchSduiPosts;
  for (let i = 0; i < Math.min(3, allPosts.length); i++) {
    const post = allPosts[i];
    postContainerInfo.push({
      tag: post.tagName.toLowerCase(),
      testId: post.getAttribute('data-testid'),
      classes: (post.className || '').substring(0, 200),
      childCount: post.children.length,
      outerHTMLLength: post.outerHTML.length,
    });
  }

  return {
    searchPostCount: searchPosts.length,
    sduiPostCount: sduiPosts.length,
    searchSduiPostCount: searchSduiPosts.length,
    innerTestIds: [...innerTestIds].sort(),
    postContainerInfo,
  };
})()`;

// ---- Phase 2: Inspect first few search posts deeply ----

const INSPECT_SEARCH_POSTS_JS = `(() => {
  // Try all known search post selectors
  let posts = document.querySelectorAll('[data-testid="search-post-unit"]');
  if (posts.length === 0) posts = document.querySelectorAll('[data-testid="sdui-post-unit"]');
  if (posts.length === 0) posts = document.querySelectorAll('[data-testid="search-sdui-post"]');

  if (posts.length === 0) return { error: 'No search post elements found' };

  return Array.from(posts).slice(0, 5).map((post, idx) => {
    // --- All attributes on post container ---
    const attrs = {};
    for (const attr of post.attributes) {
      attrs[attr.name] = attr.value;
    }

    // --- Title ---
    const titleEl = post.querySelector('[data-testid="post-title-text"], [data-testid="post-title"]');
    const title = titleEl?.textContent?.trim() || '';
    const titleHref = titleEl?.closest('a')?.getAttribute('href') || titleEl?.querySelector('a')?.getAttribute('href') || '';

    // --- Author ---
    const authorEl = post.querySelector('[data-testid="search-author"], a[href*="/user/"]');
    const author = authorEl?.textContent?.trim() || '';
    const authorHref = authorEl?.getAttribute('href') || '';

    // --- Community ---
    const communityEl = post.querySelector('[data-testid="search-community"], a[href*="/r/"]');
    const community = communityEl?.textContent?.trim() || '';

    // --- Score / votes ---
    const scoreEl = post.querySelector('faceplate-number, [id*="vote-score"]');
    const score = scoreEl?.textContent?.trim() || '';

    // --- Comments ---
    const commentEl = post.querySelector('a[href*="/comments/"]');
    const commentText = commentEl?.textContent?.trim() || '';
    const commentHref = commentEl?.getAttribute('href') || '';

    // --- Timestamp ---
    const timeEl = post.querySelector('faceplate-timeago, time, [data-testid*="time"]');
    const timestamp = timeEl?.getAttribute('ts') || timeEl?.getAttribute('datetime') || '';
    const relativeTime = timeEl?.textContent?.trim() || '';

    // --- Thumbnail ---
    const thumbEl = post.querySelector('[data-testid="search_post_thumbnail"] img, img[src*="preview"], img[src*="thumb"]');
    const thumbnailUrl = thumbEl?.getAttribute('src') || '';

    // --- Body preview ---
    const bodyEl = post.querySelector('[data-testid="search-post-with-content-preview"]');
    const bodyText = bodyEl?.textContent?.trim()?.substring(0, 300) || '';

    // --- Flair ---
    const flairEl = post.querySelector('shreddit-post-flair, flair-badge, [slot="post-flair"]');
    const flair = flairEl?.textContent?.trim() || '';

    // --- Full child tree summary (first 2 levels) ---
    function childSummary(el, depth) {
      if (depth > 2) return null;
      return Array.from(el.children).map(child => ({
        tag: child.tagName.toLowerCase(),
        testId: child.getAttribute('data-testid') || null,
        text: child.children.length === 0 ? (child.textContent?.trim()?.substring(0, 100) || null) : null,
        href: child.getAttribute('href') || null,
        children: depth < 2 ? childSummary(child, depth + 1) : child.children.length + ' children',
      }));
    }

    return {
      index: idx,
      containerAttrs: attrs,
      extracted: {
        title,
        titleHref,
        author,
        authorHref,
        community,
        score,
        commentText,
        commentHref,
        timestamp,
        relativeTime,
        thumbnailUrl,
        bodyText,
        flair,
      },
      childTree: childSummary(post, 0),
    };
  });
})()`;

// ---- Phase 3: Look for links and structured data ----

const EXTRACT_ALL_LINKS_JS = `(() => {
  let posts = document.querySelectorAll('[data-testid="search-post-unit"]');
  if (posts.length === 0) posts = document.querySelectorAll('[data-testid="sdui-post-unit"]');
  if (posts.length === 0) posts = document.querySelectorAll('[data-testid="search-sdui-post"]');

  return Array.from(posts).slice(0, 3).map(post => {
    const links = Array.from(post.querySelectorAll('a')).map(a => ({
      text: a.textContent?.trim()?.substring(0, 80) || '',
      href: a.getAttribute('href') || '',
      testId: a.getAttribute('data-testid') || null,
    }));

    const faceplateNumbers = Array.from(post.querySelectorAll('faceplate-number')).map(fn => ({
      text: fn.textContent?.trim() || '',
      number: fn.getAttribute('number') || '',
      prettyNumber: fn.getAttribute('pretty-number') || '',
    }));

    const faceplateTimeagos = Array.from(post.querySelectorAll('faceplate-timeago')).map(ft => ({
      text: ft.textContent?.trim() || '',
      ts: ft.getAttribute('ts') || '',
    }));

    return { links, faceplateNumbers, faceplateTimeagos };
  });
})()`;

async function main(): Promise<void> {
  const query = process.argv[2] || 'claude code';
  const subreddit = process.argv[3];

  const chrome = await connect({ launch: true });

  let url: string;
  if (subreddit) {
    url =
      `https://www.reddit.com/r/${subreddit}/search/` +
      `?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=all`;
  } else {
    url = `https://www.reddit.com/search/` + `?q=${encodeURIComponent(query)}&sort=relevance&t=all`;
  }

  console.log(`--- Opening search: "${query}"${subreddit ? ` in r/${subreddit}` : ''} ---`);
  console.log(`URL: ${url}`);
  const tab = (await chrome.call('tabs.create', {
    url,
    active: true,
  })) as { id: number };
  const tabId = tab.id;

  console.log('Waiting for page to load...');
  await sleep(5000);

  // Phase 1: Discover containers
  console.log('\n=== PHASE 1: Search Unit Discovery ===');
  const discovery = await evaluate(chrome, tabId, DISCOVER_SEARCH_UNITS_JS);
  console.log(JSON.stringify(discovery, null, 2));

  // Phase 2: Deep inspect
  console.log('\n=== PHASE 2: Deep Post Inspection ===');
  const inspection = await evaluate(chrome, tabId, INSPECT_SEARCH_POSTS_JS);
  console.log(JSON.stringify(inspection, null, 2));

  // Phase 3: Links and structured data
  console.log('\n=== PHASE 3: Links & Structured Data ===');
  const linksData = await evaluate(chrome, tabId, EXTRACT_ALL_LINKS_JS);
  console.log(JSON.stringify(linksData, null, 2));
}

main().catch(console.error);
