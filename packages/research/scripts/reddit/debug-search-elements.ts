/**
 * Debug: what's actually inside each sdui-post-unit on the search page?
 *
 * Run: npx tsx scripts/reddit/debug-search-elements.ts "claude code"
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

const DEBUG_JS = `(() => {
  // Count all candidate selectors
  const counts = {
    'sdui-post-unit': document.querySelectorAll('[data-testid="sdui-post-unit"]').length,
    'search-post-unit': document.querySelectorAll('[data-testid="search-post-unit"]').length,
    'search-sdui-post': document.querySelectorAll('[data-testid="search-sdui-post"]').length,
    'post-title': document.querySelectorAll('[data-testid="post-title"]').length,
    'post-title-text': document.querySelectorAll('[data-testid="post-title-text"]').length,
    'search-counter-row': document.querySelectorAll('[data-testid="search-counter-row"]').length,
    'faceplate-number': document.querySelectorAll('faceplate-number').length,
    'faceplate-timeago': document.querySelectorAll('faceplate-timeago').length,
  };

  // For each sdui-post-unit, dump: testids inside, all links, text preview
  const units = document.querySelectorAll('[data-testid="sdui-post-unit"]');
  const details = Array.from(units).map((unit, i) => {
    const testIds = [];
    unit.querySelectorAll('[data-testid]').forEach(el => {
      testIds.push(el.getAttribute('data-testid'));
    });

    const links = Array.from(unit.querySelectorAll('a')).slice(0, 5).map(a => ({
      href: a.getAttribute('href') || '',
      text: a.textContent?.trim()?.substring(0, 60) || '',
      testId: a.getAttribute('data-testid') || null,
    }));

    const text = unit.textContent?.trim()?.substring(0, 200) || '';

    // Is this inside a search-post-unit?
    const parentTestId = unit.parentElement?.closest('[data-testid]')?.getAttribute('data-testid') || null;

    return { index: i, testIds, links, textPreview: text, parentTestId };
  });

  // Also check: are post-title elements outside sdui-post-unit?
  const titleEls = document.querySelectorAll('[data-testid="post-title"]');
  const titleLocations = Array.from(titleEls).slice(0, 5).map(el => {
    const closestUnit = el.closest('[data-testid="sdui-post-unit"]');
    const closestSearch = el.closest('[data-testid="search-post-unit"]');
    return {
      href: el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '',
      text: el.textContent?.trim()?.substring(0, 60) || '',
      inSduiUnit: !!closestUnit,
      inSearchUnit: !!closestSearch,
      parentTag: el.parentElement?.tagName?.toLowerCase() || '',
    };
  });

  return { counts, sduiDetails: details, titleLocations };
})()`;

async function main(): Promise<void> {
  const query = process.argv[2] || 'claude code';
  const chrome = await connect({ launch: true });

  const url = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=relevance&t=all`;
  console.log(`Opening: ${url}`);

  const tab = (await chrome.call('tabs.create', { url, active: true })) as { id: number };
  console.log('Waiting 6s for load...');
  await sleep(6000);

  const result = await evaluate(chrome, tab.id, DEBUG_JS);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
