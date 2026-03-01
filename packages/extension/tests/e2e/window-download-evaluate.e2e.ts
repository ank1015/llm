/**
 * E2E tests for Window.download and Window.evaluate.
 *
 * Verifies:
 *   - evaluate runs arbitrary code in page context
 *   - evaluate accepts optional tabId
 *   - download starts and resolves after completion
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-download-evaluate
 */

import { basename } from 'node:path';

import { connect, Window } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

interface WindowTab {
  id?: number;
  windowId?: number;
  url?: string;
}

interface DownloadItem {
  id?: number;
  filename?: string;
  state?: string;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:window-download-eval] ${msg}\n`);
}

async function test(
  name: string,
  fn: () => Promise<{ pass: boolean; data?: unknown }>
): Promise<TestResult> {
  try {
    const { pass, data } = await fn();
    return { name, pass, data };
  } catch (error) {
    return {
      name,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildEvaluateDataUrl(): string {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Window Evaluate E2E</title>
      </head>
      <body>
        <h1 id="title">Evaluate Playground</h1>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;
  const chrome = await connect({ port });
  const window = new Window();

  await window.ready;
  log('connected and window initialized');

  const results: TestResult[] = [];
  let windowId: number | null = null;
  let tabId: number | null = null;
  let downloadId: number | null = null;
  const downloadPath = `llm-window-tests/window-download-${Date.now()}.html`;
  const downloadName = basename(downloadPath);

  results.push(
    await test('setup: open deterministic evaluate page', async () => {
      const tab = (await window.open(buildEvaluateDataUrl(), {
        newTab: true,
        active: true,
      })) as WindowTab;

      if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
        return { pass: false, data: tab };
      }

      tabId = tab.id;
      windowId = tab.windowId;

      return { pass: true, data: { tabId, windowId, url: tab.url } };
    })
  );

  results.push(
    await test('evaluate(code) runs on current tab', async () => {
      const title = await window.evaluate<string>('document.title');

      return {
        pass: title === 'Window Evaluate E2E',
        data: { title },
      };
    })
  );

  results.push(
    await test('evaluate(code, {tabId}) runs on explicit tab', async () => {
      if (tabId === null) {
        return { pass: false, data: 'Missing tabId' };
      }

      const markerText = await window.evaluate<string>(
        `
(() => {
  const marker = document.createElement('div');
  marker.id = 'evaluate-marker';
  marker.textContent = 'marker-ok';
  document.body.appendChild(marker);
  return document.getElementById('evaluate-marker')?.textContent || '';
})()
        `.trim(),
        { tabId }
      );

      return {
        pass: markerText === 'marker-ok',
        data: { markerText },
      };
    })
  );

  results.push(
    await test('download(url, path) resolves after completion', async () => {
      const message = await window.download('https://example.com/', downloadPath, {
        timeoutMs: 60_000,
      });

      const items = (await chrome.call('downloads.search', {
        query: [downloadName],
        limit: 10,
      })) as DownloadItem[];

      const matched = items.find((item) => item.filename?.includes(downloadName));
      if (typeof matched?.id === 'number') {
        downloadId = matched.id;
      }

      return {
        pass: message.includes('Downloaded to') && matched?.state === 'complete',
        data: {
          message,
          matched: matched
            ? {
                id: matched.id,
                filename: matched.filename,
                state: matched.state,
              }
            : null,
        },
      };
    })
  );

  results.push(
    await test('cleanup: remove downloaded file metadata', async () => {
      if (downloadId === null) {
        return { pass: true, data: 'No download id captured for cleanup' };
      }

      try {
        await chrome.call('downloads.removeFile', downloadId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('does not exist')) {
          throw error;
        }
      }

      try {
        await chrome.call('downloads.erase', { id: downloadId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Invalid query')) {
          throw error;
        }
      }

      return { pass: true, data: { downloadId } };
    })
  );

  results.push(
    await test('cleanup: remove created window', async () => {
      if (windowId === null) {
        return { pass: true, data: 'No windowId captured for cleanup' };
      }

      try {
        await chrome.call('windows.remove', windowId);
        return { pass: true, data: { removedWindowId: windowId } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('No window with id')) {
          return { pass: true, data: { removedWindowId: windowId, note: 'already closed' } };
        }

        return {
          pass: false,
          data: { windowId, error: message },
        };
      }
    })
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;

  log('');
  log('='.repeat(60));
  log(
    `  Window Download/Evaluate E2E: ${passed} passed, ${failed} failed, ${results.length} total`
  );
  log('='.repeat(60));

  for (const result of results) {
    const icon = result.pass ? '\u2713' : '\u2717';
    log(`  ${icon} ${result.name}`);
    if (result.error) log(`    error: ${result.error}`);
    if (result.data !== undefined) log(`    data:  ${JSON.stringify(result.data)}`);
  }

  log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
