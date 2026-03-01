# Task: getSearchResultsAdvanced

File: `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/google/tasks/get-search-results-advanced.md`  
Works on URLs:

- `https://www.google.com/search` (with advanced params)
- `https://www.google.com/advanced_search` (UI reference; params still run on `/search`)

Use this snippet to teach advanced Google filters, including time-based filtering.

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
  const sponsored = (node) => /\b(sponsored|ad|ads)\b/i.test(clean(node.textContent || '').slice(0, 260));
  const pick = (node, selectors) => {
    for (const s of selectors) {
      const hit = node.querySelector(s);
      if (hit) return clean(hit.textContent || '');
    }
    return '';
  };

  const seenUrl = new Set();
  const items = [];
  for (const node of document.querySelectorAll('#search div.MjjYud, #search div.g, #search [data-sokoban-container]')) {
    if (!(node instanceof HTMLElement)) continue;
    const title = pick(node, ['h3', '[role="heading"]']);
    const anchor = node.querySelector('a[href]');
    const href = anchor ? anchor.getAttribute('href') : '';
    const url = decodeHref(href || '');
    if (!title || !isResultUrl(url) || seenUrl.has(url)) continue;
    seenUrl.add(url);
    const isAd = sponsored(node);
    items.push({
      rankOnPage: items.length + 1,
      kind: isAd ? 'sponsored' : 'organic',
      sponsored: isAd,
      title,
      url,
      source: pick(node, ['cite', 'span.VuuXrf', 'div.yuRUbf span']),
      snippet: pick(node, ['div.VwiC3b', 'span.aCOpRe', 'div[data-sncf]', '.st']),
    });
  }

  return { url: window.location.href, title: document.title, items };
})()`;

function buildAdvancedUrl(filters, start, numPerPage) {
  const asText = (value) => (typeof value === 'string' ? value.trim() : '');
  const p = new URLSearchParams();
  if (asText(filters.allWords)) p.set('as_q', asText(filters.allWords));
  if (asText(filters.exactPhrase)) p.set('as_epq', asText(filters.exactPhrase));
  if (asText(filters.anyWords)) p.set('as_oq', asText(filters.anyWords));
  if (asText(filters.noneWords)) p.set('as_eq', asText(filters.noneWords));
  if (asText(filters.numbersFrom)) p.set('as_nlo', asText(filters.numbersFrom));
  if (asText(filters.numbersTo)) p.set('as_nhi', asText(filters.numbersTo));
  if (asText(filters.language)) p.set('lr', asText(filters.language));
  if (asText(filters.region)) p.set('cr', asText(filters.region));
  if (asText(filters.siteOrDomain)) p.set('as_sitesearch', asText(filters.siteOrDomain));
  if (filters.termsAppearing) p.set('as_occt', filters.termsAppearing);
  if (asText(filters.fileType)) p.set('as_filetype', asText(filters.fileType));
  if (asText(filters.usageRights)) p.set('as_rights', asText(filters.usageRights));
  if (filters.safe) p.set('safe', filters.safe);

  // Time methods:
  // relative: d/w/m/y (past day/week/month/year)
  // custom: MM/DD/YYYY via tbs cdr range
  if (filters.time && filters.time.mode === 'relative' && filters.time.value) {
    p.set('as_qdr', filters.time.value);
    p.set('tbs', `qdr:${filters.time.value}`);
  } else if (
    filters.time &&
    filters.time.mode === 'custom' &&
    asText(filters.time.from) &&
    asText(filters.time.to)
  ) {
    p.set('tbs', `cdr:1,cd_min:${filters.time.from},cd_max:${filters.time.to}`);
  }

  p.set('num', String(numPerPage));
  p.set('start', String(start));
  p.set('pws', '0');
  return `https://www.google.com/search?${p.toString()}`;
}

async function getSearchResultsAdvanced(input) {
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
  const hasCoreQuery =
    hasText(input.allWords) || hasText(input.exactPhrase) || hasText(input.anyWords);
  if (!hasCoreQuery) throw new Error('Provide at least one of: allWords, exactPhrase, anyWords');

  const want = Math.max(1, typeof input.n === 'number' ? input.n : 10);
  const numPerPage = Math.min(
    100,
    Math.max(10, typeof input.numPerPage === 'number' ? input.numPerPage : 10)
  );
  const maxPages = Math.max(1, typeof input.maxPages === 'number' ? input.maxPages : 10);
  const includeSponsored =
    typeof input.includeSponsored === 'boolean' ? input.includeSponsored : true;

  const results = [];
  const pages = [];

  for (let i = 0; i < maxPages && results.length < want; i++) {
    const start = i * numPerPage;
    const url = buildAdvancedUrl(input, start, numPerPage);
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
    requested: want,
    returned: results.length,
    includeSponsored,
    pagesVisited: pages.length,
    pages,
    results,
  };
}

return await getSearchResultsAdvanced({
  allWords: 'openai agents',
  exactPhrase: 'reasoning model',
  noneWords: 'jobs',
  siteOrDomain: 'github.com',
  fileType: 'pdf',
  language: 'lang_en',
  region: 'countryUS',
  time: { mode: 'relative', value: 'm' }, // last month
  // time: { mode: 'custom', from: '01/01/2025', to: '03/01/2025' },
  n: 20,
  includeSponsored: true,
});
```
