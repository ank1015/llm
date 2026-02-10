/**
 * Exploration script: inspect X/Twitter search results DOM structure
 *
 * Run: npx tsx scripts/explore-x-search.ts
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

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });

  // Search with date filter
  const query = 'claude code';
  const since = '2026-02-01';
  const searchQuery = `${query} since:${since}`;
  const url = `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query`;

  console.log(`--- Opening search: "${searchQuery}" ---`);
  console.log(`URL: ${url}`);
  const tab = (await chrome.call('tabs.create', { url, active: true })) as { id: number };
  const tabId = tab.id;

  console.log('Waiting for page to load...');
  await sleep(5000);

  const title = await evaluate(chrome, tabId, 'document.title');
  console.log('Page title:', title);

  // Step 1: Check what tabs exist on search results (Top, Latest, People, etc.)
  console.log('\n--- Search result tabs ---');
  const tabs = await evaluate(
    chrome,
    tabId,
    `(() => {
    const navLinks = document.querySelectorAll('nav[role="navigation"] a[role="tab"]');
    return Array.from(navLinks).map(a => ({
      text: a.textContent || '',
      href: a.getAttribute('href') || '',
      selected: a.getAttribute('aria-selected') || '',
    }));
  })()`
  );
  console.log(JSON.stringify(tabs, null, 2));

  // Step 2: Check if tweet articles exist (same structure as feed?)
  console.log('\n--- Tweet articles on search ---');
  const tweetCount = await evaluate(
    chrome,
    tabId,
    `document.querySelectorAll('article[data-testid="tweet"]').length`
  );
  console.log('Tweet count:', tweetCount);

  // Step 3: data-testid elements unique to search page (outside tweets)
  console.log('\n--- Search-specific data-testid elements ---');
  const searchTestIds = await evaluate(
    chrome,
    tabId,
    `(() => {
    const all = document.querySelectorAll('[data-testid]');
    const seen = new Set();
    const results = [];
    for (const el of all) {
      if (el.closest('article[data-testid="tweet"]') && el.getAttribute('data-testid') !== 'tweet') continue;
      const tid = el.getAttribute('data-testid');
      if (!seen.has(tid)) {
        seen.add(tid);
        results.push({
          testId: tid,
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.substring(0, 80) || '',
        });
      }
    }
    return results;
  })()`
  );
  console.log(JSON.stringify(searchTestIds, null, 2));

  // Step 4: Extract first few tweets to compare structure with feed
  console.log('\n--- First 3 search result tweets ---');
  const searchTweets = await evaluate(
    chrome,
    tabId,
    `(() => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    return Array.from(articles).slice(0, 3).map((article, i) => {
      const permalinkEl = article.querySelector('a[href*="/status/"]');
      const permalink = permalinkEl?.getAttribute('href') || '';
      const tweetId = permalink.match(/\\/status\\/(\\d+)/)?.[1] || '';

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

      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      const text = tweetTextEl?.textContent || '';
      const timeEl = article.querySelector('time');
      const timestamp = timeEl?.getAttribute('datetime') || '';

      const replyBtn = article.querySelector('[data-testid="reply"]');
      const retweetBtn = article.querySelector('[data-testid="retweet"]');
      const likeBtn = article.querySelector('[data-testid="like"]') || article.querySelector('[data-testid="unlike"]');

      const actionBar = article.querySelector('[role="group"]');
      let views = '';
      if (actionBar) {
        const tr = actionBar.querySelectorAll('[data-testid="app-text-transition-container"]');
        if (tr.length >= 4) views = tr[3]?.textContent?.trim() || '';
      }

      const socialContext = article.querySelector('[data-testid="socialContext"]')?.textContent || '';

      return {
        index: i, tweetId, displayName, handle, text: text.substring(0, 150),
        timestamp, socialContext,
        replies: replyBtn?.textContent?.trim() || '0',
        retweets: retweetBtn?.textContent?.trim() || '0',
        likes: likeBtn?.textContent?.trim() || '0',
        views,
        permalink,
      };
    });
  })()`
  );
  console.log(JSON.stringify(searchTweets, null, 2));

  // Step 5: Check if "Latest" tab URL differs
  console.log('\n--- Checking "Latest" tab link ---');
  const latestTab = await evaluate(
    chrome,
    tabId,
    `(() => {
    const navLinks = document.querySelectorAll('nav[role="navigation"] a[role="tab"]');
    for (const a of navLinks) {
      if (a.textContent?.trim() === 'Latest') {
        return { text: a.textContent, href: a.getAttribute('href') };
      }
    }
    return null;
  })()`
  );
  console.log(JSON.stringify(latestTab, null, 2));

  console.log('\n--- Done exploring search! ---');
}

main().catch(console.error);
