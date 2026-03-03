#!/usr/bin/env -S node --enable-source-maps

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, Window } from '@ank1015/llm-extension';

type InspectOptions = {
  urls: string[];
  maxObserve: number;
  keepWindow: boolean;
  focused: boolean;
};

const DEFAULT_MAX_OBSERVE = 160;

const DEFAULT_URLS = [
  'https://x.com/home',
  'https://x.com/home?f=live',
  'https://x.com/i/bookmarks',
  'https://x.com/OpenAI',
  'https://x.com/elonmusk/status/2027991266173108303',
];

const PAGE_PROBE_SCRIPT = String.raw`(() => {
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  const parseStatusUrl = (href) => {
    try {
      const url = new URL(href || '', window.location.href);
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!match) return '';
      return 'https://x.com/' + match[1] + '/status/' + match[2];
    } catch {
      return '';
    }
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
      if (document.querySelector(selector)) return true;
    }

    return false;
  };

  const articleNodes = Array.from(document.querySelectorAll('article[data-testid="tweet"], main article'));
  const statusAnchors = Array.from(document.querySelectorAll('a[href*="/status/"]'));
  const statusUrls = [];
  const seen = new Set();

  for (const anchor of statusAnchors) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    const parsed = parseStatusUrl(anchor.getAttribute('href') || '');
    if (!parsed || seen.has(parsed)) continue;
    seen.add(parsed);
    statusUrls.push(parsed);
    if (statusUrls.length >= 12) break;
  }

  const path = window.location.pathname;
  const urlObject = new URL(window.location.href);
  const pageKind =
    path === '/home'
      ? urlObject.searchParams.get('f') === 'live'
        ? 'home-following'
        : 'home-for-you'
      : path === '/i/bookmarks'
        ? 'bookmarks'
        : /^\/[A-Za-z0-9_]{1,15}$/.test(path)
          ? 'profile'
          : /\/status\//.test(path)
            ? 'post'
            : 'other';

  return {
    url: window.location.href,
    path,
    title: document.title,
    timestamp: new Date().toISOString(),
    pageKind,
    loginRequired: detectLoginRequired(),
    counts: {
      articles: articleNodes.length,
      statusAnchors: statusAnchors.length,
      tweetTextBlocks: document.querySelectorAll('[data-testid="tweetText"]').length,
      userNameBlocks: document.querySelectorAll('div[data-testid="User-Name"]').length,
    },
    markers: {
      homePrimary: document.querySelector('a[href="/home"]') !== null,
      bookmarksNav: document.querySelector('a[href="/i/bookmarks"]') !== null,
      primaryColumn: document.querySelector('[data-testid="primaryColumn"]') !== null,
      profileHeader: document.querySelector('[data-testid="UserName"]') !== null,
      postCell: document.querySelector('[data-testid="cellInnerDiv"]') !== null,
    },
    scroll: {
      y: Math.round(window.scrollY || window.pageYOffset || 0),
      viewportHeight: Math.round(window.innerHeight || 0),
      scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    },
    sampleStatusUrls: statusUrls,
  };
})()`;

const PAGE_READY_STATE_SCRIPT = String.raw`(() => {
  const path = window.location.pathname;
  const loginRequired =
    path.includes('/i/flow/login') ||
    document.querySelector('input[name="session[username_or_email]"]') !== null ||
    document.querySelector('input[autocomplete="username"]') !== null ||
    document.querySelector('a[href*="/i/flow/login"]') !== null ||
    document.querySelector('[data-testid="loginButton"]') !== null;

  const articleCount = document.querySelectorAll('article[data-testid="tweet"]').length;
  const hasProfileHeader = document.querySelector('[data-testid="UserName"]') !== null;
  const isProfile = /^\/[A-Za-z0-9_]{1,15}(?:\/.*)?$/.test(path) && !path.includes('/status/');
  const isPost = /\/status\/\d+/.test(path);

  return {
    url: window.location.href,
    path,
    loginRequired,
    articleCount,
    hasProfileHeader,
    ready:
      loginRequired ||
      articleCount > 0 ||
      (isProfile && hasProfileHeader) ||
      (isPost && (articleCount > 0 || document.querySelector('[data-testid="primaryColumn"]') !== null)),
  };
})()`;

function parseArgs(argv: string[]): InspectOptions {
  const urls: string[] = [];
  let maxObserve = DEFAULT_MAX_OBSERVE;
  let keepWindow = false;
  let focused = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--url') {
      const value = (argv[index + 1] || '').trim();
      if (!value) {
        throw new Error('--url requires a value');
      }
      urls.push(value);
      index++;
      continue;
    }

    if (arg === '--max-observe') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--max-observe must be a positive integer');
      }
      maxObserve = parsed;
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

  const finalUrls = (urls.length > 0 ? urls : DEFAULT_URLS).map((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Invalid URL: ${value}`);
    }
    return parsed.toString();
  });

  return {
    urls: finalUrls,
    maxObserve,
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

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'page'
  );
}

function usage(scriptPath: string): void {
  const usageText = [
    `Usage: ${scriptPath} [options]`,
    '',
    'Options:',
    '  --url <url>        URL to inspect (repeatable; defaults to a built-in X page set)',
    `  --max-observe      observe() max entries (default: ${DEFAULT_MAX_OBSERVE})`,
    '  --focused          Open created window as focused',
    '  --keep-window      Do not close created window at end',
    '',
    'Examples:',
    `  ${scriptPath}`,
    `  ${scriptPath} --url https://x.com/home --url https://x.com/i/bookmarks`,
  ].join('\n');

  console.error(usageText);
}

function shouldWarmup(url: string): boolean {
  const parsed = new URL(url);
  const path = parsed.pathname;
  if (path === '/home') return true;
  if (path === '/i/bookmarks') return true;
  if (/^\/[A-Za-z0-9_]{1,15}$/.test(path)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(
  window: Window,
  tabId: number | undefined,
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let polls = 0;
  let lastState: Record<string, unknown> = {};

  while (Date.now() - startedAt < timeoutMs) {
    const state = (await window.evaluate<Record<string, unknown>>(PAGE_READY_STATE_SCRIPT, {
      ...(typeof tabId === 'number' ? { tabId } : {}),
      timeoutMs: 10_000,
    })) as Record<string, unknown>;
    lastState = state;

    if (state.ready === true) {
      return {
        ...state,
        polls,
        waitedMs: Date.now() - startedAt,
      };
    }

    if (polls > 0 && polls % 2 === 0) {
      await window.scroll({
        ...(typeof tabId === 'number' ? { tabId } : {}),
        y: 260,
        behavior: 'smooth',
        timeoutMs: 20_000,
      });
    }

    polls++;
    await sleep(1_000);
  }

  return {
    ...lastState,
    polls,
    waitedMs: Date.now() - startedAt,
    timeout: true,
  };
}

async function main(): Promise<void> {
  let options: InspectOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(process.argv[1] ?? 'inspect-x-pages.ts');
    throw error;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const artifactsDir = resolve(scriptDir, '..', 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

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

    const timestamp = formatTimestamp();
    const summary: Array<Record<string, unknown>> = [];

    for (const url of options.urls) {
      const openedTab = await window.open(url, {
        newTab: false,
        active: true,
        timeoutMs: 40_000,
      });

      const tabId = typeof openedTab.id === 'number' ? openedTab.id : undefined;

      if (shouldWarmup(url)) {
        for (let index = 0; index < 2; index++) {
          await window.scroll({
            ...(typeof tabId === 'number' ? { tabId } : {}),
            y: 520,
            behavior: 'smooth',
            timeoutMs: 25_000,
          });
        }
      }

      const readiness = await waitForReady(window, tabId);

      const observe = await window.observe({
        ...(typeof tabId === 'number' ? { tabId } : {}),
        max: options.maxObserve,
        timeoutMs: 40_000,
      });
      const screenshot = await window.screenshot({
        ...(typeof tabId === 'number' ? { tabId } : {}),
      });
      const probe = await window.evaluate<Record<string, unknown>>(PAGE_PROBE_SCRIPT, {
        ...(typeof tabId === 'number' ? { tabId } : {}),
        timeoutMs: 20_000,
      });

      const base = `x-page-${slugify(url)}-${timestamp}`;
      const observePath = resolve(artifactsDir, `${base}.observe.md`);
      const probePath = resolve(artifactsDir, `${base}.probe.json`);
      const screenshotPath = resolve(artifactsDir, `${base}.png`);

      await Promise.all([
        writeFile(observePath, observe, 'utf8'),
        writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`, 'utf8'),
        writeFile(screenshotPath, Buffer.from(screenshot, 'base64')),
      ]);

      summary.push({
        url,
        tabId,
        observePath,
        probePath,
        screenshotPath,
        readiness,
        probe,
      });
    }

    const summaryPath = resolve(artifactsDir, `x-page-summary-${timestamp}.json`);
    await writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          createdWindowId,
          timestamp: new Date().toISOString(),
          options,
          pages: summary,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    console.log('X page exploration complete.');
    console.log(`Window ID: ${createdWindowId}`);
    console.log(`Pages explored: ${summary.length}`);
    console.log(`Summary JSON: ${summaryPath}`);
  } finally {
    if (!options.keepWindow && typeof createdWindowId === 'number') {
      try {
        await chrome.call('windows.remove', createdWindowId);
      } catch {
        // Ignore cleanup failures.
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
