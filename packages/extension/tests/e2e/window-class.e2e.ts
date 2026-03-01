/**
 * E2E test for the Window class constructor behavior.
 *
 * Verifies that `new Window()` (without windowId) creates a new Chrome window.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-class
 */

import { connect, Window } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

interface ChromeWindow {
  id: number;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:window-class] ${msg}\n`);
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

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;
  const chrome = await connect({ port });

  log('connected');

  const results: TestResult[] = [];
  const cleanupWindowIds: number[] = [];

  results.push(
    await test('new Window() creates a new Chrome window', async () => {
      const before = (await chrome.call('windows.getAll', {})) as ChromeWindow[];
      const beforeIds = new Set(before.map((win) => win.id));

      const window = new Window();
      await window.ready;

      // Allow a brief delay for windows.getAll to reflect the newly created window.
      await new Promise((resolve) => setTimeout(resolve, 250));

      const after = (await chrome.call('windows.getAll', {})) as ChromeWindow[];
      const created = after.filter((win) => !beforeIds.has(win.id));

      for (const win of created) {
        cleanupWindowIds.push(win.id);
      }

      return {
        pass: created.length >= 1,
        data: {
          beforeCount: before.length,
          afterCount: after.length,
          createdWindowIds: created.map((win) => win.id),
        },
      };
    })
  );

  results.push(
    await test('cleanup: remove created windows', async () => {
      if (cleanupWindowIds.length === 0) {
        return { pass: true, data: 'No created windows to clean up' };
      }

      const removed: number[] = [];
      const failed: Array<{ id: number; error: string }> = [];

      for (const id of cleanupWindowIds) {
        try {
          await chrome.call('windows.remove', id);
          removed.push(id);
        } catch (e) {
          failed.push({ id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      return {
        pass: failed.length === 0,
        data: { removed, failed },
      };
    })
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Window Class E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
