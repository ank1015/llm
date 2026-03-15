/**
 * E2E tests for ChromeClient.getPageMarkdown.
 *
 * Verifies:
 *   - getPageMarkdown with an explicit tabId returns converter markdown
 *   - getPageMarkdown against the current tab works through raw RPC setup
 *   - converter failure surfaces as a thrown error
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:page-markdown
 */

import { createServer } from 'node:http';

import { connect } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

const CONVERTER_FAILURE_URL = 'http://127.0.0.1:65535/convert';

function log(message: string): void {
  process.stderr.write(`[e2e:page-markdown] ${message}\n`);
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

function buildDataUrl(title: string, text: string): string {
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

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`# ${heading}\n\n${paragraph}`);
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
  const converter = await startConverterService();
  log('connected');

  const results: TestResult[] = [];
  let tabId: number | null = null;

  results.push(
    await test('setup: open deterministic page in a new tab', async () => {
      const tab = (await chrome.call('tabs.create', {
        url: buildDataUrl('Alpha Page', 'Alpha paragraph text.'),
        active: true,
      })) as { id?: number };

      if (typeof tab.id !== 'number') {
        return { pass: false, data: tab };
      }

      tabId = tab.id;
      return { pass: true, data: { tabId } };
    })
  );

  results.push(
    await test('getPageMarkdown with an explicit tabId returns converter markdown', async () => {
      if (tabId === null) {
        return { pass: false, data: 'Missing tabId' };
      }

      const markdown = await chrome.getPageMarkdown(tabId, {
        converterUrl: converter.endpoint,
      });

      return {
        pass: markdown.includes('# Alpha Page') && markdown.includes('Alpha paragraph text.'),
        data: { markdown },
      };
    })
  );

  results.push(
    await test('getPageMarkdown works with the current active tab obtained via raw RPC', async () => {
      const tabs = (await chrome.call('tabs.query', {
        active: true,
        currentWindow: true,
      })) as { id?: number }[];
      const currentTabId = tabs[0]?.id;

      if (typeof currentTabId !== 'number') {
        return { pass: false, data: tabs };
      }

      const markdown = await chrome.getPageMarkdown(currentTabId, {
        converterUrl: converter.endpoint,
      });

      return {
        pass: markdown.includes('# Alpha Page') && markdown.includes('Alpha paragraph text.'),
        data: { currentTabId, markdown },
      };
    })
  );

  results.push(
    await test('getPageMarkdown throws when the converter is unavailable', async () => {
      if (tabId === null) {
        return { pass: false, data: 'Missing tabId' };
      }

      try {
        await chrome.getPageMarkdown(tabId, {
          converterUrl: CONVERTER_FAILURE_URL,
        });
        return { pass: false, data: 'Expected an error' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          pass: message.includes('Failed to reach markdown converter'),
          data: { message },
        };
      }
    })
  );

  if (tabId !== null) {
    results.push(
      await test('cleanup: remove created tab', async () => {
        try {
          await chrome.call('tabs.remove', tabId);
          return { pass: true, data: { removedTabId: tabId } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('No tab with id')) {
            return { pass: true, data: { removedTabId: tabId, note: 'already closed' } };
          }
          return { pass: false, data: { tabId, error: message } };
        }
      })
    );
  }

  await converter.close();

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Page Markdown E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
