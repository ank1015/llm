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

type AttemptDiagnostic = {
  attempt: number;
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  focusBefore: boolean | null;
  focusAfter: boolean | null;
  candidateLabels: string[];
  clickedLabel: string | null;
  clipboardWriteTextCallCount: number;
  clipboardWriteCallCount: number;
  copyEventCount: number;
  captureSource: string | null;
  capturedLength: number;
  preview: string;
  errorReason?: FailureReason;
  errorMessage?: string;
};

type TargetResult = {
  url: string;
  ok: boolean;
  markdownPath?: string;
  retries: number;
  startedAt: string;
  finishedAt: string;
  errorReason?: FailureReason;
  errorMessage?: string;
  attempts: AttemptDiagnostic[];
};

type Summary = {
  startedAt: string;
  finishedAt: string;
  attempted: number;
  succeeded: number;
  failed: number;
  outputFiles: {
    summary: string;
    results: string;
    index: string;
    txt: string;
  };
};

const LOG_PREFIX = '[pm-docs-copy-probe]';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_OUTPUT_DIR =
  '/Users/notacoder/projects/polymarket-quant/docs/polymarket-docs/probe-copy';
const DEFAULT_URLS = [
  'https://docs.polymarket.com/quickstart',
  'https://docs.polymarket.com/trading/overview',
  'https://docs.polymarket.com/api-reference/introduction',
];

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

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function parseArgs(argv: string[]): {
  help: boolean;
  urls: string[];
  outputDir: string;
  timeoutMs: number;
} {
  let help = false;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let urls = [...DEFAULT_URLS];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--urls') {
      const raw = argv[i + 1] ?? '';
      const parsed = raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (parsed.length > 0) {
        urls = parsed;
      }
      i += 1;
    } else if (arg === '--outputDir') {
      outputDir = argv[i + 1] ?? outputDir;
      i += 1;
    } else if (arg === '--timeoutMs') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed;
      }
      i += 1;
    }
  }

  return {
    help,
    urls,
    outputDir: resolve(outputDir),
    timeoutMs,
  };
}

function printHelp(): void {
  const lines = [
    'Probe Copy page behavior on 2-3 Polymarket docs URLs and save markdown outputs.',
    '',
    'Usage:',
    '  pnpm exec tsx scripts/probe-polymarket-copy.ts [options]',
    '',
    'Options:',
    `  --urls <csv>         Comma-separated URLs (default: ${DEFAULT_URLS.join(',')})`,
    `  --outputDir <path>   Output directory (default: ${DEFAULT_OUTPUT_DIR})`,
    `  --timeoutMs <ms>     Per-page timeout in ms (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --help, -h           Show this help',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function normalizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
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

async function stabilizeFocus(chrome: any, windowId: number, tabId: number): Promise<void> {
  await chrome.call('windows.update', windowId, { focused: true });
  await chrome.call('tabs.update', tabId, { active: true });
  await chrome.call('debugger.sendCommand', { tabId, method: 'Page.bringToFront' });
}

function classifyFailure(error: unknown): { reason: FailureReason; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('did not finish loading')) {
    return { reason: 'load_timeout', message };
  }
  if (lower.includes('permission') || lower.includes('denied')) {
    return { reason: 'permission_denied', message };
  }
  if (lower.includes('runtime.evaluate') || lower.includes('exception')) {
    return { reason: 'runtime_eval_error', message };
  }
  if (lower.includes('tabs.update') || lower.includes('navigation')) {
    return { reason: 'navigation_error', message };
  }

  return { reason: 'unknown', message };
}

function sanitizeSegment(segment: string): string {
  const normalized = segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return normalized.length > 0 ? normalized : 'index';
}

function urlToMarkdownPath(outputRoot: string, targetUrl: string): string {
  const url = new URL(targetUrl);
  const segments = url.pathname.split('/').filter(Boolean).map(sanitizeSegment);
  if (segments.length === 0) {
    return resolve(outputRoot, url.hostname, 'index.md');
  }

  const folderParts = segments.slice(0, -1);
  const last = segments[segments.length - 1];
  return resolve(outputRoot, url.hostname, ...folderParts, `${last}.md`);
}

async function captureCopyPage(
  chrome: any,
  tabId: number
): Promise<{
  focusBefore: boolean;
  focusAfter: boolean;
  candidateLabels: string[];
  clickedLabel: string | null;
  clipboardWriteTextCallCount: number;
  clipboardWriteCallCount: number;
  copyEventCount: number;
  captureSource: string | null;
  capturedText: string;
  preview: string;
}> {
  const expression = `
(async () => {
  const candidateLabels = [];
  const candidateElements = [];
  const all = Array.from(document.querySelectorAll('button, [role="button"], [aria-label], [title]'));

  for (const node of all) {
    const aria = (node.getAttribute && node.getAttribute('aria-label')) || '';
    const title = (node.getAttribute && node.getAttribute('title')) || '';
    const text = (node.textContent || '').trim();
    const label = [aria, title, text].filter(Boolean).join(' | ');
    const hay = (String(aria) + ' ' + String(title) + ' ' + String(text)).toLowerCase();
    if (hay.includes('copy page') || hay.includes('copy')) {
      if (label && candidateLabels.length < 25) candidateLabels.push(label);
      candidateElements.push(node);
    }
  }

  let captured = '';
  let source = '';
  let clipboardWriteTextCallCount = 0;
  let clipboardWriteCallCount = 0;
  let copyEventCount = 0;

  const setCapture = (value, from) => {
    if (typeof value !== 'string') return;
    if (!value.trim()) return;
    if (!captured || value.length >= captured.length) {
      captured = value;
      source = from;
    }
  };

  const clipboard = navigator.clipboard;
  const restores = [];

  try {
    if (clipboard && typeof clipboard.writeText === 'function') {
      const originalWriteText = clipboard.writeText.bind(clipboard);
      clipboard.writeText = async (text) => {
        clipboardWriteTextCallCount += 1;
        setCapture(text, 'writeText');
        return undefined;
      };
      restores.push(() => {
        clipboard.writeText = originalWriteText;
      });
    }
  } catch {}

  try {
    if (clipboard && typeof clipboard.write === 'function') {
      const originalWrite = clipboard.write.bind(clipboard);
      clipboard.write = async (items) => {
        clipboardWriteCallCount += 1;

        if (Array.isArray(items)) {
          for (const item of items) {
            if (!item || !Array.isArray(item.types) || typeof item.getType !== 'function') continue;
            for (const type of ['text/markdown', 'text/plain']) {
              if (!item.types.includes(type)) continue;
              try {
                const blob = await item.getType(type);
                const text = await blob.text();
                setCapture(text, 'write:' + type);
              } catch {}
            }
          }
        }

        return undefined;
      };
      restores.push(() => {
        clipboard.write = originalWrite;
      });
    }
  } catch {}

  const onCopy = (event) => {
    copyEventCount += 1;
    const md = event.clipboardData?.getData('text/markdown') || '';
    const plain = event.clipboardData?.getData('text/plain') || '';
    if (md) setCapture(md, 'copy-event:text/markdown');
    if (plain) setCapture(plain, 'copy-event:text/plain');
  };

  document.addEventListener('copy', onCopy, true);

  const focusBefore = document.hasFocus();
  let clickedLabel = null;

  try {
    let target = null;
    for (const node of candidateElements) {
      const aria = (node.getAttribute && node.getAttribute('aria-label')) || '';
      const title = (node.getAttribute && node.getAttribute('title')) || '';
      const text = (node.textContent || '').trim();
      const hay = (String(aria) + ' ' + String(title) + ' ' + String(text)).toLowerCase();
      if (hay.includes('copy page')) {
        target = node;
        break;
      }
    }

    if (!target && candidateElements.length > 0) {
      target = candidateElements[0];
    }

    if (target) {
      const aria = (target.getAttribute && target.getAttribute('aria-label')) || '';
      const title = (target.getAttribute && target.getAttribute('title')) || '';
      const text = (target.textContent || '').trim();
      clickedLabel = [aria, title, text].filter(Boolean).join(' | ') || null;
      target.click();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    }

    if (!captured && clipboard && typeof clipboard.readText === 'function') {
      try {
        const text = await clipboard.readText();
        if (text) setCapture(text, 'readText');
      } catch {}
    }
  } finally {
    document.removeEventListener('copy', onCopy, true);
    for (const restore of restores.reverse()) {
      try {
        restore();
      } catch {}
    }
  }

  return {
    focusBefore,
    focusAfter: document.hasFocus(),
    candidateLabels,
    clickedLabel,
    clipboardWriteTextCallCount,
    clipboardWriteCallCount,
    copyEventCount,
    captureSource: source || null,
    capturedText: captured,
    preview: captured.slice(0, 200),
  };
})()
`.trim();

  return runtimeEvaluate(chrome, tabId, expression);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const normalizedUrls = args.urls
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url));

  if (normalizedUrls.length === 0) {
    throw new Error('No valid URLs provided.');
  }

  const outputDir = args.outputDir;
  const summaryPath = resolve(outputDir, 'summary.json');
  const resultsPath = resolve(outputDir, 'results.json');
  const indexPath = resolve(outputDir, 'index.json');
  const txtPath = resolve(outputDir, 'files.txt');

  await mkdir(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const results: TargetResult[] = [];
  const markdownPaths: string[] = [];

  const chrome = await connect({ launch: true });
  log('connected');

  let windowId: number | null = null;
  let tabId: number | null = null;
  let debuggerAttached = false;

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

    for (let i = 0; i < normalizedUrls.length; i += 1) {
      const targetUrl = normalizedUrls[i];
      const targetStartedAt = new Date().toISOString();
      log(`processing ${i + 1}/${normalizedUrls.length} ${targetUrl}`);

      const attempts: AttemptDiagnostic[] = [];
      let finalErrorReason: FailureReason | undefined;
      let finalErrorMessage: string | undefined;
      let markdownPath: string | undefined;
      let succeeded = false;
      let retriesUsed = 0;

      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const attemptStartedAt = new Date().toISOString();
        const diagnostic: AttemptDiagnostic = {
          attempt,
          targetUrl,
          startedAt: attemptStartedAt,
          finishedAt: attemptStartedAt,
          focusBefore: null,
          focusAfter: null,
          candidateLabels: [],
          clickedLabel: null,
          clipboardWriteTextCallCount: 0,
          clipboardWriteCallCount: 0,
          copyEventCount: 0,
          captureSource: null,
          capturedLength: 0,
          preview: '',
        };

        try {
          await stabilizeFocus(chrome, windowId, tabId);
          await chrome.call('tabs.update', tabId, { url: targetUrl, active: true });
          await waitForTabLoad(chrome, tabId, args.timeoutMs);
          await stabilizeFocus(chrome, windowId, tabId);

          const capture = await captureCopyPage(chrome, tabId);

          diagnostic.focusBefore = capture.focusBefore;
          diagnostic.focusAfter = capture.focusAfter;
          diagnostic.candidateLabels = capture.candidateLabels;
          diagnostic.clickedLabel = capture.clickedLabel;
          diagnostic.clipboardWriteTextCallCount = capture.clipboardWriteTextCallCount;
          diagnostic.clipboardWriteCallCount = capture.clipboardWriteCallCount;
          diagnostic.copyEventCount = capture.copyEventCount;
          diagnostic.captureSource = capture.captureSource;
          diagnostic.capturedLength = capture.capturedText.length;
          diagnostic.preview = capture.preview;

          if (!capture.focusAfter && !capture.focusBefore) {
            throw new Error('Focus not acquired for page interaction');
          }

          if (!capture.clickedLabel) {
            throw new Error('Copy page target was not found');
          }

          if (!capture.capturedText.trim()) {
            throw new Error('Clipboard capture returned empty text');
          }

          markdownPath = urlToMarkdownPath(outputDir, targetUrl);
          await writeText(markdownPath, capture.capturedText);
          markdownPaths.push(markdownPath);
          succeeded = true;
          retriesUsed = attempt;
          diagnostic.finishedAt = new Date().toISOString();
          attempts.push(diagnostic);
          break;
        } catch (error) {
          const classified = classifyFailure(error);

          if (classified.message.toLowerCase().includes('target was not found')) {
            diagnostic.errorReason = 'target_not_found';
            diagnostic.errorMessage = classified.message;
          } else if (classified.message.toLowerCase().includes('empty text')) {
            diagnostic.errorReason = 'clipboard_empty';
            diagnostic.errorMessage = classified.message;
          } else if (classified.message.toLowerCase().includes('focus not acquired')) {
            diagnostic.errorReason = 'focus_not_acquired';
            diagnostic.errorMessage = classified.message;
          } else {
            diagnostic.errorReason = classified.reason;
            diagnostic.errorMessage = classified.message;
          }

          diagnostic.finishedAt = new Date().toISOString();
          attempts.push(diagnostic);

          finalErrorReason = diagnostic.errorReason;
          finalErrorMessage = diagnostic.errorMessage;
          retriesUsed = attempt;

          const retryable = finalErrorReason !== 'target_not_found';
          if (!retryable || attempt === maxRetries) {
            break;
          }

          log(`retrying url=${targetUrl} attempt=${attempt + 1} reason=${finalErrorReason}`);
          await sleep(500);
        }
      }

      results.push({
        url: targetUrl,
        ok: succeeded,
        markdownPath,
        retries: retriesUsed,
        startedAt: targetStartedAt,
        finishedAt: new Date().toISOString(),
        errorReason: succeeded ? undefined : finalErrorReason,
        errorMessage: succeeded ? undefined : finalErrorMessage,
        attempts,
      });
    }

    const finishedAt = new Date().toISOString();
    const succeeded = results.filter((item) => item.ok).length;
    const failed = results.length - succeeded;

    const summary: Summary = {
      startedAt,
      finishedAt,
      attempted: results.length,
      succeeded,
      failed,
      outputFiles: {
        summary: summaryPath,
        results: resultsPath,
        index: indexPath,
        txt: txtPath,
      },
    };

    await writeJson(resultsPath, results);
    await writeJson(indexPath, normalizedUrls);
    await writeText(txtPath, `${markdownPaths.join('\n')}\n`);
    await writeJson(summaryPath, summary);

    log(
      `done attempted=${summary.attempted} succeeded=${summary.succeeded} failed=${summary.failed}`
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

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${LOG_PREFIX} fatal ${message}\n`);
  process.exit(1);
});
