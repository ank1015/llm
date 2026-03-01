#!/usr/bin/env -S node --enable-source-maps

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, Window } from '@ank1015/llm-extension';

type SearchInspectOptions = {
  query: string;
  max: number;
  num: number;
  page: number;
  hl: string;
  gl: string;
  keepWindow: boolean;
  focused: boolean;
};

const DEFAULT_MAX = 120;
const DEFAULT_NUM = 10;
const DEFAULT_PAGE = 0;
const DEFAULT_HL = 'en';
const DEFAULT_GL = 'us';

const SERP_PROBE_SCRIPT = String.raw`(() => {
  const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const text = (node) => compact(node && node.textContent ? node.textContent : '');

  const selectors = [
    'div#search div.g',
    'div#search div.MjjYud',
    'div#search [data-sokoban-container]',
    'div#search [data-hveid]'
  ];

  const entries = [];
  const seen = new Set();
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (seen.has(node)) continue;
      seen.add(node);
      entries.push({ selector, node });
    }
  }

  const findLink = (root) => {
    const anchor = root.querySelector('a[href]');
    return anchor ? anchor.href : '';
  };

  const findTitle = (root) => {
    const h3 = root.querySelector('h3');
    if (h3) return text(h3);
    const heading = root.querySelector('[role="heading"]');
    if (heading) return text(heading);
    return '';
  };

  const findSnippet = (root) => {
    const snippet =
      root.querySelector('div[data-sncf]') ||
      root.querySelector('div.VwiC3b') ||
      root.querySelector('.VwiC3b') ||
      root.querySelector('.st');
    return compact(snippet ? text(snippet) : text(root)).slice(0, 500);
  };

  const isSponsoredText = (value) => /(^|\b)(ad|ads|sponsored)(\b|$)/i.test(value);

  const results = [];
  for (const entry of entries) {
    const url = findLink(entry.node);
    const title = findTitle(entry.node);
    if (!url || !title) continue;

    const bodyText = compact(text(entry.node));
    results.push({
      rank: results.length + 1,
      selector: entry.selector,
      title,
      url,
      snippet: findSnippet(entry.node),
      sponsored: isSponsoredText(bodyText.slice(0, 220))
    });

    if (results.length >= 40) {
      break;
    }
  }

  const adLabelCount = Array.from(document.querySelectorAll('span,div')).reduce((count, node) => {
    if (!(node instanceof HTMLElement)) return count;
    const value = compact(node.textContent || '');
    return isSponsoredText(value) ? count + 1 : count;
  }, 0);

  return {
    location: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    selectorsTried: selectors,
    candidateCount: results.length,
    adLabelCount,
    candidates: results
  };
})()`;

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(argv: string[]): SearchInspectOptions {
  let query: string | undefined;
  let max = DEFAULT_MAX;
  let num = DEFAULT_NUM;
  let page = DEFAULT_PAGE;
  let hl = DEFAULT_HL;
  let gl = DEFAULT_GL;
  let keepWindow = false;
  let focused = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--query' || arg === '-q') {
      query = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--max') {
      max = parsePositiveInt(argv[index + 1] ?? '', '--max');
      index++;
      continue;
    }
    if (arg === '--num') {
      num = parsePositiveInt(argv[index + 1] ?? '', '--num');
      index++;
      continue;
    }
    if (arg === '--page') {
      page = parsePositiveInt(argv[index + 1] ?? '', '--page');
      index++;
      continue;
    }
    if (arg === '--hl') {
      hl = argv[index + 1] ?? DEFAULT_HL;
      index++;
      continue;
    }
    if (arg === '--gl') {
      gl = argv[index + 1] ?? DEFAULT_GL;
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
    if (!arg.startsWith('-') && !query) {
      query = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!query || !query.trim()) {
    throw new Error('Missing query. Use --query "<text>" or pass query as positional arg.');
  }

  if (num <= 0) {
    throw new Error('--num must be greater than 0');
  }

  return {
    query: query.trim(),
    max,
    num,
    page,
    hl: hl.trim() || DEFAULT_HL,
    gl: gl.trim() || DEFAULT_GL,
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
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'query';
}

function buildGoogleSearchUrl(options: SearchInspectOptions): string {
  const params = new URLSearchParams();
  params.set('q', options.query);
  params.set('hl', options.hl);
  params.set('gl', options.gl);
  params.set('pws', '0');
  params.set('num', String(options.num));
  if (options.page > 0) {
    params.set('start', String(options.page * options.num));
  }
  return `https://www.google.com/search?${params.toString()}`;
}

function usage(scriptPath: string): void {
  const usageText = [
    `Usage: ${scriptPath} --query "<search terms>" [options]`,
    '',
    'Options:',
    '  --query, -q      Search query (required)',
    `  --num            Results per page (default: ${DEFAULT_NUM})`,
    `  --page           Page index, zero-based (default: ${DEFAULT_PAGE})`,
    `  --max            observe() item limit (default: ${DEFAULT_MAX})`,
    `  --hl             Google language (default: ${DEFAULT_HL})`,
    `  --gl             Google country code (default: ${DEFAULT_GL})`,
    '  --focused        Open created window as focused',
    '  --keep-window    Do not close created window at end',
    '',
    'Example:',
    `  ${scriptPath} --query "best mechanical keyboard" --num 20 --page 1`,
  ].join('\n');
  console.error(usageText);
}

async function main(): Promise<void> {
  let options: SearchInspectOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(process.argv[1] ?? 'inspect-search.ts');
    throw error;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const artifactsDir = resolve(scriptDir, '..', 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const targetUrl = buildGoogleSearchUrl(options);
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
      timeoutMs: 30_000,
    });
    const tabId = typeof openedTab.id === 'number' ? openedTab.id : undefined;

    const observeMarkdown = await window.observe({
      ...(typeof tabId === 'number' ? { tabId } : {}),
      max: options.max,
      timeoutMs: 30_000,
    });
    const screenshotBase64 = await window.screenshot({
      ...(typeof tabId === 'number' ? { tabId } : {}),
    });
    const probe = await window.evaluate<Record<string, unknown>>(SERP_PROBE_SCRIPT, {
      ...(typeof tabId === 'number' ? { tabId } : {}),
      timeoutMs: 20_000,
    });

    const timestamp = formatTimestamp();
    const baseName = `google-search-${slugify(options.query).slice(0, 70)}-${timestamp}`;
    const observePath = resolve(artifactsDir, `${baseName}.observe.md`);
    const probePath = resolve(artifactsDir, `${baseName}.probe.json`);
    const screenshotPath = resolve(artifactsDir, `${baseName}.png`);
    const metaPath = resolve(artifactsDir, `${baseName}.meta.json`);

    const meta = {
      query: options.query,
      targetUrl,
      createdWindowId,
      tabId,
      timestamp: new Date().toISOString(),
      options: {
        max: options.max,
        num: options.num,
        page: options.page,
        hl: options.hl,
        gl: options.gl,
      },
    };

    await Promise.all([
      writeFile(observePath, observeMarkdown, 'utf8'),
      writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`, 'utf8'),
      writeFile(screenshotPath, Buffer.from(screenshotBase64, 'base64')),
      writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8'),
    ]);

    console.log('Google search inspection complete.');
    console.log(`Query: ${options.query}`);
    console.log(`URL: ${targetUrl}`);
    console.log(`Window ID: ${createdWindowId}`);
    if (typeof tabId === 'number') {
      console.log(`Tab ID: ${tabId}`);
    }
    console.log(`Observe markdown: ${observePath}`);
    console.log(`Probe JSON: ${probePath}`);
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Metadata: ${metaPath}`);
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
