/**
 * E2E tests for Window.getPage.
 *
 * Verifies:
 *   - getPage with tabId returns markdown from converter service
 *   - getPage with url opens a temporary tab and closes it after conversion
 *   - converter failure returns fallback error string
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-get-page
 */

import { createServer } from 'node:http';

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
}

const FALLBACK_MESSAGE = 'service not running use observe tool';

function log(message: string): void {
  process.stderr.write(`[e2e:window-get-page] ${message}\n`);
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

function buildGetPageDataUrl(title: string, text: string): string {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
      </head>
      <body>
        <h1>${title}</h1>
        <p>${text}</p>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function startConverterService(): Promise<{
  endpoint: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/convert') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body) as { html?: unknown };
        const html = typeof payload.html === 'string' ? payload.html : '';

        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const paragraphMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const heading = h1Match ? stripHtml(h1Match[1] || '') : 'Untitled';
        const paragraph = paragraphMatch ? stripHtml(paragraphMatch[1] || '') : '';

        const markdown = `# ${heading}\n\n${paragraph}`;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(markdown);
      } catch {
        res.statusCode = 400;
        res.end('invalid payload');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to start converter service');
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}/convert`,
    close: async () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;
  const chrome = await connect({ port, launch: true });
  const window = new Window();
  const converter = await startConverterService();

  await window.ready;
  log('connected and window initialized');

  const results: TestResult[] = [];

  let windowId: number | null = null;
  let tabId: number | null = null;

  results.push(
    await test('setup: open deterministic page', async () => {
      const tab = (await window.open(buildGetPageDataUrl('Alpha Page', 'Alpha paragraph text.'), {
        newTab: true,
        active: true,
      })) as WindowTab;

      if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
        return { pass: false, data: tab };
      }

      tabId = tab.id;
      windowId = tab.windowId;

      return { pass: true, data: { tabId, windowId } };
    })
  );

  results.push(
    await test('getPage with tabId returns converter markdown', async () => {
      if (tabId === null) {
        return { pass: false, data: 'Missing tabId' };
      }

      const markdown = await window.getPage({
        tabId,
        converterUrl: converter.endpoint,
      });

      return {
        pass: markdown.includes('# Alpha Page') && markdown.includes('Alpha paragraph text.'),
        data: { markdown },
      };
    })
  );

  results.push(
    await test('getPage with url closes temporary tab after conversion', async () => {
      const beforeTabs = await window.tabs();
      const markdown = await window.getPage({
        url: buildGetPageDataUrl('Temp Page', 'Temp paragraph text.'),
        converterUrl: converter.endpoint,
      });
      const afterTabs = await window.tabs();

      return {
        pass:
          beforeTabs.length === afterTabs.length &&
          markdown.includes('# Temp Page') &&
          markdown.includes('Temp paragraph text.'),
        data: {
          beforeCount: beforeTabs.length,
          afterCount: afterTabs.length,
          markdown,
        },
      };
    })
  );

  results.push(
    await test('getPage returns fallback string when converter is unavailable', async () => {
      if (tabId === null) {
        return { pass: false, data: 'Missing tabId' };
      }

      const markdown = await window.getPage({
        tabId,
        converterUrl: 'http://127.0.0.1:65535/convert',
      });

      return {
        pass: markdown === FALLBACK_MESSAGE,
        data: { markdown },
      };
    })
  );

  results.push(
    await test('cleanup: remove created window', async () => {
      if (windowId === null) {
        return { pass: true, data: 'No window id captured for cleanup' };
      }

      try {
        await chrome.call('windows.remove', windowId);
        return { pass: true, data: { removedWindowId: windowId } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('No window with id')) {
          return { pass: true, data: { removedWindowId: windowId, note: 'already closed' } };
        }
        return { pass: false, data: { windowId, error: message } };
      }
    })
  );

  await converter.close();

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Window getPage E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
