/**
 * E2E test for Chrome RPC over native messaging.
 *
 * Connects to the native host's TCP server and makes real Chrome API
 * calls against a running Chrome instance with the extension installed.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. ./manifests/install-host.sh <extension-id>
 *   3. Restart Chrome (first time only)
 *   4. Extension loaded and native host running
 *
 * Run:
 *   pnpm test:e2e
 */

import { connect } from '../../src/sdk/connect.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e] ${msg}\n`);
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

  // ── Test: tabs.query returns an array ───────────────────────────
  results.push(
    await test('tabs.query returns an array', async () => {
      const tabs = await chrome.call('tabs.query', {});
      return { pass: Array.isArray(tabs), data: `${(tabs as unknown[]).length} tabs` };
    })
  );

  // ── Test: tabs.query with filter returns active tab ─────────────
  results.push(
    await test('tabs.query with filter returns active tab', async () => {
      const tabs = (await chrome.call('tabs.query', {
        active: true,
        currentWindow: true,
      })) as { id: number; url?: string }[];
      return {
        pass: Array.isArray(tabs) && tabs.length >= 1 && typeof tabs[0]?.id === 'number',
        data: tabs.map((t) => ({ id: t.id, url: t.url })),
      };
    })
  );

  // ── Test: tabs.get with valid tab ID ────────────────────────────
  results.push(
    await test('tabs.get with valid tab ID', async () => {
      const tabs = (await chrome.call('tabs.query', {
        active: true,
        currentWindow: true,
      })) as { id: number }[];
      const tabId = tabs[0]?.id;
      if (!tabId) return { pass: false, data: 'No active tab found' };

      const tab = (await chrome.call('tabs.get', tabId)) as { id: number; url?: string };
      return { pass: tab.id === tabId, data: { id: tab.id, url: tab.url } };
    })
  );

  // ── Test: scripting.executeScript with code string ──────────────
  results.push(
    await test('scripting.executeScript returns page title', async () => {
      const tabs = (await chrome.call('tabs.query', {
        active: true,
        currentWindow: true,
      })) as { id: number }[];
      const tabId = tabs[0]?.id;
      if (!tabId) return { pass: false, data: 'No active tab found' };

      const result = (await chrome.call('scripting.executeScript', {
        target: { tabId },
        code: 'document.title',
      })) as { result: unknown }[];
      const title = result[0]?.result;
      return {
        pass: typeof title === 'string' && title.length > 0,
        data: title,
      };
    })
  );

  // ── Test: scripting.executeScript complex expression ─────────────
  results.push(
    await test('scripting.executeScript evaluates expressions', async () => {
      const tabs = (await chrome.call('tabs.query', {
        active: true,
        currentWindow: true,
      })) as { id: number }[];
      const tabId = tabs[0]?.id;
      if (!tabId) return { pass: false, data: 'No active tab found' };

      const result = (await chrome.call('scripting.executeScript', {
        target: { tabId },
        code: '({ url: location.href, nodeCount: document.querySelectorAll("*").length })',
      })) as { result: unknown }[];
      const data = result[0]?.result as { url?: string; nodeCount?: number } | null;
      return {
        pass: typeof data?.url === 'string' && typeof data?.nodeCount === 'number',
        data,
      };
    })
  );

  // ── Test: invalid method returns error ──────────────────────────
  results.push(
    await test('invalid method returns error', async () => {
      try {
        await chrome.call('nonexistent.fakeMethod');
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { pass: msg.includes('not available'), data: msg };
      }
    })
  );

  // ── Test: storage.local.set and get ─────────────────────────────
  results.push(
    await test('storage.local set and get', async () => {
      const testKey = '__e2e_test_' + Date.now();
      await chrome.call('storage.local.set', { [testKey]: 'hello' });
      const data = (await chrome.call('storage.local.get', testKey)) as Record<string, string>;
      const pass = data[testKey] === 'hello';
      await chrome.call('storage.local.remove', testKey);
      return { pass, data };
    })
  );

  // ── Test: subscribe and unsubscribe ─────────────────────────────
  results.push(
    await test('subscribe and unsubscribe without error', async () => {
      const events: unknown[] = [];
      const unsubscribe = chrome.subscribe('tabs.onActivated', (data) => events.push(data));
      await new Promise((r) => setTimeout(r, 200));
      unsubscribe();
      return { pass: true, data: `received ${events.length} events during wait` };
    })
  );

  // ── Report results ──────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  E2E Results: ${passed} passed, ${failed} failed, ${results.length} total`);
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
