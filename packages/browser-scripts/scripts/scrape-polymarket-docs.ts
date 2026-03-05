import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const LOG_PREFIX = '[pm-docs-full-scrape]';
const DEFAULT_INPUT_INDEX =
  '/Users/notacoder/projects/polymarket-quant/docs/polymarket-docs/url-discovery/index.json';
const DEFAULT_OUTPUT_DIR = '/Users/notacoder/projects/polymarket-quant/docs/polymarket-docs';
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

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

function normalizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname !== 'docs.polymarket.com') return null;
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
    return resolve(outputRoot, url.hostname, '__home__.md');
  }

  const folderParts = segments.slice(0, -1);
  const leaf = segments[segments.length - 1];
  return resolve(outputRoot, url.hostname, ...folderParts, `${leaf}.md`);
}

function parseArgs(argv: string[]): {
  help: boolean;
  inputIndex: string;
  outputDir: string;
  artifactsDir: string;
  timeoutMs: number;
  maxPages?: number;
} {
  let help = false;
  let inputIndex = DEFAULT_INPUT_INDEX;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let maxPages: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--inputIndex') {
      inputIndex = argv[i + 1] ?? inputIndex;
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

  const resolvedOutput = resolve(outputDir);
  return {
    help,
    inputIndex: resolve(inputIndex),
    outputDir: resolvedOutput,
    artifactsDir: resolve(resolvedOutput, '_artifacts'),
    timeoutMs,
    maxPages,
  };
}

function printHelp(): void {
  const lines = [
    'Scrape docs.polymarket.com pages via Copy page button and save markdown files.',
    '',
    'Usage:',
    '  pnpm exec tsx scripts/scrape-polymarket-docs.ts [options]',
    '',
    'Options:',
    `  --inputIndex <path>  JSON URL list (default: ${DEFAULT_INPUT_INDEX})`,
    `  --outputDir <path>   Root output folder for markdown docs (default: ${DEFAULT_OUTPUT_DIR})`,
    `  --timeoutMs <ms>     Per-page load timeout (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --maxPages <n>       Optional cap for test runs',
    '  --help, -h           Show help',
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

async function loadUrls(path: string): Promise<string[]> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Input index is not an array: ${path}`);
  }

  const urls = parsed
    .map((item) => (typeof item === 'string' ? normalizeUrl(item) : null))
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      try {
        return new URL(item).pathname !== '/';
      } catch {
        return false;
      }
    });

  return Array.from(new Set(urls));
}

function preferReason(message: string, classified: FailureReason): FailureReason {
  const lower = message.toLowerCase();
  if (lower.includes('target was not found')) return 'target_not_found';
  if (lower.includes('empty text')) return 'clipboard_empty';
  if (lower.includes('focus not acquired')) return 'focus_not_acquired';
  return classified;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const urls = await loadUrls(args.inputIndex);
  const targets = typeof args.maxPages === 'number' ? urls.slice(0, args.maxPages) : urls;

  await mkdir(args.outputDir, { recursive: true });
  await mkdir(args.artifactsDir, { recursive: true });

  const summaryPath = resolve(args.artifactsDir, 'summary.json');
  const resultsPath = resolve(args.artifactsDir, 'results.json');
  const indexPath = resolve(args.artifactsDir, 'index.json');
  const txtPath = resolve(args.artifactsDir, 'files.txt');

  const startedAt = new Date().toISOString();
  const results: TargetResult[] = [];
  const markdownPaths: string[] = [];
  const pathCollisions = new Map<string, number>();

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

    for (let i = 0; i < targets.length; i += 1) {
      const targetUrl = targets[i];
      const targetStartedAt = new Date().toISOString();
      log(`processing ${i + 1}/${targets.length} ${targetUrl}`);

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

          const basePath = urlToMarkdownPath(args.outputDir, targetUrl);
          const collisionCount = pathCollisions.get(basePath) ?? 0;
          const candidatePath =
            collisionCount > 0 ? basePath.replace(/\.md$/, `__dup${collisionCount}.md`) : basePath;
          pathCollisions.set(basePath, collisionCount + 1);

          await writeText(candidatePath, capture.capturedText);
          markdownPath = candidatePath;
          markdownPaths.push(candidatePath);
          succeeded = true;
          retriesUsed = attempt;

          diagnostic.finishedAt = new Date().toISOString();
          attempts.push(diagnostic);
          break;
        } catch (error) {
          const classified = classifyFailure(error);
          const preferred = preferReason(classified.message, classified.reason);
          diagnostic.errorReason = preferred;
          diagnostic.errorMessage = classified.message;
          diagnostic.finishedAt = new Date().toISOString();
          attempts.push(diagnostic);

          finalErrorReason = preferred;
          finalErrorMessage = classified.message;
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

      if ((i + 1) % 10 === 0) {
        const succeededCount = results.filter((item) => item.ok).length;
        const failedCount = results.length - succeededCount;
        log(
          `progress processed=${i + 1}/${targets.length} succeeded=${succeededCount} failed=${failedCount}`
        );
      }
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
    await writeJson(indexPath, targets);
    await writeText(txtPath, `${markdownPaths.join('\n')}\n`);
    await writeJson(summaryPath, summary);

    log(
      `done attempted=${summary.attempted} succeeded=${summary.succeeded} failed=${summary.failed}`
    );
    log(`artifacts=${args.artifactsDir}`);
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
