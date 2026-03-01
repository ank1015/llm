# Task: getSearchResults

File: `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/google/tasks/get-search-results.md`  
Works on URLs:

- `https://www.google.com/search`
- `https://www.google.<tld>/search`

Use this snippet to teach/extract Google SERP structure for normal web search.

Compatibility note:

- Keep adapted code in plain JavaScript for REPL stability.
- Avoid TypeScript type annotations, optional chaining (`?.`), and nullish coalescing (`??`) in adapted variants.

```js
const EXTRACT_SERP = String.raw`(() => {
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const decodeHref = (href) => {
    try {
      const u = new URL(href || '', window.location.href);
      if (u.pathname === '/url') return u.searchParams.get('q') || u.searchParams.get('url') || '';
      return u.toString();
    } catch {
      return '';
    }
  };
  const isResultUrl = (url) => /^https?:/i.test(url) && !/^https?:\/\/(?:www\.)?google\.[^/]+\/search/i.test(url);
  const isSponsored = (node) => {
    const text = clean(node.textContent || '').slice(0, 260);
    return (
      /\b(sponsored|ad|ads)\b/i.test(text) ||
      Boolean(node.querySelector('[aria-label*="Sponsored" i], [aria-label*="Ad" i], [data-text-ad]'))
    );
  };
  const pick = (node, selectors) => {
    for (const s of selectors) {
      const hit = node.querySelector(s);
      if (hit) return clean(hit.textContent || '');
    }
    return '';
  };

  const selectors = ['#search div.MjjYud', '#search div.g', '#search [data-sokoban-container]'];
  const seenNode = new Set();
  const seenUrl = new Set();
  const items = [];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement) || seenNode.has(node)) continue;
      seenNode.add(node);

      const title = pick(node, ['h3', '[role="heading"]']);
      const anchor = node.querySelector('a[href]');
      const href = anchor ? anchor.getAttribute('href') : '';
      const url = decodeHref(href || '');
      if (!title || !isResultUrl(url) || seenUrl.has(url)) continue;
      seenUrl.add(url);

      const sponsored = isSponsored(node);
      items.push({
        rankOnPage: items.length + 1,
        kind: sponsored ? 'sponsored' : 'organic',
        sponsored,
        title,
        url,
        source: pick(node, ['cite', 'span.VuuXrf', 'div.yuRUbf span']),
        snippet: pick(node, ['div.VwiC3b', 'span.aCOpRe', 'div[data-sncf]', '.st']),
      });
    }
  }

  const pageUrl = new URL(window.location.href);
  return {
    page: {
      url: window.location.href,
      query: pageUrl.searchParams.get('q') || '',
      start: Number.parseInt(pageUrl.searchParams.get('start') || '0', 10) || 0,
      title: document.title,
    },
    selectorsTried: selectors,
    items,
  };
})()`;

function buildUrl(input) {
  const p = new URLSearchParams();
  p.set('q', input.query);
  p.set('num', String(input.numPerPage));
  p.set('start', String(input.start));
  p.set('hl', input.hl || 'en');
  p.set('gl', input.gl || 'us');
  p.set('pws', '0');
  return `https://www.google.com/search?${p.toString()}`;
}

async function getSearchResults(input) {
  const query = input.query.trim();
  if (!query) throw new Error('query is required');

  const want = Math.max(1, typeof input.n === 'number' ? input.n : 10);
  const numPerPage = Math.min(
    100,
    Math.max(10, typeof input.numPerPage === 'number' ? input.numPerPage : 10)
  );
  const maxPages = Math.max(1, typeof input.maxPages === 'number' ? input.maxPages : 10);
  const includeSponsored =
    typeof input.includeSponsored === 'boolean' ? input.includeSponsored : true;
  const start0 = Math.max(0, typeof input.start === 'number' ? input.start : 0);

  const results = [];
  const pages = [];

  for (let i = 0; i < maxPages && results.length < want; i++) {
    const start = start0 + i * numPerPage;
    const url = buildUrl({ query, numPerPage, start, hl: input.hl, gl: input.gl });
    await window.open(url, { newTab: false, active: true, timeoutMs: 30_000 });
    const page = await window.evaluate(EXTRACT_SERP, {
      timeoutMs: 20_000,
    });

    const items = page && Array.isArray(page.items) ? page.items : [];
    pages.push({ start, url, returned: items.length });
    if (items.length === 0) break;

    for (const item of items) {
      if (!includeSponsored && item.sponsored === true) continue;
      results.push({ ...item, globalRank: results.length + 1, pageIndex: i, pageStart: start });
      if (results.length >= want) break;
    }
  }

  return {
    query,
    requested: want,
    returned: results.length,
    includeSponsored,
    pagesVisited: pages.length,
    pages,
    results,
  };
}

return await getSearchResults({
  query: 'openai agents',
  n: 20,
  includeSponsored: true,
  hl: 'en',
  gl: 'us',
});
```
