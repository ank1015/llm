/**
 * Exploration script v2: refined X/Twitter feed extraction
 *
 * Handles: username parsing, "Show more" expansion, image URLs,
 * views count, scroll-based loading with deduplication.
 *
 * Run: npx tsx scripts/explore-x-feed.ts
 */
import { connect } from '@ank1015/llm-extension';

type EvalResult = { result: unknown };

async function evaluate(
  chrome: ReturnType<typeof connect> extends Promise<infer T> ? T : never,
  tabId: number,
  code: string
): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', { tabId, code })) as EvalResult;
  return res.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * JS code that runs in the browser to extract all tweet data from
 * currently visible articles. Returns an array of raw tweet objects.
 */
const EXTRACT_TWEETS_JS = `(() => {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  return Array.from(articles).map(article => {
    // --- Permalink & tweet ID (most reliable unique key) ---
    const permalinkEl = article.querySelector('a[href*="/status/"]');
    const permalink = permalinkEl?.getAttribute('href') || '';
    // Extract tweet ID from permalink like /user/status/123456
    const tweetId = permalink.match(/\\/status\\/(\\d+)/)?.[1] || '';

    // --- Author parsing ---
    // User-Name element contains: "Display Name@handle·time"
    // But it has child elements we can target individually
    const userNameContainer = article.querySelector('[data-testid="User-Name"]');
    let displayName = '';
    let handle = '';

    if (userNameContainer) {
      // The display name is in the first link's text
      const nameLinks = userNameContainer.querySelectorAll('a[role="link"]');
      if (nameLinks.length >= 1) {
        // First link has display name spans
        const firstLink = nameLinks[0];
        // Get just the direct text spans (not the verified icon)
        const nameSpans = firstLink.querySelectorAll('span');
        // The innermost span with actual text
        for (const span of nameSpans) {
          const text = span.textContent?.trim();
          if (text && !span.querySelector('span') && !span.querySelector('svg')) {
            displayName = text;
            break;
          }
        }
      }
      // Second link (or element with @) has the handle
      if (nameLinks.length >= 2) {
        handle = nameLinks[1]?.textContent?.trim() || '';
      }
    }

    // --- Verified badge ---
    const isVerified = !!article.querySelector('[data-testid="icon-verified"]');

    // --- Tweet text ---
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl?.textContent || '';
    const hasShowMore = !!article.querySelector('[data-testid="tweet-text-show-more-link"]');

    // --- Links inside tweet text ---
    const tweetLinks = tweetTextEl
      ? Array.from(tweetTextEl.querySelectorAll('a')).map(a => ({
          text: a.textContent || '',
          href: a.getAttribute('href') || '',
        }))
      : [];

    // --- Timestamp ---
    const timeEl = article.querySelector('time');
    const timestamp = timeEl?.getAttribute('datetime') || '';
    const relativeTime = timeEl?.textContent || '';

    // --- Engagement stats ---
    const replyBtn = article.querySelector('[data-testid="reply"]');
    const retweetBtn = article.querySelector('[data-testid="retweet"]');
    const likeBtn = article.querySelector('[data-testid="like"]');
    const unlikeBtn = article.querySelector('[data-testid="unlike"]');
    const bookmarkBtn = article.querySelector('[data-testid="bookmark"]');
    const removeBookmarkBtn = article.querySelector('[data-testid="removeBookmark"]');

    // Views: the last app-text-transition-container before the bookmark button
    // It's inside the action bar, after like, before bookmark/share
    const actionBar = article.querySelector('[role="group"]');
    let viewsCount = '';
    if (actionBar) {
      // Views is typically in the link that contains /analytics or the
      // standalone text after likes. Let's get all action bar items.
      const allTransitions = actionBar.querySelectorAll('[data-testid="app-text-transition-container"]');
      // Order: replies, retweets, likes, views (4th if present)
      if (allTransitions.length >= 4) {
        viewsCount = allTransitions[3]?.textContent?.trim() || '';
      }
    }

    // --- Social context (repost, pinned, etc.) ---
    const socialContextEl = article.querySelector('[data-testid="socialContext"]');
    const socialContext = socialContextEl?.textContent || '';
    const isRepost = socialContext.toLowerCase().includes('reposted');
    const isPinned = socialContext.toLowerCase().includes('pinned');

    // --- Media ---
    const images = Array.from(
      article.querySelectorAll('[data-testid="tweetPhoto"] img')
    ).map(img => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
    }));

    const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]');

    // Card (link preview)
    const cardEl = article.querySelector('[data-testid="card.wrapper"]');
    const cardLink = cardEl?.querySelector('a')?.getAttribute('href') || '';
    const cardTitle = cardEl?.querySelector('[data-testid="card.layoutLarge.title"], [data-testid="card.layoutSmall.title"]')?.textContent || '';

    // --- Quote tweet ---
    const quoteTweetEl = article.querySelector('[data-testid="quoteTweet"]');
    let quoteTweet = null;
    if (quoteTweetEl) {
      const qtText = quoteTweetEl.querySelector('[data-testid="tweetText"]')?.textContent || '';
      const qtUser = quoteTweetEl.querySelector('[data-testid="User-Name"]')?.textContent || '';
      const qtLink = quoteTweetEl.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
      quoteTweet = { text: qtText, user: qtUser, permalink: qtLink };
    }

    // --- Avatar ---
    const avatarImg = article.querySelector('img[src*="profile_images"]');
    const avatarUrl = avatarImg?.getAttribute('src') || '';

    return {
      tweetId,
      displayName,
      handle,
      isVerified,
      tweetText,
      hasShowMore,
      tweetLinks,
      timestamp,
      relativeTime,
      replies: replyBtn?.textContent?.trim() || '0',
      retweets: retweetBtn?.textContent?.trim() || '0',
      likes: (likeBtn || unlikeBtn)?.textContent?.trim() || '0',
      isLiked: !!unlikeBtn,
      views: viewsCount,
      isBookmarked: !!removeBookmarkBtn,
      socialContext,
      isRepost,
      isPinned,
      images,
      hasVideo,
      cardLink,
      cardTitle,
      quoteTweet,
      avatarUrl,
      permalink,
    };
  });
})()`;

/**
 * JS code to click all "Show more" buttons in visible tweets.
 * Returns the number of buttons clicked.
 */
const CLICK_SHOW_MORE_JS = `(() => {
  const buttons = document.querySelectorAll('article[data-testid="tweet"] [data-testid="tweet-text-show-more-link"]');
  let clicked = 0;
  buttons.forEach(btn => {
    btn.click();
    clicked++;
  });
  return clicked;
})()`;

/**
 * JS code to scroll down by a viewport height and return current scroll position.
 */
const SCROLL_DOWN_JS = `(() => {
  const before = window.scrollY;
  window.scrollBy(0, window.innerHeight);
  return { before, after: window.scrollY, height: document.body.scrollHeight };
})()`;

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });

  // Step 1: Open x.com/home
  console.log('--- Opening x.com/home ---');
  const tab = (await chrome.call('tabs.create', {
    url: 'https://x.com/home',
    active: true,
  })) as { id: number };
  const tabId = tab.id;
  console.log('Tab created:', tabId);

  // Wait for initial load
  console.log('Waiting for page to load...');
  await sleep(5000);

  const title = await evaluate(chrome, tabId, 'document.title');
  console.log('Page title:', title);

  // Step 2: Click any "Show more" buttons on initial tweets
  console.log('\n--- Expanding truncated tweets ---');
  const expandedCount = await evaluate(chrome, tabId, CLICK_SHOW_MORE_JS);
  console.log('Clicked "Show more" buttons:', expandedCount);
  if (expandedCount) await sleep(500);

  // Step 3: Extract initial tweets
  console.log('\n--- Extracting visible tweets ---');
  const initialTweets = (await evaluate(chrome, tabId, EXTRACT_TWEETS_JS)) as Array<
    Record<string, unknown>
  >;
  console.log(`Found ${initialTweets.length} tweets in DOM`);

  // Print first tweet in detail
  if (initialTweets.length > 0) {
    console.log('\n--- First tweet (full detail) ---');
    console.log(JSON.stringify(initialTweets[0], null, 2));
  }

  // Print summary of all visible
  console.log('\n--- All visible tweets summary ---');
  for (const t of initialTweets) {
    const text = String(t.tweetText || '').substring(0, 80);
    console.log(`  [${t.tweetId}] @${t.handle} | ${t.likes} likes | ${text}...`);
  }

  // Step 4: Scroll and collect with deduplication
  const TARGET_COUNT = 15;
  const seenIds = new Set<string>();
  const allTweets: Array<Record<string, unknown>> = [];

  // Add initial tweets
  for (const t of initialTweets) {
    const id = String(t.tweetId);
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      allTweets.push(t);
    }
  }

  console.log(`\n--- Scrolling to collect ${TARGET_COUNT} tweets (have ${allTweets.length}) ---`);

  let scrollAttempts = 0;
  const maxScrollAttempts = 20;

  while (allTweets.length < TARGET_COUNT && scrollAttempts < maxScrollAttempts) {
    scrollAttempts++;

    // Scroll down
    const scrollResult = (await evaluate(chrome, tabId, SCROLL_DOWN_JS)) as Record<string, number>;
    console.log(
      `  Scroll #${scrollAttempts}: position ${scrollResult.before} -> ${scrollResult.after}`
    );

    // Wait for new tweets to load
    await sleep(1500);

    // Expand any new "Show more" buttons
    const expanded = await evaluate(chrome, tabId, CLICK_SHOW_MORE_JS);
    if (expanded) {
      console.log(`    Expanded ${expanded} truncated tweets`);
      await sleep(500);
    }

    // Extract current visible tweets
    const currentTweets = (await evaluate(chrome, tabId, EXTRACT_TWEETS_JS)) as Array<
      Record<string, unknown>
    >;

    let newCount = 0;
    for (const t of currentTweets) {
      const id = String(t.tweetId);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allTweets.push(t);
        newCount++;
      }
    }

    console.log(
      `    Found ${currentTweets.length} in DOM, ${newCount} new (total: ${allTweets.length})`
    );

    // If scroll didn't move, we might be at the end
    if (scrollResult.before === scrollResult.after) {
      console.log('    Reached bottom of page, stopping');
      break;
    }
  }

  // Step 5: Final results
  console.log(`\n=== FINAL RESULTS: ${allTweets.length} tweets collected ===\n`);

  for (let i = 0; i < allTweets.length; i++) {
    const t = allTweets[i]!;
    console.log(`--- Tweet ${i + 1} ---`);
    console.log(`  Author: ${t.displayName} (${t.handle})${t.isVerified ? ' ✓' : ''}`);
    console.log(`  Time: ${t.timestamp} (${t.relativeTime})`);
    console.log(
      `  Text: ${String(t.tweetText || '').substring(0, 150)}${String(t.tweetText || '').length > 150 ? '...' : ''}`
    );
    if ((t.tweetLinks as Array<unknown>)?.length)
      console.log(`  Links: ${JSON.stringify(t.tweetLinks)}`);
    console.log(
      `  Stats: ${t.replies} replies, ${t.retweets} RTs, ${t.likes} likes, ${t.views} views`
    );
    if (t.isRepost) console.log(`  Repost by: ${t.socialContext}`);
    if (t.isPinned) console.log(`  [PINNED]`);
    if ((t.images as Array<unknown>)?.length)
      console.log(
        `  Images: ${(t.images as Array<{ src: string }>).map((img) => img.src.substring(0, 60) + '...').join(', ')}`
      );
    if (t.hasVideo) console.log(`  [HAS VIDEO]`);
    if (t.quoteTweet) console.log(`  Quote: ${JSON.stringify(t.quoteTweet)}`);
    if (t.cardLink) console.log(`  Card: ${t.cardTitle} -> ${t.cardLink}`);
    console.log(`  Permalink: https://x.com${t.permalink}`);
    console.log('');
  }

  // Step 6: Dump full JSON of first 3 for detailed inspection
  console.log('\n=== RAW JSON (first 3 tweets) ===');
  console.log(JSON.stringify(allTweets.slice(0, 3), null, 2));
}

main().catch(console.error);
