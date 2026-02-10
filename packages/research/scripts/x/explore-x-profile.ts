/**
 * Exploration script: inspect X/Twitter profile page DOM structure
 *
 * Run: npx tsx scripts/explore-x-profile.ts
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
  const username = 'ank1015';

  console.log(`--- Opening https://x.com/${username} ---`);
  const tab = (await chrome.call('tabs.create', {
    url: `https://x.com/${username}`,
    active: true,
  })) as { id: number };
  const tabId = tab.id;

  console.log('Waiting for page to load...');
  await sleep(5000);

  const title = await evaluate(chrome, tabId, 'document.title');
  console.log('Page title:', title);

  // Step 1: Find all data-testid attributes on the profile page (not inside tweets)
  console.log('\n--- All data-testid on page (outside tweets) ---');
  const pageTestIds = await evaluate(
    chrome,
    tabId,
    `(() => {
    const all = document.querySelectorAll('[data-testid]');
    const seen = new Set();
    const results = [];
    for (const el of all) {
      // Skip elements inside tweet articles
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
  console.log(JSON.stringify(pageTestIds, null, 2));

  // Step 2: Extract profile header info
  console.log('\n--- Profile header extraction ---');
  const profileData = await evaluate(
    chrome,
    tabId,
    `(() => {
    // Display name
    const nameEl = document.querySelector('[data-testid="UserName"]');
    const displayName = nameEl?.textContent || '';

    // Bio / description
    const bioEl = document.querySelector('[data-testid="UserDescription"]');
    const bio = bioEl?.textContent || '';
    const bioLinks = bioEl
      ? Array.from(bioEl.querySelectorAll('a')).map(a => ({
          text: a.textContent || '',
          href: a.getAttribute('href') || '',
        }))
      : [];

    // Profile header image
    const headerImg = document.querySelector('[data-testid="UserProfileHeader_Items"]');
    const headerItems = headerImg?.textContent || '';

    // Location, website, join date from header items
    const locationEl = document.querySelector('[data-testid="UserLocation"]');
    const location = locationEl?.textContent || '';

    const urlEl = document.querySelector('[data-testid="UserUrl"]');
    const website = urlEl?.textContent || '';
    const websiteHref = urlEl?.querySelector('a')?.getAttribute('href') || '';

    const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
    const joinDate = joinDateEl?.textContent || '';

    const birthdateEl = document.querySelector('[data-testid="UserBirthdate"]');
    const birthdate = birthdateEl?.textContent || '';

    // Professional category
    const categoryEl = document.querySelector('[data-testid="UserProfessionalCategory"]');
    const category = categoryEl?.textContent || '';

    // Avatar
    const avatarImg = document.querySelector('[data-testid="UserAvatar-Container-unknown"] img, a[href$="/photo"] img');
    const avatarUrl = avatarImg?.getAttribute('src') || '';

    // Banner image
    const bannerImg = document.querySelector('a[href$="/header_photo"] img');
    const bannerUrl = bannerImg?.getAttribute('src') || '';

    // Following / Followers counts
    const followingLink = document.querySelector('a[href$="/following"]');
    const followingCount = followingLink?.textContent || '';

    const followersLink = document.querySelector('a[href$="/verified_followers"]')
      || document.querySelector('a[href$="/followers"]');
    const followersCount = followersLink?.textContent || '';

    // Verified badge
    const verified = !!document.querySelector('[data-testid="icon-verified"]');

    // Is the user followed by you?
    const followBtn = document.querySelector('[data-testid$="-follow"]');
    const unfollowBtn = document.querySelector('[data-testid$="-unfollow"]');
    const followStatus = followBtn?.getAttribute('data-testid') || unfollowBtn?.getAttribute('data-testid') || '';

    return {
      displayName,
      bio,
      bioLinks,
      headerItems,
      location,
      website,
      websiteHref,
      joinDate,
      birthdate,
      category,
      avatarUrl,
      bannerUrl,
      followingCount,
      followersCount,
      verified,
      followStatus,
    };
  })()`
  );
  console.log(JSON.stringify(profileData, null, 2));

  // Step 3: Check the UserName element more carefully for handle parsing
  console.log('\n--- UserName element structure ---');
  const userNameStructure = await evaluate(
    chrome,
    tabId,
    `(() => {
    const el = document.querySelector('[data-testid="UserName"]');
    if (!el) return 'not found';
    return {
      outerHTML: el.outerHTML.substring(0, 1500),
      text: el.textContent,
      childTestIds: Array.from(el.querySelectorAll('[data-testid]')).map(c => c.getAttribute('data-testid')),
      spans: Array.from(el.querySelectorAll('span')).map(s => s.textContent?.substring(0, 50)),
    };
  })()`
  );
  console.log(JSON.stringify(userNameStructure, null, 2));

  // Step 4: Check how tweets look on a profile page (same as feed or different?)
  console.log('\n--- Tweet articles on profile ---');
  const tweetCount = await evaluate(
    chrome,
    tabId,
    `document.querySelectorAll('article[data-testid="tweet"]').length`
  );
  console.log('Tweet count:', tweetCount);

  // Extract first tweet to compare with feed structure
  console.log('\n--- First profile tweet data-testid elements ---');
  const firstTweetTestIds = await evaluate(
    chrome,
    tabId,
    `(() => {
    const article = document.querySelector('article[data-testid="tweet"]');
    if (!article) return 'no tweets';
    const elements = article.querySelectorAll('[data-testid]');
    return Array.from(elements).map(el => ({
      testId: el.getAttribute('data-testid'),
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.substring(0, 80) || '',
    }));
  })()`
  );
  console.log(JSON.stringify(firstTweetTestIds, null, 2));

  // Step 5: Check for pinned tweet indicator
  console.log('\n--- Social context on profile tweets ---');
  const socialContexts = await evaluate(
    chrome,
    tabId,
    `(() => {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    return Array.from(articles).slice(0, 5).map((article, i) => {
      const sc = article.querySelector('[data-testid="socialContext"]');
      return {
        index: i,
        socialContext: sc?.textContent || null,
      };
    });
  })()`
  );
  console.log(JSON.stringify(socialContexts, null, 2));

  // Step 6: Look for tab navigation (Posts, Replies, Media, Likes)
  console.log('\n--- Profile tabs ---');
  const tabs = await evaluate(
    chrome,
    tabId,
    `(() => {
    const nav = document.querySelector('nav[role="navigation"]');
    if (!nav) return 'no nav found';
    const links = nav.querySelectorAll('a[role="tab"]');
    return Array.from(links).map(a => ({
      text: a.textContent || '',
      href: a.getAttribute('href') || '',
      selected: a.getAttribute('aria-selected') || '',
    }));
  })()`
  );
  console.log(JSON.stringify(tabs, null, 2));

  console.log('\n--- Done exploring profile! ---');
}

main().catch(console.error);
