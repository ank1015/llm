import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { connect } from '@ank1015/llm-extension';

type FailureReason =
  | 'load_timeout'
  | 'focus_not_acquired'
  | 'target_not_found'
  | 'clipboard_empty'
  | 'permission_denied'
  | 'navigation_error'
  | 'runtime_eval_error'
  | 'unknown';

type PageResult = {
  url: string;
  ok: boolean;
  finalUrl?: string;
  title?: string;
  extractedCount: number;
  enqueuedCount: number;
  retries: number;
  errorReason?: FailureReason;
  errorMessage?: string;
  startedAt: string;
  finishedAt: string;
};

type Summary = {
  startedAt: string;
  finishedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  queueRemaining: number;
  discoveredUniqueUrls: number;
  outputFiles: {
    summary: string;
    results: string;
    index: string;
    txt: string;
  };
};

const LOG_PREFIX = '[pm-docs-url-crawl]';
const DEFAULT_SEED = 'https://docs.polymarket.com/';
const DEFAULT_OUTPUT_DIR =
  '/Users/notacoder/projects/polymarket-quant/docs/polymarket-docs/url-discovery';
const DEFAULT_TIMEOUT_MS = 45_000;

function log(message: string): void {
  console.error(`${LOG_PREFIX} ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, 'utf8');
}

function parseArgs(argv: string[]): {
  help: boolean;
  seed: string;
  outputDir: string;
  timeoutMs: number;
  maxPages?: number;
} {
  let help = false;
  let seed = DEFAULT_SEED;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let maxPages: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--seed') {
      seed = argv[i + 1] ?? seed;
      i += 1;
    } else if (arg === '--outputDir') {
      outputDir = argv[i + 1] ?? outputDir;
      i += 1;
    } else if (arg === '--timeoutMs') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
      i += 1;
    } else if (arg === '--maxPages') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) maxPages = Math.floor(parsed);
      i += 1;
    }
  }

  return {
    help,
    seed,
    outputDir: resolve(outputDir),
    timeoutMs,
    maxPages,
  };
}

function printHelp(): void {
  const lines = [
    'Discover all crawlable docs.polymarket.com URLs by recursive browser navigation.',
    '',
    'Usage:',
    '  pnpm exec tsx scripts/discover-polymarket-doc-urls.ts [options]',
    '',
    'Options:',
    `  --seed <url>         Seed URL (default: ${DEFAULT_SEED})`,
    `  --outputDir <path>   Output directory (default: ${DEFAULT_OUTPUT_DIR})`,
    `  --timeoutMs <ms>     Per-page load timeout in ms (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --maxPages <n>       Optional probe cap (omit for uncapped full crawl)',
    '  --help, -h           Show this help',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function waitForTabLoad(
  chrome: any,
  tabId: number,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.call('tabs.get', tabId);
    if (tab?.status === 'complete') {
      await sleep(250);
      const settled = await chrome.call('tabs.get', tabId);
      if (settled?.status === 'complete') return;
    }
    await sleep(250);
  }
  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

async function runtimeEvaluate(chrome: any, tabId: number, expression: string): Promise<any> {
  const response = await chrome.call('debugger.sendCommand', {
    tabId,
    method: 'Runtime.evaluate',
    params: {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    },
  });

  if (response?.exceptionDetails) {
    const detail =
      response.exceptionDetails?.exception?.description ||
      response.exceptionDetails?.text ||
      'Runtime.evaluate failed';
    throw new Error(detail);
  }

  return response?.result?.value;
}

function classifyFailure(error: unknown): { reason: FailureReason; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('did not finish loading')) {
    return { reason: 'load_timeout', message };
  }
  if (
    lower.includes('cannot access') ||
    lower.includes('tabs.update') ||
    lower.includes('navigation')
  ) {
    return { reason: 'navigation_error', message };
  }
  if (lower.includes('runtime.evaluate') || lower.includes('exception')) {
    return { reason: 'runtime_eval_error', message };
  }

  return { reason: 'unknown', message };
}

function normalizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    url.hash = '';
    url.search = '';

    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return null;
  }
}

function isCrawlablePolymarketDocUrl(input: string): boolean {
  const normalized = normalizeUrl(input);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    return url.hostname === 'docs.polymarket.com';
  } catch {
    return false;
  }
}

async function discoverPageLinks(
  chrome: any,
  tabId: number
): Promise<{
  pageUrl: string;
  title: string;
  hasFocus: boolean;
  links: string[];
}> {
  const expression = `
(async () => {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const hrefs = anchors
    .map((a) => {
      try {
        return new URL(a.getAttribute('href') || '', location.href).href;
      } catch {
        return null;
      }
    })
    .filter((href) => typeof href === 'string');

  return {
    pageUrl: location.href,
    title: document.title || '',
    hasFocus: document.hasFocus(),
    links: Array.from(new Set(hrefs)),
  };
})()
`.trim();

  return runtimeEvaluate(chrome, tabId, expression);
}

async function crawlWithRetry(args: {
  chrome: any;
  tabId: number;
  windowId: number;
  targetUrl: string;
  timeoutMs: number;
  retries?: number;
}): Promise<
  | {
      ok: true;
      data: { pageUrl: string; title: string; hasFocus: boolean; links: string[] };
      retriesUsed: number;
    }
  | {
      ok: false;
      reason: FailureReason;
      message: string;
      retriesUsed: number;
    }
> {
  const { chrome, tabId, windowId, targetUrl, timeoutMs } = args;
  const retries = args.retries ?? 2;

  let lastFailure: { reason: FailureReason; message: string } = {
    reason: 'unknown',
    message: 'Unknown failure',
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await chrome.call('windows.update', windowId, { focused: true });
      await chrome.call('tabs.update', tabId, { active: true });
      await chrome.call('debugger.sendCommand', { tabId, method: 'Page.bringToFront' });

      await chrome.call('tabs.update', tabId, { url: targetUrl, active: true });
      await waitForTabLoad(chrome, tabId, timeoutMs);

      const extracted = await discoverPageLinks(chrome, tabId);
      return { ok: true, data: extracted, retriesUsed: attempt };
    } catch (error) {
      lastFailure = classifyFailure(error);
      const isRetryable =
        lastFailure.reason === 'load_timeout' ||
        lastFailure.reason === 'navigation_error' ||
        lastFailure.reason === 'runtime_eval_error' ||
        lastFailure.reason === 'unknown';

      if (!isRetryable || attempt === retries) {
        return {
          ok: false,
          reason: lastFailure.reason,
          message: lastFailure.message,
          retriesUsed: attempt,
        };
      }

      log(`retrying url=${targetUrl} attempt=${attempt + 1} reason=${lastFailure.reason}`);
      await sleep(500);
    }
  }

  return {
    ok: false,
    reason: lastFailure.reason,
    message: lastFailure.message,
    retriesUsed: retries,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const startedAt = new Date().toISOString();

  const outputDir = args.outputDir;
  const summaryPath = resolve(outputDir, 'summary.json');
  const resultsPath = resolve(outputDir, 'results.json');
  const indexPath = resolve(outputDir, 'index.json');
  const txtPath = resolve(outputDir, 'doc-urls.txt');

  await mkdir(outputDir, { recursive: true });

  const chrome = await connect({ launch: true });
  log('connected');

  let windowId: number | null = null;
  let tabId: number | null = null;
  let debuggerAttached = false;

  const queue: string[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  const results: PageResult[] = [];

  const normalizedSeed = normalizeUrl(args.seed);
  if (!normalizedSeed) {
    throw new Error(`Invalid seed URL: ${args.seed}`);
  }

  queue.push(normalizedSeed);
  seen.add(normalizedSeed);

  try {
    const created = await chrome.call('windows.create', {
      url: 'about:blank',
      focused: true,
      type: 'normal',
    });

    windowId = created?.id ?? null;
    tabId = created?.tabs?.[0]?.id ?? null;

    if (typeof windowId !== 'number' || typeof tabId !== 'number') {
      throw new Error('Failed to create working window/tab');
    }

    await chrome.call('debugger.attach', { tabId });
    debuggerAttached = true;
    await chrome.call('debugger.sendCommand', { tabId, method: 'Page.enable' });
    await chrome.call('debugger.sendCommand', { tabId, method: 'Runtime.enable' });

    let processed = 0;
    while (queue.length > 0) {
      if (typeof args.maxPages === 'number' && processed >= args.maxPages) {
        log(`maxPages reached (${args.maxPages}); stopping early`);
        break;
      }

      const nextUrl = queue.shift();
      if (!nextUrl) continue;
      if (visited.has(nextUrl)) continue;

      processed += 1;
      const pageStartedAt = new Date().toISOString();
      log(`processing ${processed} queue=${queue.length} url=${nextUrl}`);

      const crawlResult = await crawlWithRetry({
        chrome,
        tabId,
        windowId,
        targetUrl: nextUrl,
        timeoutMs: args.timeoutMs,
        retries: 2,
      });

      const pageFinishedAt = new Date().toISOString();

      if (!crawlResult.ok) {
        visited.add(nextUrl);
        results.push({
          url: nextUrl,
          ok: false,
          extractedCount: 0,
          enqueuedCount: 0,
          retries: crawlResult.retriesUsed,
          errorReason: crawlResult.reason,
          errorMessage: crawlResult.message,
          startedAt: pageStartedAt,
          finishedAt: pageFinishedAt,
        });
        continue;
      }

      visited.add(nextUrl);

      const outgoing = crawlResult.data.links
        .map((href) => normalizeUrl(href))
        .filter((href): href is string => Boolean(href));

      const crawlable = outgoing.filter((href) => isCrawlablePolymarketDocUrl(href));

      let enqueuedCount = 0;
      for (const href of crawlable) {
        if (!seen.has(href)) {
          seen.add(href);
          queue.push(href);
          enqueuedCount += 1;
        }
      }

      results.push({
        url: nextUrl,
        ok: true,
        finalUrl: normalizeUrl(crawlResult.data.pageUrl) ?? crawlResult.data.pageUrl,
        title: crawlResult.data.title,
        extractedCount: crawlable.length,
        enqueuedCount,
        retries: crawlResult.retriesUsed,
        startedAt: pageStartedAt,
        finishedAt: pageFinishedAt,
      });

      if (processed % 10 === 0) {
        log(`progress processed=${processed} discovered=${seen.size} pending=${queue.length}`);
      }
    }

    const discoveredUrls = Array.from(seen).sort((a, b) => a.localeCompare(b));
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    const finishedAt = new Date().toISOString();

    const summary: Summary = {
      startedAt,
      finishedAt,
      attempted: results.length,
      succeeded,
      failed,
      queueRemaining: queue.length,
      discoveredUniqueUrls: discoveredUrls.length,
      outputFiles: {
        summary: summaryPath,
        results: resultsPath,
        index: indexPath,
        txt: txtPath,
      },
    };

    await writeJson(resultsPath, results);
    await writeJson(indexPath, discoveredUrls);
    await writeText(txtPath, `${discoveredUrls.join('\n')}\n`);
    await writeJson(summaryPath, summary);

    log(
      `done attempted=${summary.attempted} succeeded=${summary.succeeded} failed=${summary.failed} discovered=${summary.discoveredUniqueUrls}`
    );
    log(`outputs summary=${summaryPath}`);
  } finally {
    if (debuggerAttached && typeof tabId === 'number') {
      try {
        await chrome.call('debugger.detach', { tabId });
      } catch {
        // ignore cleanup failure
      }
    }

    if (typeof windowId === 'number') {
      try {
        await chrome.call('windows.remove', windowId);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  process.exit(0);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${LOG_PREFIX} fatal ${message}\n`);
  process.exit(1);
});
