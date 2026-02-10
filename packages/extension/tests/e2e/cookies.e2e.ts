/**
 * E2E test for Chrome cookies API.
 *
 * Opens claude.ai/new and reads cookies for that domain.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded with cookies permission
 *   3. Native host running (TCP :9224)
 *   4. You must be logged into claude.ai (or at least have visited it)
 *
 * Run:
 *   pnpm test:e2e:cookies
 */

import { connect, type ChromeClient } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:cookies] ${msg}\n`);
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

async function waitForTabLoad(
  chrome: ChromeClient,
  tabId: number,
  timeoutMs = 15000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = (await chrome.call('tabs.get', tabId)) as { status?: string };
    if (tab.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

const CLAUDE_URL = 'https://claude.ai/new';

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;

  const chrome = await connect({ port });
  log('connected');

  const results: TestResult[] = [];
  let tabId: number | null = null;

  // ── Open claude.ai ──────────────────────────────────────────────
  results.push(
    await test('tabs.create opens claude.ai/new', async () => {
      const tab = (await chrome.call('tabs.create', { url: CLAUDE_URL })) as {
        id: number;
        pendingUrl?: string;
        status?: string;
      };
      tabId = tab.id;
      return {
        pass: typeof tab.id === 'number' && tab.id > 0,
        data: { id: tab.id, pendingUrl: tab.pendingUrl, status: tab.status },
      };
    })
  );

  if (tabId) {
    log('waiting for page to load...');
    await waitForTabLoad(chrome, tabId);
    log('page loaded');
  }

  // ═══════════════════════════════════════════════════════════════
  //  COOKIES API
  // ═══════════════════════════════════════════════════════════════

  // ── cookies.getAll for claude.ai ────────────────────────────────
  results.push(
    await test('cookies.getAll returns cookies for claude.ai', async () => {
      const cookies = (await chrome.call('cookies.getAll', {
        domain: 'claude.ai',
      })) as { name: string; value: string; domain: string }[];

      return {
        pass: Array.isArray(cookies) && cookies.length > 0,
        data: {
          count: cookies.length,
          names: cookies.map((c) => c.name),
        },
      };
    })
  );

  // ── cookies.getAll returns expected cookie shape ────────────────
  results.push(
    await test('cookies have expected properties', async () => {
      const cookies = (await chrome.call('cookies.getAll', {
        domain: 'claude.ai',
      })) as {
        name: string;
        value: string;
        domain: string;
        path: string;
        secure: boolean;
        httpOnly: boolean;
      }[];

      if (cookies.length === 0) return { pass: false, data: 'No cookies found' };

      const first = cookies[0]!;
      const hasShape =
        typeof first.name === 'string' &&
        typeof first.value === 'string' &&
        typeof first.domain === 'string' &&
        typeof first.path === 'string' &&
        typeof first.secure === 'boolean' &&
        typeof first.httpOnly === 'boolean';

      return {
        pass: hasShape,
        data: {
          name: first.name,
          domain: first.domain,
          path: first.path,
          secure: first.secure,
          httpOnly: first.httpOnly,
        },
      };
    })
  );

  // ── cookies.getAll by URL ───────────────────────────────────────
  results.push(
    await test('cookies.getAll with url filter returns cookies', async () => {
      const cookies = (await chrome.call('cookies.getAll', {
        url: 'https://claude.ai',
      })) as { name: string; domain: string }[];

      return {
        pass: Array.isArray(cookies) && cookies.length > 0,
        data: {
          count: cookies.length,
          names: cookies.map((c) => c.name),
        },
      };
    })
  );

  // ── cookies.getAllCookieStores ───────────────────────────────────
  results.push(
    await test('cookies.getAllCookieStores returns stores', async () => {
      const stores = (await chrome.call('cookies.getAllCookieStores')) as {
        id: string;
        tabIds: number[];
      }[];

      return {
        pass: Array.isArray(stores) && stores.length > 0 && typeof stores[0]?.id === 'string',
        data: stores.map((s) => ({ id: s.id, tabCount: s.tabIds.length })),
      };
    })
  );

  // ── cookies.get for a specific cookie ───────────────────────────
  results.push(
    await test('cookies.get retrieves a specific cookie by name', async () => {
      // First find a cookie name to look up
      const cookies = (await chrome.call('cookies.getAll', {
        domain: 'claude.ai',
      })) as { name: string; domain: string }[];

      if (cookies.length === 0) return { pass: false, data: 'No cookies to look up' };

      const target = cookies[0]!;
      const cookie = (await chrome.call('cookies.get', {
        url: 'https://claude.ai',
        name: target.name,
      })) as { name: string; value: string } | null;

      return {
        pass: cookie !== null && cookie.name === target.name,
        data: { lookedUp: target.name, found: cookie?.name },
      };
    })
  );

  // ── cookies.set and remove (extension-owned test cookie) ────────
  results.push(
    await test('cookies.set creates a cookie and cookies.remove deletes it', async () => {
      const testName = '__e2e_cookie_test_' + Date.now();

      // Set
      const setCookie = (await chrome.call('cookies.set', {
        url: 'https://claude.ai',
        name: testName,
        value: 'test_value',
        path: '/',
      })) as { name: string; value: string } | null;

      if (!setCookie) return { pass: false, data: 'cookies.set returned null' };

      // Verify it exists
      const getCookie = (await chrome.call('cookies.get', {
        url: 'https://claude.ai',
        name: testName,
      })) as { name: string; value: string } | null;

      const setOk = getCookie?.value === 'test_value';

      // Remove
      const removed = (await chrome.call('cookies.remove', {
        url: 'https://claude.ai',
        name: testName,
      })) as { url: string; name: string } | null;

      // Verify it's gone
      const afterRemove = (await chrome.call('cookies.get', {
        url: 'https://claude.ai',
        name: testName,
      })) as { name: string } | null;

      return {
        pass: setOk && removed !== null && afterRemove === null,
        data: { setOk, removed: !!removed, goneAfterRemove: afterRemove === null },
      };
    })
  );

  // ── cookies.getAll for nonexistent domain returns empty ─────────
  results.push(
    await test('cookies.getAll for nonexistent domain returns empty array', async () => {
      const cookies = (await chrome.call('cookies.getAll', {
        domain: 'this-domain-does-not-exist-12345.example',
      })) as unknown[];

      return {
        pass: Array.isArray(cookies) && cookies.length === 0,
        data: { count: cookies.length },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('tabs.remove closes claude.ai tab', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };
      await chrome.call('tabs.remove', tabId);

      try {
        await chrome.call('tabs.get', tabId);
        return { pass: false, data: 'Tab still exists' };
      } catch {
        return { pass: true, data: { removedTabId: tabId } };
      }
    })
  );

  // ── Report results ──────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Cookies E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
