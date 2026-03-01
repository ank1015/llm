/**
 * E2E tests for Window.observe.
 *
 * Verifies:
 *   - observe returns markdown summary
 *   - filters reduce sections/content
 *   - semanticFilter is accepted (placeholder note for now)
 *   - full snapshot JSON is persisted to a temp file mapped by tab
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-observe
 */

import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { connect, Window } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:window-observe] ${msg}\n`);
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

function buildObserveDataUrl(): string {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Observe E2E Page</title>
        <style>
          .visual-order {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .card-old {
            order: 2;
          }

          .card-new {
            order: 1;
          }
        </style>
      </head>
      <body>
        <h1>Newsletter Signup</h1>
        <p>Use this page to validate observe filters and markdown formatting.</p>
        <form id="subscribe-form" aria-label="Subscribe Form">
          <input type="email" name="email" placeholder="Email address" />
          <button id="subscribe-btn" data-testid="subscribe-button">Subscribe</button>
        </form>
        <label for="sort-select">Sort</label>
        <select id="sort-select" name="sort" aria-label="Sort order">
          <option value="oldest">Oldest</option>
          <option value="newest">Newest</option>
          <option value="questionsperday">Questions Per Day</option>
        </select>

        <div class="visual-order">
          <article id="card-old" class="card-old">
            <a href="https://example.com/old">Old Link</a>
            <p>Old metric block: 3 answers and 120 views.</p>
          </article>
          <article id="card-new" class="card-new">
            <a href="https://example.com/new">New Link</a>
            <p>New metric block: 8 answers and 450 views.</p>
          </article>
        </div>

        <button id="cancel-btn">Cancel</button>
        <a href="https://example.com/docs">Read docs</a>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function extractSnapshotPath(markdown: string): string | null {
  const match = markdown.match(/^- Full snapshot file: (.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function collectGroupIds(lines: string[], idPrefix: 'E' | 'T'): Set<string> {
  const groups = new Set<string>();

  for (const line of lines) {
    if (!line.includes(`**${idPrefix}`) || !line.includes('| group=')) {
      continue;
    }

    const match = line.match(/\| group=(G\d+)/);
    if (match?.[1]) {
      groups.add(match[1]);
    }
  }

  return groups;
}

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;
  const chrome = await connect({ port });
  let semanticInputSeen = '';
  const window = new Window(undefined, async (input) => {
    semanticInputSeen = input;
    return `semantic-output::${input.slice(0, 80)}`;
  });

  await window.ready;
  log('connected and window initialized');

  const results: TestResult[] = [];
  let windowId: number | null = null;
  let tabId: number | null = null;
  let latestSnapshotPath: string | null = null;

  results.push(
    await test('setup: open deterministic observe page', async () => {
      const tab = await window.open(buildObserveDataUrl(), {
        newTab: true,
        active: true,
      });

      if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
        return { pass: false, data: tab };
      }

      tabId = tab.id;
      windowId = tab.windowId;

      return { pass: true, data: { tabId, windowId } };
    })
  );

  results.push(
    await test('observe() returns markdown with interactive and text sections', async () => {
      const markdown = await window.observe();
      const snapshotPath = extractSnapshotPath(markdown);
      latestSnapshotPath = snapshotPath;

      const hasInteractive = markdown.includes('## Interactive Elements');
      const hasText = markdown.includes('## Text Blocks');
      const hasKnownButton = markdown.includes('Subscribe');
      const hasKnownHeading = markdown.includes('Newsletter Signup');
      const hasSelectOptions = markdown.includes('options=["oldest", "newest", "questionsperday"]');

      const lines = markdown.split('\n');
      const interactiveGroups = collectGroupIds(lines, 'E');
      const textGroups = collectGroupIds(lines, 'T');
      const sharedGroups = Array.from(interactiveGroups).filter((group) => textGroups.has(group));
      const hasSharedGroups = sharedGroups.length > 0;

      const newMetricIndex = markdown.indexOf('New metric block: 8 answers and 450 views.');
      const oldMetricIndex = markdown.indexOf('Old metric block: 3 answers and 120 views.');
      const visualOrderingApplied =
        newMetricIndex !== -1 && oldMetricIndex !== -1 && newMetricIndex < oldMetricIndex;

      return {
        pass:
          hasInteractive &&
          hasText &&
          hasKnownButton &&
          hasKnownHeading &&
          hasSelectOptions &&
          hasSharedGroups &&
          visualOrderingApplied &&
          !!snapshotPath,
        data: {
          hasInteractive,
          hasText,
          hasKnownButton,
          hasKnownHeading,
          hasSelectOptions,
          hasSharedGroups,
          visualOrderingApplied,
          snapshotPath,
        },
      };
    })
  );

  results.push(
    await test('observe({filters:[buttons]}) narrows output', async () => {
      const markdown = await window.observe({ filters: ['buttons'] });
      const hasButtonsFilterNote = markdown.includes('Applied filters: buttons');
      const hasTextSection = markdown.includes('## Text Blocks');
      const hasInteractiveSection = markdown.includes('## Interactive Elements');
      const hasSubscribe = markdown.includes('Subscribe');

      return {
        pass: hasButtonsFilterNote && hasInteractiveSection && hasSubscribe && !hasTextSection,
        data: {
          hasButtonsFilterNote,
          hasInteractiveSection,
          hasTextSection,
          hasSubscribe,
        },
      };
    })
  );

  results.push(
    await test('observe({filters:[text]}) returns text-focused output', async () => {
      const markdown = await window.observe({ filters: ['text'] });
      const hasTextSection = markdown.includes('## Text Blocks');
      const hasInteractiveSection = markdown.includes('## Interactive Elements');
      const hasHeading = markdown.includes('Newsletter Signup');

      return {
        pass: hasTextSection && hasHeading && !hasInteractiveSection,
        data: {
          hasTextSection,
          hasInteractiveSection,
          hasHeading,
        },
      };
    })
  );

  results.push(
    await test('semanticFilter uses constructor callback and returns callback output', async () => {
      const output = await window.observe({
        filters: ['buttons'],
        semanticFilter: 'subscribe button',
      });

      const hasOutputPrefix = output.startsWith('semantic-output::');
      const hasQueryInInput = semanticInputSeen.includes('Semantic Filter Query: subscribe button');
      const hasSnapshotInInput = semanticInputSeen.includes('# Page Observation');

      return {
        pass: hasOutputPrefix && hasQueryInInput && hasSnapshotInInput,
        data: { hasOutputPrefix, hasQueryInInput, hasSnapshotInInput },
      };
    })
  );

  results.push(
    await test('observe stores full snapshot JSON in temp with latest pointer', async () => {
      if (!latestSnapshotPath || tabId === null || windowId === null) {
        return { pass: false, data: { latestSnapshotPath, tabId, windowId } };
      }

      await access(latestSnapshotPath);
      const snapshotRaw = await readFile(latestSnapshotPath, 'utf-8');
      const snapshotJson = JSON.parse(snapshotRaw) as {
        tabId?: number;
        windowId?: number;
        snapshot?: { interactive?: unknown[]; textBlocks?: unknown[] };
      };

      const latestPath = join(dirname(latestSnapshotPath), 'latest.json');
      await access(latestPath);
      const latestRaw = await readFile(latestPath, 'utf-8');
      const latestJson = JSON.parse(latestRaw) as { tabId?: number; windowId?: number };

      const interactiveCount = Array.isArray(snapshotJson.snapshot?.interactive)
        ? snapshotJson.snapshot.interactive.length
        : 0;
      const textCount = Array.isArray(snapshotJson.snapshot?.textBlocks)
        ? snapshotJson.snapshot.textBlocks.length
        : 0;

      return {
        pass:
          snapshotJson.tabId === tabId &&
          snapshotJson.windowId === windowId &&
          latestJson.tabId === tabId &&
          latestJson.windowId === windowId &&
          interactiveCount > 0 &&
          textCount > 0,
        data: {
          snapshotPath: latestSnapshotPath,
          latestPath,
          interactiveCount,
          textCount,
        },
      };
    })
  );

  results.push(
    await test('cleanup: remove created window', async () => {
      if (windowId === null) {
        const tabs = await window.tabs();
        const guessedWindowId = tabs[0]?.windowId;
        if (typeof guessedWindowId === 'number') {
          windowId = guessedWindowId;
        }
      }

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
  log(`  Window Observe E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
