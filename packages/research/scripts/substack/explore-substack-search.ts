/**
 * Exploration script: Substack search page DOM structure
 *
 * Run: npx tsx scripts/substack/explore-substack-search.ts [query] [dateRange]
 *
 * Examples:
 *   npx tsx scripts/substack/explore-substack-search.ts "claude code"
 *   npx tsx scripts/substack/explore-substack-search.ts "claude code" day
 *   npx tsx scripts/substack/explore-substack-search.ts "AI agents" week
 *
 * dateRange: day | week | month | year (optional)
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

// ---- Phase 1: Discover page structure & containers ----

const DISCOVER_STRUCTURE_JS = `(() => {
  // Overall page info
  const pageTitle = document.title;

  // Look for common container patterns
  const articles = document.querySelectorAll('article');
  const divWithRole = document.querySelectorAll('[role="article"], [role="listitem"]');
  const links = document.querySelectorAll('a[href]');

  // Find all unique data-testid values on the page
  const testIds = new Set();
  document.querySelectorAll('[data-testid]').forEach(el => {
    testIds.add(el.getAttribute('data-testid'));
  });

  // Find all unique class name patterns (first word of class)
  const classPatterns = new Set();
  document.querySelectorAll('[class]').forEach(el => {
    const cls = el.className;
    if (typeof cls === 'string') {
      cls.split(/\\s+/).forEach(c => {
        if (c.length > 3 && c.length < 50) classPatterns.add(c);
      });
    }
  });

  // Look for likely post containers - elements that repeat with similar structure
  const allDivs = document.querySelectorAll('div');
  const classCounts = {};
  for (const div of allDivs) {
    const cls = div.className;
    if (typeof cls === 'string' && cls.length > 5 && cls.length < 100) {
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
  }
  // Classes that appear 3-50 times are likely repeated content
  const repeatedClasses = Object.entries(classCounts)
    .filter(([, count]) => count >= 3 && count <= 50)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([cls, count]) => ({ className: cls.substring(0, 120), count }));

  // Look for common post selectors
  const searchResults = document.querySelectorAll('.search-result, .post-preview, .SearchResult');
  const postPreviews = document.querySelectorAll('[class*="post"], [class*="Post"], [class*="search"]');

  return {
    pageTitle,
    articleCount: articles.length,
    divWithRoleCount: divWithRole.length,
    linkCount: links.length,
    testIds: [...testIds].sort(),
    searchResultCount: searchResults.length,
    postPreviewCount: postPreviews.length,
    repeatedClasses,
    classPatterns: [...classPatterns].filter(c =>
      /post|search|result|article|card|item|entry|preview/i.test(c)
    ).sort(),
  };
})()`;

// ---- Phase 2: Find the actual search result elements ----

const FIND_SEARCH_RESULTS_JS = `(() => {
  // Strategy: find repeated link-heavy containers that look like search results
  // Substack search results typically have: title link, author/publication, date, preview text

  // Approach 1: Look for <a> tags pointing to substack posts
  const postLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(a => {
      const href = a.getAttribute('href') || '';
      return href.includes('.substack.com/p/') || href.includes('/p/');
    });

  const postLinkInfo = postLinks.slice(0, 15).map(a => ({
    text: a.textContent?.trim()?.substring(0, 120) || '',
    href: a.getAttribute('href')?.substring(0, 200) || '',
    tag: a.tagName,
    parentTag: a.parentElement?.tagName || '',
    parentClass: (a.parentElement?.className || '').substring(0, 100),
    grandparentTag: a.parentElement?.parentElement?.tagName || '',
    grandparentClass: (a.parentElement?.parentElement?.className || '').substring(0, 100),
  }));

  // Approach 2: Walk up from post links to find common ancestor containers
  const ancestorClasses = {};
  for (const link of postLinks.slice(0, 10)) {
    let el = link.parentElement;
    let depth = 0;
    while (el && depth < 8) {
      const cls = el.className;
      if (typeof cls === 'string' && cls.length > 3) {
        const key = el.tagName + '.' + cls.substring(0, 80);
        ancestorClasses[key] = (ancestorClasses[key] || 0) + 1;
      }
      el = el.parentElement;
      depth++;
    }
  }
  // Ancestors shared by many post links are likely the result container
  const commonAncestors = Object.entries(ancestorClasses)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({ selector: key, count }));

  return {
    postLinkCount: postLinks.length,
    postLinkInfo,
    commonAncestors,
  };
})()`;

// ---- Phase 3: Inspect the actual result items deeply ----

const INSPECT_RESULTS_DEEP_JS = `(() => {
  // Try to find result containers by walking up from post links
  const postLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(a => {
      const href = a.getAttribute('href') || '';
      return href.includes('.substack.com/p/') || href.includes('/p/');
    });

  if (postLinks.length === 0) return { error: 'No post links found' };

  // Find the first post link that has meaningful text (likely a title)
  const titleLinks = postLinks.filter(a => {
    const text = a.textContent?.trim() || '';
    return text.length > 10 && text.length < 300;
  });

  // For each title link, walk up to find the result container
  // A result container should have: title, author info, date, possibly preview
  const results = titleLinks.slice(0, 5).map((titleLink, idx) => {
    // Walk up to find a container that has multiple meaningful children
    let container = titleLink.parentElement;
    let depth = 0;
    while (container && depth < 6) {
      const childLinks = container.querySelectorAll('a[href]');
      const hasMultipleLinks = childLinks.length >= 2;
      const hasTimeOrDate = container.querySelector('time, [datetime], [class*="date"], [class*="time"], [class*="ago"]');
      if (hasMultipleLinks && (hasTimeOrDate || depth >= 3)) break;
      container = container.parentElement;
      depth++;
    }

    if (!container) return { index: idx, error: 'Could not find container' };

    // Extract all text content and structure from the container
    const allText = container.textContent?.trim()?.substring(0, 500) || '';
    const allLinks = Array.from(container.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent?.trim()?.substring(0, 100) || '',
      href: a.getAttribute('href')?.substring(0, 200) || '',
    }));
    const allImages = Array.from(container.querySelectorAll('img')).map(img => ({
      src: img.getAttribute('src')?.substring(0, 200) || '',
      alt: img.getAttribute('alt')?.substring(0, 100) || '',
    }));
    const timeElements = Array.from(container.querySelectorAll('time, [datetime]')).map(t => ({
      tag: t.tagName,
      datetime: t.getAttribute('datetime') || '',
      text: t.textContent?.trim() || '',
    }));

    // Get full child tree (3 levels)
    function childTree(el, d) {
      if (d > 3 || !el) return null;
      return Array.from(el.children).map(child => ({
        tag: child.tagName.toLowerCase(),
        class: (child.className || '').substring(0, 80),
        testId: child.getAttribute('data-testid') || null,
        text: child.children.length === 0 ? (child.textContent?.trim()?.substring(0, 100) || null) : null,
        href: child.getAttribute('href')?.substring(0, 150) || null,
        src: child.getAttribute('src')?.substring(0, 150) || null,
        childCount: child.children.length,
        children: d < 3 ? childTree(child, d + 1) : null,
      }));
    }

    return {
      index: idx,
      containerTag: container.tagName,
      containerClass: (container.className || '').substring(0, 120),
      containerDepth: depth,
      allText: allText.substring(0, 300),
      allLinks,
      allImages,
      timeElements,
      outerHTMLLength: container.outerHTML.length,
      childTree: childTree(container, 0),
    };
  });

  return { resultCount: titleLinks.length, results };
})()`;

// ---- Phase 4: Check for pagination, filters, sort options ----

const CHECK_FILTERS_JS = `(() => {
  // Look for filter/sort buttons, tabs, or dropdowns
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"]')).map(b => ({
    text: b.textContent?.trim()?.substring(0, 60) || '',
    class: (b.className || '').substring(0, 80),
    ariaSelected: b.getAttribute('aria-selected') || null,
  })).filter(b => b.text.length > 0 && b.text.length < 60);

  // Look for select/dropdown elements
  const selects = Array.from(document.querySelectorAll('select')).map(s => ({
    name: s.name || '',
    options: Array.from(s.options).map(o => ({ value: o.value, text: o.textContent?.trim() || '' })),
  }));

  // Check for "Load more" / "Show more" / pagination elements
  const loadMore = Array.from(document.querySelectorAll('button, a')).filter(el => {
    const text = el.textContent?.trim()?.toLowerCase() || '';
    return text.includes('load more') || text.includes('show more') ||
           text.includes('next') || text.includes('see more');
  }).map(el => ({
    tag: el.tagName,
    text: el.textContent?.trim()?.substring(0, 60) || '',
    href: el.getAttribute('href') || null,
  }));

  // Check URL parameters and their current values
  const urlParams = Object.fromEntries(new URL(window.location.href).searchParams);

  // Look for infinite scroll indicators
  const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="Spinner"]');

  return {
    url: window.location.href,
    urlParams,
    buttons: buttons.slice(0, 20),
    selects,
    loadMore,
    spinnerCount: spinners.length,
  };
})()`;

async function main(): Promise<void> {
  const query = process.argv[2] || 'claude code';
  const dateRange = process.argv[3]; // day | week | month | year

  const chrome = await connect({ launch: true });

  let url = `https://substack.com/search/${encodeURIComponent(query)}?searching=all_posts`;
  if (dateRange) {
    url += `&dateRange=${dateRange}`;
  }

  console.log(`--- Opening Substack search: "${query}"${dateRange ? ` (${dateRange})` : ''} ---`);
  console.log(`URL: ${url}`);
  const tab = (await chrome.call('tabs.create', {
    url,
    active: true,
  })) as { id: number };
  const tabId = tab.id;

  console.log('Waiting for page to load...');
  await sleep(6000);

  // Phase 1: Discover structure
  console.log('\n=== PHASE 1: Page Structure Discovery ===');
  const structure = await evaluate(chrome, tabId, DISCOVER_STRUCTURE_JS);
  console.log(JSON.stringify(structure, null, 2));

  // Phase 2: Find search result elements
  console.log('\n=== PHASE 2: Search Result Element Discovery ===');
  const resultElements = await evaluate(chrome, tabId, FIND_SEARCH_RESULTS_JS);
  console.log(JSON.stringify(resultElements, null, 2));

  // Phase 3: Deep inspection of result items
  console.log('\n=== PHASE 3: Deep Result Inspection ===');
  const deepInspection = await evaluate(chrome, tabId, INSPECT_RESULTS_DEEP_JS);
  console.log(JSON.stringify(deepInspection, null, 2));

  // Phase 4: Filters, pagination, sort
  console.log('\n=== PHASE 4: Filters & Pagination ===');
  const filters = await evaluate(chrome, tabId, CHECK_FILTERS_JS);
  console.log(JSON.stringify(filters, null, 2));

  // Phase 5: Scroll and check for more results
  console.log('\n=== PHASE 5: Scroll Check ===');
  const beforeCount = await evaluate(
    chrome,
    tabId,
    `
    Array.from(document.querySelectorAll('a[href]'))
      .filter(a => (a.getAttribute('href') || '').includes('/p/')).length
  `
  );
  console.log('Post links before scroll:', beforeCount);

  await evaluate(chrome, tabId, 'window.scrollBy(0, 2000)');
  await sleep(3000);

  const afterCount = await evaluate(
    chrome,
    tabId,
    `
    Array.from(document.querySelectorAll('a[href]'))
      .filter(a => (a.getAttribute('href') || '').includes('/p/')).length
  `
  );
  console.log('Post links after scroll:', afterCount);
  console.log(
    'Infinite scroll:',
    afterCount !== beforeCount ? 'YES (likely)' : 'NO (or slow loading)'
  );

  console.log('\n--- Done exploring Substack search! ---');
}

main().catch(console.error);
