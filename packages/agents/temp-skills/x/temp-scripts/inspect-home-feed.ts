#!/usr/bin/env -S node --enable-source-maps

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, Window } from '@ank1015/llm-extension';

type FeedMode = 'for_you' | 'following';

type HomeFeedInspectOptions = {
  mode: FeedMode;
  target: number;
  maxScrolls: number;
  maxObserve: number;
  distanceRatio: number;
  durationMs: number;
  keepWindow: boolean;
  focused: boolean;
};

const DEFAULT_MODE: FeedMode = 'for_you';
const DEFAULT_TARGET = 30;
const DEFAULT_MAX_SCROLLS = 20;
const DEFAULT_MAX_OBSERVE = 180;
const DEFAULT_DISTANCE_RATIO = 0.82;
const DEFAULT_DURATION_MS = 900;

const HOME_FEED_PROBE_SCRIPT = String.raw`(() => {
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
    const button = root.querySelector('[data-testid="' + testId + '"]');
    if (!(button instanceof HTMLElement)) {
      return null;
    }

    const aria = clean(button.getAttribute('aria-label') || '');
    const visible = clean(button.textContent || '');
    const parsed = parseMetric(visible || aria);
    return parsed;
  };

  const parseStatusUrl = (href) => {
    try {
      const url = new URL(href || '', window.location.href);
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!match) return null;

      const handle = match[1];
      const postId = match[2];
      return {
        handle,
        postId,
        url: 'https://x.com/' + handle + '/status/' + postId,
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

      const candidate = clean(match[1]);
      if (!candidate || candidate.toLowerCase() === 'status') continue;
      return candidate;
    }
    return '';
  };

  const parseAuthorName = (container) => {
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      if (!(span instanceof HTMLElement)) continue;

      const value = clean(span.textContent || '');
      if (!value) continue;
      if (value.startsWith('@')) continue;
      if (/^\d+[smhdwy]$/i.test(value)) continue;
      if (/^\d+$/i.test(value)) continue;
      return value;
    }
    return '';
  };

  const detectLoginRequired = () => {
    if (window.location.pathname.includes('/i/flow/login')) {
      return true;
    }

    const selectors = [
      'input[name="session[username_or_email]"]',
      'input[autocomplete="username"]',
      'a[href*="/i/flow/login"]',
      '[data-testid="loginButton"]',
    ];

    for (const selector of selectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    return false;
  };

  const currentUrl = new URL(window.location.href);
  const feedKind = currentUrl.searchParams.get('f') === 'live' ? 'following' : 'for_you';
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"], main article'));
  const items = [];

  for (const node of articles) {
    if (!(node instanceof HTMLElement)) continue;

    const statusAnchor = node.querySelector('a[href*="/status/"]');
    const statusHref = statusAnchor ? statusAnchor.getAttribute('href') || '' : '';
    const status = parseStatusUrl(statusHref);

    const userNameBlock = node.querySelector('div[data-testid="User-Name"]');
    const authorHandle =
      userNameBlock instanceof HTMLElement
        ? parseAuthorHandle(userNameBlock)
        : status && status.handle
          ? status.handle
          : '';
    const authorName = userNameBlock instanceof HTMLElement ? parseAuthorName(userNameBlock) : '';

    const textNodes = node.querySelectorAll('[data-testid="tweetText"]');
    const textParts = [];
    for (const textNode of textNodes) {
      if (!(textNode instanceof HTMLElement)) continue;
      const value = clean(textNode.textContent || '');
      if (value) {
        textParts.push(value);
      }
    }

    const text = textParts.join('\n').trim();
    const timeElement = node.querySelector('time');
    const createdAt =
      timeElement instanceof HTMLTimeElement ? clean(timeElement.getAttribute('datetime') || '') : '';

    const socialContext = node.querySelector('[data-testid="socialContext"]');
    const socialContextText = clean(socialContext ? socialContext.textContent || '' : '');

    const raw = clean(node.textContent || '').slice(0, 2000);
    const promoted =
      /\bpromoted\b/i.test(raw) ||
      node.querySelector('[data-testid="placementTracking"]') !== null;

    const reply = /\breplying to\b/i.test(raw);
    const repost = /\breposted\b/i.test(socialContextText);
    const quote = node.querySelector('[role="blockquote"]') !== null;

    const replyCount = getMetric(node, 'reply');
    const repostCount = getMetric(node, 'retweet');
    const likeCount = getMetric(node, 'like');
    const bookmarkCount = getMetric(node, 'bookmark');
    const viewCount = getMetric(node, 'viewCount');

    if (!text && !status && !authorHandle) {
      continue;
    }

    items.push({
      postId: status ? status.postId : '',
      url: status ? status.url : '',
      text,
      authorHandle,
      authorName,
      createdAt,
      feedKind,
      promoted,
      isReply: reply,
      isRepost: repost,
      isQuote: quote,
      metrics: {
        replies: replyCount,
        reposts: repostCount,
        likes: likeCount,
        bookmarks: bookmarkCount,
        views: viewCount,
      },
    });
  }

  return {
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    loginRequired: detectLoginRequired(),
    feedKind,
    scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
    viewportHeight: Math.round(window.innerHeight || 0),
    scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    visibleArticleCount: articles.length,
    items,
  };
})()`;

const TIMELINE_STATE_SCRIPT = String.raw`(() => {
  const articleCount = document.querySelectorAll('article[data-testid="tweet"]').length;
  const loginRequired =
    window.location.pathname.includes('/i/flow/login') ||
    document.querySelector('input[name="session[username_or_email]"]') !== null ||
    document.querySelector('input[autocomplete="username"]') !== null ||
    document.querySelector('a[href*="/i/flow/login"]') !== null ||
    document.querySelector('[data-testid="loginButton"]') !== null;

  return {
    url: window.location.href,
    articleCount,
    loginRequired,
    hasPrimaryColumn: document.querySelector('[data-testid="primaryColumn"]') !== null,
  };
})()`;

const SCROLL_STATE_SCRIPT = String.raw`(() => {
  const y = Math.round(window.scrollY || window.pageYOffset || 0);
  const maxY = Math.max(
    0,
    (document.documentElement ? document.documentElement.scrollHeight : 0) - (window.innerHeight || 0)
  );
  return { y, maxY };
})()`;

function parseNonNegativeInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function parseArgs(argv: string[]): HomeFeedInspectOptions {
  let mode: FeedMode = DEFAULT_MODE;
  let target = DEFAULT_TARGET;
  let maxScrolls = DEFAULT_MAX_SCROLLS;
  let maxObserve = DEFAULT_MAX_OBSERVE;
  let distanceRatio = DEFAULT_DISTANCE_RATIO;
  let durationMs = DEFAULT_DURATION_MS;
  let keepWindow = false;
  let focused = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--mode') {
      const rawMode = (argv[index + 1] || '').trim();
      index++;

      if (rawMode === 'for_you' || rawMode === 'following') {
        mode = rawMode;
        continue;
      }

      throw new Error('--mode must be one of: for_you, following');
    }

    if (arg === '--target') {
      target = parseNonNegativeInt(argv[index + 1] ?? '', '--target');
      index++;
      continue;
    }

    if (arg === '--max-scrolls') {
      maxScrolls = parseNonNegativeInt(argv[index + 1] ?? '', '--max-scrolls');
      index++;
      continue;
    }

    if (arg === '--max-observe') {
      maxObserve = parseNonNegativeInt(argv[index + 1] ?? '', '--max-observe');
      index++;
      continue;
    }

    if (arg === '--distance-ratio') {
      distanceRatio = parsePositiveNumber(argv[index + 1] ?? '', '--distance-ratio');
      index++;
      continue;
    }

    if (arg === '--duration-ms') {
      durationMs = parseNonNegativeInt(argv[index + 1] ?? '', '--duration-ms');
      index++;
      continue;
    }

    if (arg === '--keep-window') {
      keepWindow = true;
      continue;
    }

    if (arg === '--focused') {
      focused = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (target <= 0) {
    throw new Error('--target must be greater than 0');
  }

  if (maxScrolls <= 0) {
    throw new Error('--max-scrolls must be greater than 0');
  }

  return {
    mode,
    target,
    maxScrolls,
    maxObserve,
    distanceRatio,
    durationMs,
    keepWindow,
    focused,
  };
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function usage(scriptPath: string): void {
  const usageText = [
    `Usage: ${scriptPath} [options]`,
    '',
    'Options:',
    `  --mode            Feed mode: for_you|following (default: ${DEFAULT_MODE})`,
    `  --target          Unique posts to collect (default: ${DEFAULT_TARGET})`,
    `  --max-scrolls     Scroll iterations (default: ${DEFAULT_MAX_SCROLLS})`,
    `  --max-observe     observe() max entries (default: ${DEFAULT_MAX_OBSERVE})`,
    `  --distance-ratio  Scroll distance as viewport multiplier (default: ${DEFAULT_DISTANCE_RATIO})`,
    `  --duration-ms     Scroll animation duration (default: ${DEFAULT_DURATION_MS})`,
    '  --focused         Open created window as focused',
    '  --keep-window     Do not close created window at end',
    '',
    'Example:',
    `  ${scriptPath} --mode for_you --target 40 --max-scrolls 25`,
  ].join('\n');

  console.error(usageText);
}

function buildPostKey(item: Record<string, unknown>): string | undefined {
  const id = typeof item.postId === 'string' ? item.postId.trim() : '';
  if (id) {
    return `id:${id}`;
  }

  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (url) {
    return `url:${url}`;
  }

  const handle =
    typeof item.authorHandle === 'string' ? item.authorHandle.trim().toLowerCase() : '';
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt.trim() : '';
  const text = typeof item.text === 'string' ? item.text.trim().slice(0, 160) : '';

  if (!handle && !text) {
    return undefined;
  }

  return `fallback:${handle}|${createdAt}|${text}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function runNaturalScrollStep(
  window: Window,
  tabId: number | undefined,
  distancePx: number,
  durationMs: number
): Promise<Record<string, unknown>> {
  const chunks = 3;
  const perChunk = Math.max(120, Math.round(distancePx / chunks));
  let movedTotal = 0;
  let stepsUsed = 0;
  let atBottom = false;

  const startState = toRecord(
    await window.evaluate<Record<string, unknown>>(SCROLL_STATE_SCRIPT, {
      ...(typeof tabId === 'number' ? { tabId } : {}),
      timeoutMs: 10_000,
    })
  );
  let previousY = typeof startState.y === 'number' ? startState.y : 0;
  let latestMaxY = typeof startState.maxY === 'number' ? startState.maxY : 0;

  for (let index = 0; index < chunks; index++) {
    await window.scroll({
      ...(typeof tabId === 'number' ? { tabId } : {}),
      y: perChunk,
      behavior: 'smooth',
      timeoutMs: Math.max(10_000, durationMs + 5_000),
    });

    const state = toRecord(
      await window.evaluate<Record<string, unknown>>(SCROLL_STATE_SCRIPT, {
        ...(typeof tabId === 'number' ? { tabId } : {}),
        timeoutMs: 10_000,
      })
    );

    const nextY = typeof state.y === 'number' ? state.y : previousY;
    const maxY = typeof state.maxY === 'number' ? state.maxY : latestMaxY;
    movedTotal += Math.max(0, nextY - previousY);
    previousY = nextY;
    latestMaxY = maxY;
    stepsUsed++;

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
    moved: movedTotal,
    atBottom,
    endY: previousY,
    maxY: latestMaxY,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTimelineReady(
  window: Window,
  tabId: number | undefined,
  timeoutMs = 35_000
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let polls = 0;
  let lastState: Record<string, unknown> = {};

  while (Date.now() - startedAt < timeoutMs) {
    const state = toRecord(
      await window.evaluate<Record<string, unknown>>(TIMELINE_STATE_SCRIPT, {
        ...(typeof tabId === 'number' ? { tabId } : {}),
        timeoutMs: 10_000,
      })
    );
    lastState = state;

    const loginRequired = state.loginRequired === true;
    const articleCount = typeof state.articleCount === 'number' ? state.articleCount : 0;
    if (loginRequired || articleCount > 0) {
      return {
        ...state,
        polls,
        waitedMs: Date.now() - startedAt,
      };
    }

    if (polls > 0 && polls % 2 === 0) {
      await window.scroll({
        ...(typeof tabId === 'number' ? { tabId } : {}),
        y: 280,
        behavior: 'smooth',
        timeoutMs: 20_000,
      });
    }

    polls++;
    await sleep(1_100);
  }

  return {
    ...lastState,
    polls,
    waitedMs: Date.now() - startedAt,
    timeout: true,
  };
}

async function main(): Promise<void> {
  let options: HomeFeedInspectOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(process.argv[1] ?? 'inspect-home-feed.ts');
    throw error;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const artifactsDir = resolve(scriptDir, '..', 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const targetUrl =
    options.mode === 'following' ? 'https://x.com/home?f=live' : 'https://x.com/home';

  const chromePort = process.env.CHROME_RPC_PORT
    ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
    : undefined;

  const chrome = await connect({
    launch: true,
    ...(chromePort ? { port: chromePort } : {}),
  });

  let createdWindowId: number | undefined;

  try {
    const created = (await chrome.call('windows.create', {
      url: 'about:blank',
      focused: options.focused,
    })) as { id?: number };

    if (typeof created.id !== 'number') {
      throw new Error('windows.create did not return a valid id');
    }

    createdWindowId = created.id;
    const window = new Window(createdWindowId);
    await window.ready;

    const openedTab = await window.open(targetUrl, {
      newTab: false,
      active: true,
      timeoutMs: 40_000,
    });

    const tabId = typeof openedTab.id === 'number' ? openedTab.id : undefined;

    const initialObserve = await window.observe({
      ...(typeof tabId === 'number' ? { tabId } : {}),
      max: options.maxObserve,
      timeoutMs: 40_000,
    });

    const readiness = await waitForTimelineReady(window, tabId);

    const screenshotBefore = await window.screenshot({
      ...(typeof tabId === 'number' ? { tabId } : {}),
    });

    const uniquePosts = new Map<string, Record<string, unknown>>();
    const cycles: Array<Record<string, unknown>> = [];

    let loginRequired = false;
    let stagnantCycles = 0;

    for (let index = 0; index < options.maxScrolls && uniquePosts.size < options.target; index++) {
      const probe = toRecord(
        await window.evaluate<Record<string, unknown>>(HOME_FEED_PROBE_SCRIPT, {
          ...(typeof tabId === 'number' ? { tabId } : {}),
          timeoutMs: 30_000,
        })
      );

      const currentFeedKind =
        typeof probe.feedKind === 'string' ? (probe.feedKind as string) : options.mode;
      const scrollY = typeof probe.scrollY === 'number' ? probe.scrollY : null;
      const viewportHeight = typeof probe.viewportHeight === 'number' ? probe.viewportHeight : 0;
      const scrollHeight = typeof probe.scrollHeight === 'number' ? probe.scrollHeight : null;

      loginRequired = probe.loginRequired === true;

      const rawItems = Array.isArray(probe.items) ? probe.items : [];
      let added = 0;

      for (const rawItem of rawItems) {
        const item = toRecord(rawItem);
        const key = buildPostKey(item);
        if (!key || uniquePosts.has(key)) {
          continue;
        }

        uniquePosts.set(key, item);
        added++;
      }

      const cycleMeta: Record<string, unknown> = {
        index,
        mode: currentFeedKind,
        visible: rawItems.length,
        added,
        uniqueTotal: uniquePosts.size,
        loginRequired,
        scrollY,
        scrollHeight,
      };

      if (loginRequired) {
        cycleMeta.stopReason = 'login-required';
        cycles.push(cycleMeta);
        break;
      }

      if (uniquePosts.size >= options.target) {
        cycleMeta.stopReason = 'target-reached';
        cycles.push(cycleMeta);
        break;
      }

      const distancePx = Math.max(
        240,
        Math.round((viewportHeight > 0 ? viewportHeight : 900) * options.distanceRatio)
      );

      const scrollResult = toRecord(
        await runNaturalScrollStep(window, tabId, distancePx, options.durationMs)
      );

      cycleMeta.scrollDistancePx = distancePx;
      cycleMeta.scrollResult = scrollResult;

      const moved = typeof scrollResult.moved === 'number' ? Math.abs(scrollResult.moved) : 0;
      if (added === 0 || moved < 3) {
        stagnantCycles++;
      } else {
        stagnantCycles = 0;
      }

      cycleMeta.stagnantCycles = stagnantCycles;
      cycles.push(cycleMeta);

      if (stagnantCycles >= 3) {
        cycles.push({
          index,
          stopReason: 'stagnant-scroll',
          uniqueTotal: uniquePosts.size,
        });
        break;
      }
    }

    const finalProbe = toRecord(
      await window.evaluate<Record<string, unknown>>(HOME_FEED_PROBE_SCRIPT, {
        ...(typeof tabId === 'number' ? { tabId } : {}),
        timeoutMs: 30_000,
      })
    );

    const finalObserve = await window.observe({
      ...(typeof tabId === 'number' ? { tabId } : {}),
      max: options.maxObserve,
      timeoutMs: 40_000,
    });

    const screenshotAfter = await window.screenshot({
      ...(typeof tabId === 'number' ? { tabId } : {}),
    });

    const timestamp = formatTimestamp();
    const baseName = `x-home-feed-${options.mode}-${timestamp}`;
    const observeInitialPath = resolve(artifactsDir, `${baseName}.initial.observe.md`);
    const observeFinalPath = resolve(artifactsDir, `${baseName}.final.observe.md`);
    const screenshotBeforePath = resolve(artifactsDir, `${baseName}.before.png`);
    const screenshotAfterPath = resolve(artifactsDir, `${baseName}.after.png`);
    const runPath = resolve(artifactsDir, `${baseName}.run.json`);

    const run = {
      targetUrl,
      createdWindowId,
      tabId,
      timestamp: new Date().toISOString(),
      options,
      readiness,
      loginRequired,
      uniqueCollected: uniquePosts.size,
      cycles,
      finalProbe,
      posts: Array.from(uniquePosts.values()).slice(0, options.target),
    };

    await Promise.all([
      writeFile(observeInitialPath, initialObserve, 'utf8'),
      writeFile(observeFinalPath, finalObserve, 'utf8'),
      writeFile(screenshotBeforePath, Buffer.from(screenshotBefore, 'base64')),
      writeFile(screenshotAfterPath, Buffer.from(screenshotAfter, 'base64')),
      writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8'),
    ]);

    console.log('X home-feed inspection complete.');
    console.log(`Mode: ${options.mode}`);
    console.log(`URL: ${targetUrl}`);
    console.log(`Window ID: ${createdWindowId}`);
    if (typeof tabId === 'number') {
      console.log(`Tab ID: ${tabId}`);
    }
    console.log(`Unique posts collected: ${uniquePosts.size}`);
    console.log(`Initial observe: ${observeInitialPath}`);
    console.log(`Final observe: ${observeFinalPath}`);
    console.log(`Before screenshot: ${screenshotBeforePath}`);
    console.log(`After screenshot: ${screenshotAfterPath}`);
    console.log(`Run JSON: ${runPath}`);
  } finally {
    if (!options.keepWindow && typeof createdWindowId === 'number') {
      try {
        await chrome.call('windows.remove', createdWindowId);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
