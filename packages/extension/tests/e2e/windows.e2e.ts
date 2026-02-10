/**
 * E2E test for Chrome windows API.
 *
 * Exercises chrome.windows.create / get / getAll / getCurrent /
 * getLastFocused / update / remove.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:windows
 */

import { connect } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:windows] ${msg}\n`);
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
  let createdWindowId: number | null = null;

  // ═══════════════════════════════════════════════════════════════
  //  QUERY EXISTING WINDOWS
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.getAll returns array of windows', async () => {
      const windows = (await chrome.call('windows.getAll', {})) as {
        id: number;
        type: string;
      }[];
      return {
        pass: Array.isArray(windows) && windows.length > 0,
        data: { count: windows.length, types: windows.map((w) => w.type) },
      };
    })
  );

  results.push(
    await test('windows.getCurrent returns current window', async () => {
      const win = (await chrome.call('windows.getCurrent', {})) as {
        id: number;
        focused: boolean;
        type: string;
        state: string;
        width: number;
        height: number;
      };
      return {
        pass: typeof win.id === 'number' && typeof win.type === 'string',
        data: {
          id: win.id,
          type: win.type,
          state: win.state,
          width: win.width,
          height: win.height,
        },
      };
    })
  );

  results.push(
    await test('windows.getLastFocused returns focused window', async () => {
      const win = (await chrome.call('windows.getLastFocused', {})) as {
        id: number;
        focused: boolean;
        type: string;
      };
      return {
        pass: typeof win.id === 'number' && typeof win.type === 'string',
        data: { id: win.id, focused: win.focused, type: win.type },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CREATE WINDOW
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.create opens a new window', async () => {
      const win = (await chrome.call('windows.create', {
        url: 'https://example.com',
        width: 800,
        height: 600,
        type: 'normal',
      })) as {
        id: number;
        width: number;
        height: number;
        type: string;
        tabs?: { id: number; url?: string }[];
      };
      createdWindowId = win.id;
      return {
        pass: typeof win.id === 'number' && win.id > 0,
        data: {
          id: win.id,
          width: win.width,
          height: win.height,
          type: win.type,
          tabCount: win.tabs?.length,
        },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  GET + INSPECT CREATED WINDOW
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.get retrieves the created window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const win = (await chrome.call('windows.get', createdWindowId, {
        populate: true,
      })) as {
        id: number;
        type: string;
        state: string;
        tabs?: { id: number; url?: string; pendingUrl?: string }[];
      };
      return {
        pass: win.id === createdWindowId && win.type === 'normal',
        data: {
          id: win.id,
          type: win.type,
          state: win.state,
          tabCount: win.tabs?.length,
        },
      };
    })
  );

  results.push(
    await test('windows.getAll includes the new window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const windows = (await chrome.call('windows.getAll', {})) as { id: number }[];
      const found = windows.some((w) => w.id === createdWindowId);
      return {
        pass: found,
        data: { windowCount: windows.length, foundCreated: found },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  UPDATE WINDOW
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.update can minimize a window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const win = (await chrome.call('windows.update', createdWindowId, {
        state: 'minimized',
      })) as { id: number; state: string };
      return {
        pass: win.state === 'minimized',
        data: { id: win.id, state: win.state },
      };
    })
  );

  results.push(
    await test('windows.update can restore a window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      // macOS needs a moment after minimize before restore takes effect
      await new Promise((r) => setTimeout(r, 500));

      await chrome.call('windows.update', createdWindowId, {
        state: 'normal',
      });

      // Wait for the state change to complete
      await new Promise((r) => setTimeout(r, 500));

      const win = (await chrome.call('windows.get', createdWindowId, {})) as {
        id: number;
        state: string;
      };
      return {
        pass: win.state === 'normal',
        data: { id: win.id, state: win.state },
      };
    })
  );

  results.push(
    await test('windows.update can resize a window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const win = (await chrome.call('windows.update', createdWindowId, {
        width: 1024,
        height: 768,
      })) as { id: number; width: number; height: number };
      return {
        pass: typeof win.width === 'number' && typeof win.height === 'number',
        data: { id: win.id, width: win.width, height: win.height },
      };
    })
  );

  results.push(
    await test('windows.update can move a window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const win = (await chrome.call('windows.update', createdWindowId, {
        left: 100,
        top: 100,
      })) as { id: number; left: number; top: number };
      return {
        pass: typeof win.left === 'number' && typeof win.top === 'number',
        data: { id: win.id, left: win.left, top: win.top },
      };
    })
  );

  results.push(
    await test('windows.update can focus a window', async () => {
      if (!createdWindowId) return { pass: false, data: 'No window created' };

      const win = (await chrome.call('windows.update', createdWindowId, {
        focused: true,
      })) as { id: number; focused: boolean };
      return {
        pass: win.focused === true,
        data: { id: win.id, focused: win.focused },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CREATE POPUP WINDOW
  // ═══════════════════════════════════════════════════════════════

  let popupWindowId: number | null = null;

  results.push(
    await test('windows.create can open a popup window', async () => {
      const win = (await chrome.call('windows.create', {
        url: 'https://example.com',
        type: 'popup',
        width: 400,
        height: 300,
      })) as { id: number; type: string; width: number; height: number };
      popupWindowId = win.id;
      return {
        pass: win.type === 'popup' && win.id > 0,
        data: { id: win.id, type: win.type, width: win.width, height: win.height },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.get with invalid id returns error', async () => {
      try {
        await chrome.call('windows.get', 999999999, {});
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { pass: msg.length > 0, data: msg };
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP — remove created windows
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('windows.remove closes created windows', async () => {
      const removed: number[] = [];
      for (const winId of [createdWindowId, popupWindowId]) {
        if (!winId) continue;
        await chrome.call('windows.remove', winId);
        try {
          await chrome.call('windows.get', winId, {});
        } catch {
          removed.push(winId);
        }
      }
      return {
        pass: removed.length === 2,
        data: { removed },
      };
    })
  );

  // ── Report ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Windows E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
