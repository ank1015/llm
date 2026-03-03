# Task: getSearchPosts

File: `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-search-posts.md`  
Works on URLs:

- `https://x.com/search?...`

Use this snippet to collect posts from X search results (`top` or `latest`) with natural timeline scrolling.

Compatibility note:

- Keep adapted code in plain JavaScript for REPL stability.
- Avoid TypeScript type annotations, optional chaining (`?.`), and nullish coalescing (`??`) in adapted variants.

```js
const EXTRACT_SEARCH_TIMELINE = String.raw`(() => {
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  const parseMetric = (value) => {
    const text = clean(value).replace(/,/g, '');
    if (!text) return null;

    const match = text.match(/([0-9]*\.?[0-9]+)\s*([KMB])?/i);
    if (!match) return null;

    const number = Number(match[1]);
    if (!Number.isFinite(number)) return null;

    const unit = clean(match[2] || '').toUpperCase();
    if (unit === 'K') return Math.round(number * 1000);
    if (unit === 'M') return Math.round(number * 1000 * 1000);
    if (unit === 'B') return Math.round(number * 1000 * 1000 * 1000);
    return Math.round(number);
  };

  const getMetric = (root, testId) => {
    const node = root.querySelector('[data-testid="' + testId + '"]');
    if (!(node instanceof HTMLElement)) return null;

    const visible = clean(node.textContent || '');
    const aria = clean(node.getAttribute('aria-label') || '');
    return parseMetric(visible || aria);
  };

  const parseStatusUrl = (href) => {
    try {
      const url = new URL(href || '', window.location.href);
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!match) return null;
      return {
        handle: match[1],
        postId: match[2],
        url: 'https://x.com/' + match[1] + '/status/' + match[2],
      };
    } catch {
      return null;
    }
  };

  const parseAuthorHandle = (container) => {
    const anchors = container.querySelectorAll('a[href^="/"]');
    for (const anchor of anchors) {
      if (!(anchor instanceof HTMLAnchorElement)) continue;
      const href = clean(anchor.getAttribute('href') || '');
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})(?:$|\/)/);
      if (!match) continue;
      if (match[1].toLowerCase() === 'status') continue;
      return match[1];
    }
    return '';
  };

  const parseAuthorName = (container) => {
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      if (!(span instanceof HTMLElement)) continue;
      const text = clean(span.textContent || '');
      if (!text) continue;
      if (text.indexOf('@') === 0) continue;
      if (/^\d+[smhdwy]$/i.test(text)) continue;
      return text;
    }
    return '';
  };

  const extractMedia = (article) => {
    const media = [];

    for (const img of article.querySelectorAll('[data-testid="tweetPhoto"] img')) {
      if (!(img instanceof HTMLImageElement)) continue;
      const src = clean(img.getAttribute('src') || '');
      if (!src) continue;
      media.push({ type: 'photo', url: src });
    }

    for (const vid of article.querySelectorAll('video')) {
      if (!(vid instanceof HTMLVideoElement)) continue;
      const src = clean(vid.getAttribute('src') || '');
      if (!src) continue;
      media.push({ type: 'video', url: src });
    }

    return media;
  };

  const detectLoginRequired = () => {
    return (
      window.location.pathname.indexOf('/i/flow/login') >= 0 ||
      document.querySelector('input[name="session[username_or_email]"]') !== null ||
      document.querySelector('input[autocomplete="username"]') !== null ||
      document.querySelector('a[href*="/i/flow/login"]') !== null ||
      document.querySelector('[data-testid="loginButton"]') !== null
    );
  };

  const mode = new URL(window.location.href).searchParams.get('f') === 'live' ? 'latest' : 'top';
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const items = [];

  for (const article of articles) {
    if (!(article instanceof HTMLElement)) continue;

    const timeNode = article.querySelector('time');
    const statusAnchor =
      timeNode && timeNode.closest('a[href*="/status/"]')
        ? timeNode.closest('a[href*="/status/"]')
        : article.querySelector('a[href*="/status/"]');

    const statusHref =
      statusAnchor && statusAnchor instanceof HTMLAnchorElement
        ? statusAnchor.getAttribute('href') || ''
        : '';
    const status = parseStatusUrl(statusHref);

    const nameBlock = article.querySelector('div[data-testid="User-Name"]');
    const authorHandle =
      nameBlock instanceof HTMLElement
        ? parseAuthorHandle(nameBlock)
        : status && status.handle
          ? status.handle
          : '';
    const authorName = nameBlock instanceof HTMLElement ? parseAuthorName(nameBlock) : '';

    const textParts = [];
    for (const node of article.querySelectorAll('[data-testid="tweetText"]')) {
      if (!(node instanceof HTMLElement)) continue;
      const part = clean(node.textContent || '');
      if (part) textParts.push(part);
    }

    const time = article.querySelector('time');
    const createdAt =
      time instanceof HTMLTimeElement ? clean(time.getAttribute('datetime') || '') : '';

    const raw = clean(article.textContent || '').slice(0, 2400);
    const social = article.querySelector('[data-testid="socialContext"]');
    const socialText = clean(social ? social.textContent || '' : '');

    items.push({
      postId: status ? status.postId : '',
      url: status ? status.url : '',
      text: textParts.join('\n').trim(),
      author: {
        handle: authorHandle,
        name: authorName,
        profileUrl: authorHandle ? 'https://x.com/' + authorHandle : '',
      },
      createdAt,
      metrics: {
        replies: getMetric(article, 'reply'),
        reposts: getMetric(article, 'retweet'),
        likes: getMetric(article, 'like'),
        bookmarks: getMetric(article, 'bookmark'),
        views: getMetric(article, 'viewCount'),
      },
      media: extractMedia(article),
      isReply: /\breplying to\b/i.test(raw),
      isRepost: /\breposted\b/i.test(socialText),
      isQuote: article.querySelector('[role="blockquote"]') !== null,
      isPromoted:
        /\bpromoted\b/i.test(raw) || article.querySelector('[data-testid="placementTracking"]') !== null,
      searchMode: mode,
    });
  }

  return {
    page: {
      url: window.location.href,
      title: document.title,
      mode,
      loginRequired: detectLoginRequired(),
      scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
      viewportHeight: Math.round(window.innerHeight || 0),
      scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    },
    visibleArticleCount: articles.length,
    items,
  };
})()`;

const TIMELINE_STATE = String.raw`(() => {
  const articleCount = document.querySelectorAll('article[data-testid="tweet"]').length;
  const loginRequired =
    window.location.pathname.indexOf('/i/flow/login') >= 0 ||
    document.querySelector('input[name="session[username_or_email]"]') !== null ||
    document.querySelector('input[autocomplete="username"]') !== null ||
    document.querySelector('a[href*="/i/flow/login"]') !== null ||
    document.querySelector('[data-testid="loginButton"]') !== null;

  return {
    articleCount,
    loginRequired,
    url: window.location.href,
    title: document.title,
    hasSearchTabs: document.querySelector('[role="tablist"]') !== null,
  };
})()`;

const READ_SCROLL_STATE = String.raw`(() => {
  const y = Math.round(window.scrollY || window.pageYOffset || 0);
  const maxY = Math.max(
    0,
    (document.documentElement ? document.documentElement.scrollHeight : 0) - (window.innerHeight || 0)
  );
  return { y, maxY };
})()`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchUrl(query, mode) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) throw new Error('query is required');

  const normalizedMode = mode === 'latest' ? 'latest' : 'top';
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('src', 'typed_query');
  params.set('f', normalizedMode === 'latest' ? 'live' : 'top');
  return 'https://x.com/search?' + params.toString();
}

function buildPostKey(item) {
  const postId = typeof item.postId === 'string' ? item.postId.trim() : '';
  if (postId) return 'id:' + postId;

  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (url) return 'url:' + url;

  const authorHandle =
    item.author && typeof item.author.handle === 'string'
      ? item.author.handle.trim().toLowerCase()
      : '';
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt.trim() : '';
  const text = typeof item.text === 'string' ? item.text.trim().slice(0, 160) : '';

  if (!authorHandle && !text) return '';
  return 'fallback:' + authorHandle + '|' + createdAt + '|' + text;
}

async function waitForTimelineReady(input) {
  const timeoutMs = Math.max(8_000, typeof input.timeoutMs === 'number' ? input.timeoutMs : 35_000);
  const intervalMs = Math.max(600, typeof input.intervalMs === 'number' ? input.intervalMs : 1_100);
  const nudgePx = Math.max(120, typeof input.nudgePx === 'number' ? input.nudgePx : 260);

  const startedAt = Date.now();
  let polls = 0;
  let last = {};

  while (Date.now() - startedAt < timeoutMs) {
    const state = await window.evaluate(TIMELINE_STATE, { timeoutMs: 10_000 });
    last = state && typeof state === 'object' ? state : {};

    const loginRequired = last && last.loginRequired === true;
    const articleCount = last && typeof last.articleCount === 'number' ? last.articleCount : 0;

    if (loginRequired || articleCount > 0) {
      return {
        ...last,
        polls,
        waitedMs: Date.now() - startedAt,
      };
    }

    if (polls > 0 && polls % 2 === 0) {
      await window.scroll({ y: nudgePx, behavior: 'smooth', timeoutMs: 20_000 });
    }

    polls += 1;
    await sleep(intervalMs);
  }

  return {
    ...last,
    polls,
    waitedMs: Date.now() - startedAt,
    timeout: true,
  };
}

async function naturalScroll(distancePx, scrollDurationMs) {
  const chunks = 3;
  const perChunk = Math.max(120, Math.round(distancePx / chunks));
  let moved = 0;
  let stepsUsed = 0;
  let atBottom = false;

  const startState = await window.evaluate(READ_SCROLL_STATE, { timeoutMs: 10_000 });
  let previousY = startState && typeof startState.y === 'number' ? startState.y : 0;
  let maxY = startState && typeof startState.maxY === 'number' ? startState.maxY : 0;

  for (let step = 0; step < chunks; step++) {
    await window.scroll({
      y: perChunk,
      behavior: 'smooth',
      timeoutMs: Math.max(10_000, scrollDurationMs + 5_000),
    });

    const state = await window.evaluate(READ_SCROLL_STATE, { timeoutMs: 10_000 });
    const nextY = state && typeof state.y === 'number' ? state.y : previousY;
    maxY = state && typeof state.maxY === 'number' ? state.maxY : maxY;
    moved += Math.max(0, nextY - previousY);
    previousY = nextY;
    stepsUsed += 1;

    if (nextY >= maxY - 2) {
      atBottom = true;
      break;
    }
  }

  return {
    applied: true,
    chunks,
    stepsUsed,
    perChunk,
    moved,
    endY: previousY,
    maxY,
    atBottom,
  };
}

async function getSearchPosts(input) {
  const query = input && typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) throw new Error('query is required');

  const modeRaw = input && typeof input.mode === 'string' ? input.mode : 'top';
  const mode = modeRaw === 'latest' ? 'latest' : 'top';

  const want = Math.max(1, typeof input.n === 'number' ? input.n : 20);
  const maxScrolls = Math.max(1, typeof input.maxScrolls === 'number' ? input.maxScrolls : 20);
  const includePromoted =
    input && typeof input.includePromoted === 'boolean' ? input.includePromoted : false;
  const distanceRatio = Math.max(
    0.4,
    Math.min(1.5, typeof input.distanceRatio === 'number' ? input.distanceRatio : 0.82)
  );
  const scrollDurationMs = Math.max(
    300,
    typeof input.scrollDurationMs === 'number' ? input.scrollDurationMs : 900
  );

  const url = buildSearchUrl(query, mode);
  await window.open(url, {
    newTab: false,
    active: true,
    timeoutMs: 40_000,
  });

  const readiness = await waitForTimelineReady({
    timeoutMs: input && typeof input.waitTimeoutMs === 'number' ? input.waitTimeoutMs : 35_000,
  });

  const seen = new Set();
  const results = [];
  const cycles = [];
  let loginRequired = readiness && readiness.loginRequired === true;
  let stagnantCycles = 0;

  for (let cycle = 0; cycle < maxScrolls && results.length < want; cycle++) {
    const page = await window.evaluate(EXTRACT_SEARCH_TIMELINE, { timeoutMs: 30_000 });
    const pageInfo = page && page.page ? page.page : {};
    const items = page && Array.isArray(page.items) ? page.items : [];

    loginRequired = pageInfo.loginRequired === true;

    let added = 0;
    for (const item of items) {
      if (!includePromoted && item.isPromoted === true) continue;

      const key = buildPostKey(item);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      results.push({ ...item, globalRank: results.length + 1, cycle });
      added += 1;
      if (results.length >= want) break;
    }

    const cycleMeta = {
      cycle,
      extractedOnCycle: items.length,
      added,
      uniqueTotal: results.length,
      loginRequired,
      scrollY: typeof pageInfo.scrollY === 'number' ? pageInfo.scrollY : null,
      scrollHeight: typeof pageInfo.scrollHeight === 'number' ? pageInfo.scrollHeight : null,
    };

    if (loginRequired) {
      cycles.push({ ...cycleMeta, stopReason: 'login-required' });
      break;
    }

    if (results.length >= want) {
      cycles.push({ ...cycleMeta, stopReason: 'target-reached' });
      break;
    }

    const viewportHeight =
      typeof pageInfo.viewportHeight === 'number' && pageInfo.viewportHeight > 0
        ? pageInfo.viewportHeight
        : 900;
    const distancePx = Math.max(220, Math.round(viewportHeight * distanceRatio));
    const scrollMeta = await naturalScroll(distancePx, scrollDurationMs);
    const moved =
      scrollMeta && typeof scrollMeta.moved === 'number' ? Math.abs(scrollMeta.moved) : 0;

    if (added === 0 || moved < 3) {
      stagnantCycles += 1;
    } else {
      stagnantCycles = 0;
    }

    cycles.push({ ...cycleMeta, distancePx, moved, stagnantCycles });

    if (stagnantCycles >= 3) {
      cycles.push({ cycle, stopReason: 'stagnant-scroll', uniqueTotal: results.length });
      break;
    }
  }

  return {
    query,
    mode,
    requested: want,
    returned: results.length,
    includePromoted,
    url,
    readiness,
    loginRequired,
    cycles,
    results,
  };
}

return await getSearchPosts({
  query: 'openai agents',
  mode: 'top',
  n: 20,
  includePromoted: false,
  maxScrolls: 25,
  distanceRatio: 0.82,
  scrollDurationMs: 900,
});
```
