/**
 * E2E tests for Window.screenshot.
 *
 * Verifies:
 *   - viewport screenshot returns PNG base64
 *   - fullPage screenshot returns PNG base64
 *   - fullPage is larger than viewport on long content
 *   - optional tabId parameter works
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-screenshot
 */

import { connect, Window } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

interface ChromeTab {
  id?: number;
  windowId?: number;
  url?: string;
}

const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';

function log(msg: string): void {
  process.stderr.write(`[e2e:window-shot] ${msg}\n`);
}

async function test(
  name: string,
  fn: () => Promise<{ pass: boolean; data?: unknown }>
): Promise<TestResult> {
  try {
    const { pass, data } = await fn();
    return { name, pass, data };
  } catch (e) {
    return { name, pass: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function isPngBase64(imageBase64: string): boolean {
  const bytes = Buffer.from(imageBase64, 'base64');
  const signature = bytes.subarray(0, 8).toString('hex');
  return signature === PNG_SIGNATURE_HEX;
}

function longPageDataUrl(): string {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Window Screenshot E2E</title>
        <style>
          body { margin: 0; font-family: sans-serif; }
          .hero { height: 1200px; background: linear-gradient(#ffcc00, #ff6600); }
          .content { height: 2600px; background: repeating-linear-gradient(#ffffff, #ffffff 40px, #f0f0f0 40px, #f0f0f0 80px); }
          .footer { height: 900px; background: #003366; color: white; display: flex; align-items: center; justify-content: center; }
        </style>
      </head>
      <body>
        <div class="hero">hero</div>
        <div class="content">content</div>
        <div class="footer">footer</div>
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
  let longPageTabId: number | null = null;
  let viewportBase64 = '';

  results.push(
    await test('setup: resolve window id', async () => {
      const tabs = await window.tabs();
      const id = tabs[0]?.windowId;
      if (typeof id !== 'number') {
        return { pass: false, data: 'Failed to resolve windowId' };
      }

      windowId = id;
      return { pass: true, data: { windowId: id, tabCount: tabs.length } };
    })
  );

  results.push(
    await test('open long page in new tab', async () => {
      const tab = (await window.open(longPageDataUrl(), {
        newTab: true,
        active: true,
      })) as ChromeTab;

      if (typeof tab.id !== 'number') {
        return { pass: false, data: tab };
      }

      longPageTabId = tab.id;
      return { pass: true, data: { tabId: tab.id, url: tab.url } };
    })
  );

  results.push(
    await test('viewport screenshot returns PNG base64', async () => {
      if (longPageTabId === null) return { pass: false, data: 'Missing tab id' };

      const image = await window.screenshot({ tabId: longPageTabId });
      viewportBase64 = image;

      return {
        pass: typeof image === 'string' && image.length > 100 && isPngBase64(image),
        data: { base64Length: image.length, png: isPngBase64(image) },
      };
    })
  );

  results.push(
    await test('fullPage screenshot returns PNG base64', async () => {
      if (longPageTabId === null) return { pass: false, data: 'Missing tab id' };

      const image = await window.screenshot({ tabId: longPageTabId, fullPage: true });

      return {
        pass: typeof image === 'string' && image.length > 100 && isPngBase64(image),
        data: { base64Length: image.length, png: isPngBase64(image) },
      };
    })
  );

  results.push(
    await test('fullPage screenshot is larger than viewport on long page', async () => {
      if (longPageTabId === null) return { pass: false, data: 'Missing tab id' };
      if (!viewportBase64) return { pass: false, data: 'Viewport screenshot missing' };

      const fullPageBase64 = await window.screenshot({ tabId: longPageTabId, fullPage: true });

      return {
        pass: fullPageBase64.length > viewportBase64.length,
        data: {
          viewportLength: viewportBase64.length,
          fullPageLength: fullPageBase64.length,
        },
      };
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('No window with id')) {
          return { pass: true, data: { removedWindowId: windowId, note: 'already closed' } };
        }
        return { pass: false, data: { windowId, error: msg } };
      }
    })
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Window Screenshot E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
  log('='.repeat(60));

  for (const r of results) {
    const icon = r.pass ? '\u2713' : '\u2717';
    log(`  ${icon} ${r.name}`);
    if (r.error) log(`    error: ${r.error}`);
    if (r.data !== undefined) log(`    data:  ${JSON.stringify(r.data)}`);
  }

  log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
