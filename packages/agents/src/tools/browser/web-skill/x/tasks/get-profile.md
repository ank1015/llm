# Task: getProfile

File: `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-profile.md`  
Works on URLs:

- `https://x.com/<handle>`

Use this snippet to extract profile metadata from an X profile page.

Compatibility note:

- Keep adapted code in plain JavaScript for REPL stability.
- Avoid TypeScript type annotations, optional chaining (`?.`), and nullish coalescing (`??`) in adapted variants.

```js
const PROFILE_STATE = String.raw`(() => {
  const path = window.location.pathname;
  const loginRequired =
    path.indexOf('/i/flow/login') >= 0 ||
    document.querySelector('input[name="session[username_or_email]"]') !== null ||
    document.querySelector('input[autocomplete="username"]') !== null ||
    document.querySelector('a[href*="/i/flow/login"]') !== null ||
    document.querySelector('[data-testid="loginButton"]') !== null;

  const primary = document.querySelector('[data-testid="primaryColumn"]');
  const hasUserName = primary
    ? primary.querySelector('[data-testid="UserName"]') !== null
    : document.querySelector('[data-testid="UserName"]') !== null;

  return {
    url: window.location.href,
    title: document.title,
    loginRequired,
    hasPrimaryColumn: primary !== null,
    hasUserName,
    ready: loginRequired || hasUserName,
  };
})()`;

const EXTRACT_PROFILE = String.raw`(() => {
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  const parseCount = (value) => {
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

  const detectLoginRequired = () => {
    return (
      window.location.pathname.indexOf('/i/flow/login') >= 0 ||
      document.querySelector('input[name="session[username_or_email]"]') !== null ||
      document.querySelector('input[autocomplete="username"]') !== null ||
      document.querySelector('a[href*="/i/flow/login"]') !== null ||
      document.querySelector('[data-testid="loginButton"]') !== null
    );
  };

  const primary =
    document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main') || document;

  const pathMatch = window.location.pathname.match(/^\/([A-Za-z0-9_]{1,15})/);
  const handleFromPath = pathMatch ? pathMatch[1] : '';

  const userName = primary.querySelector('[data-testid="UserName"]');
  const handleSpans = userName ? userName.querySelectorAll('span') : [];

  let handle = '';
  let displayName = '';

  for (const span of handleSpans) {
    if (!(span instanceof HTMLElement)) continue;
    const value = clean(span.textContent || '');
    if (!value) continue;

    if (!handle && value.indexOf('@') === 0) {
      handle = value.replace(/^@+/, '');
      continue;
    }

    if (!displayName && value.indexOf('@') !== 0 && value !== '·') {
      displayName = value;
    }
  }

  if (!handle && handleFromPath) {
    handle = handleFromPath;
  }

  const bioNode = primary.querySelector('[data-testid="UserDescription"]');
  const locationNode = primary.querySelector('[data-testid="UserLocation"]');
  const joinNode = primary.querySelector('[data-testid="UserJoinDate"]');
  const birthNode = primary.querySelector('[data-testid="UserBirthdate"]');

  const followingLink = primary.querySelector('a[href$="/following"], a[href*="/following"]');
  const followersLink =
    primary.querySelector('a[href$="/verified_followers"]') ||
    primary.querySelector('a[href$="/followers"]') ||
    primary.querySelector('a[href*="/followers"]');

  const websiteLinkCandidates = Array.from(primary.querySelectorAll('a[href^="http"]'));
  let websiteUrl = '';
  for (const node of websiteLinkCandidates) {
    if (!(node instanceof HTMLAnchorElement)) continue;
    const href = clean(node.getAttribute('href') || '');
    if (!href) continue;
    if (href.indexOf('x.com/') >= 0) continue;
    if (href.indexOf('twitter.com/') >= 0) continue;
    websiteUrl = href;
    break;
  }

  let profileImage = '';
  if (handle) {
    const byHandle = primary.querySelector('a[href="/' + handle + '/photo"] img');
    if (byHandle instanceof HTMLImageElement) {
      profileImage = clean(byHandle.getAttribute('src') || '');
    }
  }
  if (!profileImage) {
    const fallbackImage = primary.querySelector('img[src*="profile_images"]');
    if (fallbackImage instanceof HTMLImageElement) {
      profileImage = clean(fallbackImage.getAttribute('src') || '');
    }
  }

  let bannerImage = '';
  if (handle) {
    const byHandle = primary.querySelector('a[href="/' + handle + '/header_photo"] img');
    if (byHandle instanceof HTMLImageElement) {
      bannerImage = clean(byHandle.getAttribute('src') || '');
    }
  }
  if (!bannerImage) {
    const fallbackBanner = primary.querySelector('[data-testid="ProfileHeaderBanner"] img');
    if (fallbackBanner instanceof HTMLImageElement) {
      bannerImage = clean(fallbackBanner.getAttribute('src') || '');
    }
  }

  const tabs = [];
  for (const tab of primary.querySelectorAll('[role="tab"]')) {
    if (!(tab instanceof HTMLElement)) continue;
    const label = clean(tab.textContent || '');
    if (label) tabs.push(label);
  }

  return {
    url: window.location.href,
    title: document.title,
    loginRequired: detectLoginRequired(),
    profile: {
      handle,
      displayName,
      bio: clean(bioNode ? bioNode.textContent || '' : ''),
      location: clean(locationNode ? locationNode.textContent || '' : ''),
      joinedDate: clean(joinNode ? joinNode.textContent || '' : ''),
      birthDate: clean(birthNode ? birthNode.textContent || '' : ''),
      websiteUrl,
      profileImage,
      bannerImage,
      verified: userName ? userName.querySelector('[data-testid="icon-verified"]') !== null : false,
      protected: userName ? userName.querySelector('[data-testid="icon-lock"]') !== null : false,
      following: parseCount(followingLink ? followingLink.textContent || '' : ''),
      followers: parseCount(followersLink ? followersLink.textContent || '' : ''),
      tabs,
    },
  };
})()`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHandle(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
    try {
      const url = new URL(raw);
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  return raw.replace(/^@+/, '').replace(/\/.*$/, '');
}

function buildProfileUrl(handleOrUrl) {
  const handle = normalizeHandle(handleOrUrl);
  if (!handle) throw new Error('handleOrUrl is required');
  return 'https://x.com/' + handle;
}

async function waitForProfileReady(input) {
  const timeoutMs = Math.max(8_000, typeof input.timeoutMs === 'number' ? input.timeoutMs : 35_000);
  const intervalMs = Math.max(600, typeof input.intervalMs === 'number' ? input.intervalMs : 1_000);
  const nudgePx = Math.max(120, typeof input.nudgePx === 'number' ? input.nudgePx : 240);

  const startedAt = Date.now();
  let polls = 0;
  let last = {};

  while (Date.now() - startedAt < timeoutMs) {
    const state = await window.evaluate(PROFILE_STATE, { timeoutMs: 10_000 });
    last = state && typeof state === 'object' ? state : {};

    if (last && last.ready === true) {
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

async function getProfile(input) {
  const handleOrUrl = input && typeof input.handleOrUrl === 'string' ? input.handleOrUrl : '';
  const url = buildProfileUrl(handleOrUrl);

  await window.open(url, {
    newTab: false,
    active: true,
    timeoutMs: 40_000,
  });

  const readiness = await waitForProfileReady({
    timeoutMs: input && typeof input.waitTimeoutMs === 'number' ? input.waitTimeoutMs : 35_000,
  });

  const page = await window.evaluate(EXTRACT_PROFILE, { timeoutMs: 20_000 });
  const profile = page && page.profile ? page.profile : {};

  return {
    requested: { handleOrUrl, url },
    readiness,
    loginRequired: page && page.loginRequired === true,
    profile,
  };
}

return await getProfile({
  handleOrUrl: 'ank1015',
});
```
