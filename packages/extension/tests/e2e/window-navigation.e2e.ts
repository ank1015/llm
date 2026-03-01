/**
 * E2E tests for Window navigation helpers.
 *
 * Verifies:
 *   - open
 *   - tabs
 *   - switchTab
 *   - closeTab
 *   - back
 *   - reload
 *   - current
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-navigation
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
  active?: boolean;
  status?: string;
  url?: string;
  title?: string;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:window-nav] ${msg}\n`);
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
  const window = new Window();

  await window.ready;
  log('connected and window initialized');

  const results: TestResult[] = [];

  let windowId: number | null = null;
  let tabAId: number | null = null;
  let tabBId: number | null = null;
  let latestCurrentId: number | null = null;

  results.push(
    await test('tabs returns tabs in the created window', async () => {
      const allTabs = await window.tabs();
      if (allTabs.length === 0) {
        return { pass: false, data: 'No tabs found in window' };
      }

      const firstWindowId = allTabs[0]?.windowId;
      if (typeof firstWindowId !== 'number') {
        return { pass: false, data: 'Could not resolve windowId from tabs' };
      }

      windowId = firstWindowId;
      const sameWindow = allTabs.every((tab) => tab.windowId === firstWindowId);

      return {
        pass: sameWindow,
        data: { tabCount: allTabs.length, windowId: firstWindowId },
      };
    })
  );

  results.push(
    await test('open creates a new loaded tab when newTab=true', async () => {
      const tab = await window.open('https://example.com/?window_nav=1', {
        newTab: true,
      });

      if (typeof tab.id !== 'number') {
        return { pass: false, data: tab };
      }

      tabAId = tab.id;

      return {
        pass:
          tab.status === 'complete' &&
          typeof tab.url === 'string' &&
          tab.url.includes('example.com'),
        data: { id: tab.id, url: tab.url, status: tab.status },
      };
    })
  );

  results.push(
    await test('open with tabId navigates the existing tab and waits for load', async () => {
      if (tabAId === null) return { pass: false, data: 'Missing tabAId' };

      const tab = await window.open('https://example.org/?window_nav=2', { tabId: tabAId });

      return {
        pass:
          tab.id === tabAId &&
          tab.status === 'complete' &&
          typeof tab.url === 'string' &&
          tab.url.includes('example.org'),
        data: { id: tab.id, url: tab.url, status: tab.status },
      };
    })
  );

  results.push(
    await test('current returns active tab in this window', async () => {
      const current = await window.current();
      if (!current || typeof current.id !== 'number') {
        return { pass: false, data: current };
      }

      latestCurrentId = current.id;

      return {
        pass: current.active === true && (windowId === null || current.windowId === windowId),
        data: {
          id: current.id,
          windowId: current.windowId,
          url: current.url,
          active: current.active,
        },
      };
    })
  );

  results.push(
    await test('open with active=false keeps previous tab active', async () => {
      const before = await window.current();
      if (!before || typeof before.id !== 'number') {
        return { pass: false, data: before };
      }

      const created = await window.open('https://example.net/?window_nav=3', {
        newTab: true,
        active: false,
      });

      if (typeof created.id !== 'number') {
        return { pass: false, data: created };
      }

      tabBId = created.id;

      const after = await window.current();
      return {
        pass: after?.id === before.id,
        data: {
          beforeActiveTabId: before.id,
          afterActiveTabId: after?.id,
          createdInactiveTabId: created.id,
          createdTabActive: created.active,
        },
      };
    })
  );

  results.push(
    await test('switchTab activates target tab and waits for load', async () => {
      if (tabBId === null) return { pass: false, data: 'Missing tabBId' };

      const switched = await window.switchTab(tabBId);
      const current = await window.current();

      latestCurrentId = current?.id ?? null;

      return {
        pass: switched.id === tabBId && current?.id === tabBId,
        data: { switchedId: switched.id, currentId: current?.id, status: switched.status },
      };
    })
  );

  results.push(
    await test('back navigates tab history and waits until loaded', async () => {
      if (tabBId === null) return { pass: false, data: 'Missing tabBId' };

      await window.open('https://example.com/?history=base', { tabId: tabBId });

      await chrome.call('scripting.executeScript', {
        target: { tabId: tabBId },
        code: `(() => {
          history.pushState({ step: 1 }, '', '/?history=first');
          history.pushState({ step: 2 }, '', '/?history=second');
          return location.href;
        })()`,
      });

      const backResult = await window.back(tabBId);

      return {
        pass:
          backResult.id === tabBId &&
          backResult.status === 'complete' &&
          typeof backResult.url === 'string' &&
          backResult.url.includes('history=first'),
        data: { id: backResult.id, url: backResult.url, status: backResult.status },
      };
    })
  );

  results.push(
    await test('reload resolves after tab has loaded again', async () => {
      if (tabBId === null) return { pass: false, data: 'Missing tabBId' };

      const before = await window.current();
      const reloaded = await window.reload(tabBId);

      return {
        pass:
          reloaded.id === tabBId &&
          reloaded.status === 'complete' &&
          typeof reloaded.url === 'string' &&
          (before?.url === undefined || reloaded.url === before.url),
        data: {
          id: reloaded.id,
          beforeUrl: before?.url,
          afterUrl: reloaded.url,
          status: reloaded.status,
        },
      };
    })
  );

  results.push(
    await test('closeTab(tabId) closes the specified tab', async () => {
      if (tabBId === null) return { pass: false, data: 'Missing tabBId' };

      const target = tabBId;
      await window.closeTab(target);
      tabBId = null;

      const remaining = await window.tabs();
      const stillExists = remaining.some((tab) => tab.id === target);

      return {
        pass: !stillExists,
        data: { closedTabId: target, remainingCount: remaining.length },
      };
    })
  );

  results.push(
    await test('closeTab() closes the current active tab', async () => {
      const keepTab = await window.open('https://example.com/?keep=1', {
        newTab: true,
        active: false,
      });
      const closeTarget = await window.open('https://example.org/?close=1', {
        newTab: true,
        active: true,
      });

      if (typeof closeTarget.id !== 'number') {
        return { pass: false, data: closeTarget };
      }

      latestCurrentId = closeTarget.id;

      await window.closeTab();

      const remaining = await window.tabs();
      const closedGone = !remaining.some((tab) => tab.id === closeTarget.id);

      return {
        pass:
          closedGone &&
          (keepTab.id === undefined || remaining.some((tab) => tab.id === keepTab.id)),
        data: {
          closedCurrentTabId: closeTarget.id,
          keepTabId: keepTab.id,
          remainingCount: remaining.length,
          previousCurrentId: latestCurrentId,
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
  log(`  Window Navigation E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
