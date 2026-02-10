/**
 * Exploration script: Substack post page DOM structure
 *
 * Run: npx tsx scripts/substack/explore-substack-post.ts [url]
 *
 * Examples:
 *   npx tsx scripts/substack/explore-substack-post.ts https://www.neuroai.science/p/claude-code-for-scientists
 *   npx tsx scripts/substack/explore-substack-post.ts https://www.bensbites.com/p/claude-code-for-everybody
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

// ---- Phase 1: Page structure & key selectors ----

const DISCOVER_STRUCTURE_JS = `(() => {
  const pageTitle = document.title;

  // Find all data-testid values
  const testIds = new Set();
  document.querySelectorAll('[data-testid]').forEach(el => {
    testIds.add(el.getAttribute('data-testid'));
  });

  // Class patterns related to posts/articles
  const classPatterns = new Set();
  document.querySelectorAll('[class]').forEach(el => {
    const cls = el.className;
    if (typeof cls === 'string') {
      cls.split(/\\s+/).forEach(c => {
        if (c.length > 3 && c.length < 50 &&
            /post|article|body|title|subtitle|author|date|like|comment|share|header|meta|byline|content/i.test(c)) {
          classPatterns.add(c);
        }
      });
    }
  });

  // Key semantic elements
  const articles = document.querySelectorAll('article');
  const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()?.substring(0, 120) || '');
  const h2s = Array.from(document.querySelectorAll('h2')).slice(0, 5).map(h => h.textContent?.trim()?.substring(0, 120) || '');
  const timeEls = Array.from(document.querySelectorAll('time')).map(t => ({
    datetime: t.getAttribute('datetime') || '',
    text: t.textContent?.trim() || '',
  }));

  return {
    pageTitle,
    testIds: [...testIds].sort(),
    classPatterns: [...classPatterns].sort(),
    articleCount: articles.length,
    h1s,
    h2s,
    timeElements: timeEls,
  };
})()`;

// ---- Phase 2: Post header / metadata ----

const INSPECT_POST_HEADER_JS = `(() => {
  // Title - likely h1 or specific class
  const h1 = document.querySelector('h1');
  const title = h1?.textContent?.trim() || '';
  const titleClass = String(h1?.className || '');

  // Subtitle - often h2 or specific class
  const subtitleEl = document.querySelector('.subtitle, h2.subtitle, [class*="subtitle"]');
  const subtitle = subtitleEl?.textContent?.trim()?.substring(0, 300) || '';
  const subtitleClass = String(subtitleEl?.className || '');

  // Author info
  const authorLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
    const href = a.getAttribute('href') || '';
    return href.includes('/profile/') || href.includes('/@');
  }).slice(0, 5).map(a => ({
    text: a.textContent?.trim()?.substring(0, 80) || '',
    href: a.getAttribute('href') || '',
    parentClass: String(a.parentElement?.className || '').substring(0, 80),
  }));

  // Publication name
  const pubLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
    const href = a.getAttribute('href') || '';
    return href.match(/^https?:\\/\\/[^/]+\\/?$/) && !href.includes('substack.com');
  }).slice(0, 3).map(a => ({
    text: a.textContent?.trim()?.substring(0, 80) || '',
    href: a.getAttribute('href') || '',
  }));

  // Date / timestamp
  const timeEl = document.querySelector('time');
  const dateInfo = timeEl ? {
    text: timeEl.textContent?.trim() || '',
    datetime: timeEl.getAttribute('datetime') || '',
    parentClass: String(timeEl.parentElement?.className || '').substring(0, 80),
  } : null;

  // Look for post-meta area near the title
  const metaEls = document.querySelectorAll('[class*="meta"], [class*="byline"], [class*="author"]');
  const metaInfo = Array.from(metaEls).slice(0, 5).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 100),
    text: el.textContent?.trim()?.substring(0, 200) || '',
  }));

  return {
    title, titleClass,
    subtitle, subtitleClass,
    authorLinks,
    pubLinks,
    dateInfo,
    metaInfo,
  };
})()`;

// ---- Phase 3: Post body content ----

const INSPECT_POST_BODY_JS = `(() => {
  // Look for the main content area
  const bodySelectors = [
    '.body.markup',
    '.post-content',
    '[class*="body"] [class*="markup"]',
    'article .body',
    '.available-content',
    '.entry-content',
  ];

  let bodyEl = null;
  let bodySelector = '';
  for (const sel of bodySelectors) {
    bodyEl = document.querySelector(sel);
    if (bodyEl) { bodySelector = sel; break; }
  }

  if (!bodyEl) {
    // Fallback: find the largest text block
    const divs = Array.from(document.querySelectorAll('div'));
    let maxText = 0;
    for (const div of divs) {
      const len = div.textContent?.length || 0;
      if (len > maxText && div.querySelectorAll('p').length > 2) {
        maxText = len;
        bodyEl = div;
      }
    }
    bodySelector = 'fallback (largest div with >2 paragraphs)';
  }

  if (!bodyEl) return { error: 'No body element found' };

  // Content stats
  const paragraphs = bodyEl.querySelectorAll('p');
  const headings = bodyEl.querySelectorAll('h1, h2, h3, h4');
  const images = bodyEl.querySelectorAll('img');
  const links = bodyEl.querySelectorAll('a[href]');
  const blockquotes = bodyEl.querySelectorAll('blockquote');
  const codeBlocks = bodyEl.querySelectorAll('pre, code');

  // First few paragraphs
  const firstParagraphs = Array.from(paragraphs).slice(0, 3).map(p =>
    p.textContent?.trim()?.substring(0, 200) || ''
  );

  // Full text length
  const fullText = bodyEl.textContent || '';

  return {
    bodySelector,
    bodyClass: String(bodyEl.className || '').substring(0, 120),
    bodyTag: bodyEl.tagName.toLowerCase(),
    stats: {
      paragraphCount: paragraphs.length,
      headingCount: headings.length,
      imageCount: images.length,
      linkCount: links.length,
      blockquoteCount: blockquotes.length,
      codeBlockCount: codeBlocks.length,
      totalCharacters: fullText.length,
    },
    firstParagraphs,
    // Child tree (first 2 levels to see structure)
    topLevelChildren: Array.from(bodyEl.children).slice(0, 15).map(child => ({
      tag: child.tagName.toLowerCase(),
      class: String(child.className || '').substring(0, 80),
      text: child.textContent?.trim()?.substring(0, 100) || '',
      childCount: child.children.length,
    })),
  };
})()`;

// ---- Phase 4: Engagement stats (likes, comments, shares) ----

const INSPECT_ENGAGEMENT_JS = `(() => {
  // Look for like/heart buttons and counts
  const likeEls = document.querySelectorAll(
    '[class*="like"], [class*="heart"], [class*="Like"], [class*="Heart"]'
  );
  const likeInfo = Array.from(likeEls).slice(0, 5).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 80),
    text: el.textContent?.trim()?.substring(0, 60) || '',
    ariaLabel: el.getAttribute('aria-label') || '',
  }));

  // Comment count
  const commentEls = document.querySelectorAll(
    '[class*="comment"], [class*="Comment"], a[href*="comments"]'
  );
  const commentInfo = Array.from(commentEls).slice(0, 5).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 80),
    text: el.textContent?.trim()?.substring(0, 60) || '',
    href: el.getAttribute('href') || '',
  }));

  // Share button
  const shareEls = document.querySelectorAll(
    '[class*="share"], [class*="Share"], [class*="restack"], [class*="Restack"]'
  );
  const shareInfo = Array.from(shareEls).slice(0, 5).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 80),
    text: el.textContent?.trim()?.substring(0, 60) || '',
  }));

  // Look for buttons in a toolbar/action area
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
  const actionButtons = buttons.filter(b => {
    const text = b.textContent?.trim()?.toLowerCase() || '';
    const label = b.getAttribute('aria-label')?.toLowerCase() || '';
    return /like|heart|comment|share|restack|bookmark|save/i.test(text + ' ' + label);
  }).map(b => ({
    text: b.textContent?.trim()?.substring(0, 60) || '',
    ariaLabel: b.getAttribute('aria-label') || '',
    class: String(b.className || '').substring(0, 80),
  }));

  return { likeInfo, commentInfo, shareInfo, actionButtons };
})()`;

// ---- Phase 5: Paywall / truncation check ----

const CHECK_PAYWALL_JS = `(() => {
  // Look for paywall indicators
  const paywallEls = document.querySelectorAll(
    '[class*="paywall"], [class*="Paywall"], [class*="truncat"], [class*="subscribe-prompt"], [class*="gate"]'
  );
  const paywallInfo = Array.from(paywallEls).slice(0, 3).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 100),
    text: el.textContent?.trim()?.substring(0, 200) || '',
  }));

  // Subscribe / upgrade buttons
  const subscribeBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
    const text = el.textContent?.trim()?.toLowerCase() || '';
    return /subscribe|upgrade|unlock|read more|continue reading/i.test(text);
  }).map(el => ({
    tag: el.tagName.toLowerCase(),
    text: el.textContent?.trim()?.substring(0, 80) || '',
    href: el.getAttribute('href') || '',
    class: String(el.className || '').substring(0, 80),
  }));

  // Check if content is visually truncated (gradient overlay, etc.)
  const overlays = document.querySelectorAll(
    '[class*="gradient"], [class*="fade"], [class*="overlay"], [class*="blur"]'
  );
  const overlayInfo = Array.from(overlays).slice(0, 3).map(el => ({
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').substring(0, 100),
  }));

  return { paywallInfo, subscribeBtns, overlayInfo };
})()`;

async function main(): Promise<void> {
  const url = process.argv[2] || 'https://www.neuroai.science/p/claude-code-for-scientists';

  const chrome = await connect({ launch: true });

  console.log(`--- Opening Substack post ---`);
  console.log(`URL: ${url}`);
  const tab = (await chrome.call('tabs.create', {
    url,
    active: true,
  })) as { id: number };
  const tabId = tab.id;

  console.log('Waiting for page to load...');
  await sleep(6000);

  // Phase 1: Structure
  console.log('\n=== PHASE 1: Page Structure ===');
  const structure = await evaluate(chrome, tabId, DISCOVER_STRUCTURE_JS);
  console.log(JSON.stringify(structure, null, 2));

  // Phase 2: Post header
  console.log('\n=== PHASE 2: Post Header / Metadata ===');
  const header = await evaluate(chrome, tabId, INSPECT_POST_HEADER_JS);
  console.log(JSON.stringify(header, null, 2));

  // Phase 3: Post body
  console.log('\n=== PHASE 3: Post Body Content ===');
  const body = await evaluate(chrome, tabId, INSPECT_POST_BODY_JS);
  console.log(JSON.stringify(body, null, 2));

  // Phase 4: Engagement
  console.log('\n=== PHASE 4: Engagement Stats ===');
  const engagement = await evaluate(chrome, tabId, INSPECT_ENGAGEMENT_JS);
  console.log(JSON.stringify(engagement, null, 2));

  // Phase 5: Paywall check
  console.log('\n=== PHASE 5: Paywall / Truncation ===');
  const paywall = await evaluate(chrome, tabId, CHECK_PAYWALL_JS);
  console.log(JSON.stringify(paywall, null, 2));

  console.log('\n--- Done exploring Substack post! ---');
}

main().catch(console.error);
