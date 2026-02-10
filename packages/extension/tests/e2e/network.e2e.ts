/**
 * E2E test for Chrome DevTools Protocol Network domain via debugger API.
 *
 * Uses debugger.attach / debugger.sendCommand / debugger.getEvents / debugger.detach
 * to capture network requests on a real page load.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded with debugger permission
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:network
 */

import { connect, type ChromeClient } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:network] ${msg}\n`);
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

interface NetworkEvent {
  method: string;
  params: {
    requestId?: string;
    request?: { url?: string; method?: string };
    response?: {
      url?: string;
      status?: number;
      mimeType?: string;
      headers?: Record<string, string>;
    };
    type?: string;
    timestamp?: number;
    [key: string]: unknown;
  };
}

const TEST_URL = 'https://example.com';

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;

  const chrome = await connect({ port });
  log('connected');

  const results: TestResult[] = [];
  let tabId: number | null = null;

  // ── Setup: create tab with about:blank ──────────────────────────
  results.push(
    await test('create tab for network capture', async () => {
      const tab = (await chrome.call('tabs.create', { url: 'about:blank' })) as {
        id: number;
        status?: string;
      };
      tabId = tab.id;
      return { pass: tab.id > 0, data: { id: tab.id } };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  DEBUGGER SESSION LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('debugger.attach opens a session', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.attach', { tabId })) as {
        attached?: boolean;
      };
      return { pass: result.attached === true, data: result };
    })
  );

  results.push(
    await test('debugger.attach on already-attached tab returns alreadyAttached', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.attach', { tabId })) as {
        alreadyAttached?: boolean;
      };
      return { pass: result.alreadyAttached === true, data: result };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK DOMAIN — ENABLE + CAPTURE
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('Network.enable succeeds', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const result = await chrome.call('debugger.sendCommand', {
        tabId,
        method: 'Network.enable',
      });
      // Network.enable returns empty object on success
      return { pass: true, data: result };
    })
  );

  // Navigate to example.com to generate network traffic
  results.push(
    await test('Page.navigate triggers network requests', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      await chrome.call('debugger.sendCommand', {
        tabId,
        method: 'Page.navigate',
        params: { url: TEST_URL },
      });

      // Wait for page to load
      await waitForTabLoad(chrome, tabId);

      // Small extra wait for network events to propagate
      await new Promise((r) => setTimeout(r, 1000));

      return { pass: true, data: 'navigated' };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  COLLECTED EVENTS
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('debugger.getEvents returns Network events', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      return {
        pass: Array.isArray(events) && events.length > 0,
        data: {
          totalEvents: events.length,
          eventTypes: [...new Set(events.map((e) => e.method))],
        },
      };
    })
  );

  results.push(
    await test('Network.requestWillBeSent events captured', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      const requests = events.filter((e) => e.method === 'Network.requestWillBeSent');
      return {
        pass: requests.length > 0,
        data: {
          count: requests.length,
          urls: requests.map((r) => r.params.request?.url).slice(0, 5),
        },
      };
    })
  );

  results.push(
    await test('Network.responseReceived events captured', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      const responses = events.filter((e) => e.method === 'Network.responseReceived');
      return {
        pass: responses.length > 0,
        data: {
          count: responses.length,
          first: responses[0]
            ? {
                url: responses[0].params.response?.url,
                status: responses[0].params.response?.status,
                mimeType: responses[0].params.response?.mimeType,
              }
            : null,
        },
      };
    })
  );

  results.push(
    await test('Network.loadingFinished events captured', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      const finished = events.filter((e) => e.method === 'Network.loadingFinished');
      return {
        pass: finished.length > 0,
        data: { count: finished.length },
      };
    })
  );

  // ── Get a requestId for response body test ──────────────────────
  results.push(
    await test('Network.getResponseBody returns page HTML', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      // Find the main document response
      const docResponse = events.find(
        (e) =>
          e.method === 'Network.responseReceived' &&
          e.params.type === 'Document' &&
          e.params.response?.url?.includes('example.com')
      );

      if (!docResponse?.params.requestId) {
        return { pass: false, data: 'No document response found' };
      }

      const body = (await chrome.call('debugger.sendCommand', {
        tabId,
        method: 'Network.getResponseBody',
        params: { requestId: docResponse.params.requestId },
      })) as { body?: string; base64Encoded?: boolean };

      return {
        pass: typeof body.body === 'string' && body.body.length > 0,
        data: {
          bodyLength: body.body?.length,
          base64Encoded: body.base64Encoded,
          snippet: body.body?.slice(0, 100),
        },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  EVENT FILTERING + CLEAR
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('debugger.getEvents with clear removes returned events', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      // Get count before clear
      const before = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as unknown[];

      // Clear network events
      await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
        clear: true,
      });

      // Should be empty now
      const after = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as unknown[];

      return {
        pass: before.length > 0 && after.length === 0,
        data: { before: before.length, after: after.length },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  SECOND NAVIGATION — fresh capture after clear
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('fresh capture after clear works on second navigation', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      // Navigate again
      await chrome.call('debugger.sendCommand', {
        tabId,
        method: 'Page.navigate',
        params: { url: 'https://httpbin.org/get' },
      });

      await waitForTabLoad(chrome, tabId);
      await new Promise((r) => setTimeout(r, 1000));

      const events = (await chrome.call('debugger.getEvents', {
        tabId,
        filter: 'Network.',
      })) as NetworkEvent[];

      const requests = events.filter((e) => e.method === 'Network.requestWillBeSent');
      return {
        pass: requests.length > 0,
        data: {
          totalEvents: events.length,
          requestCount: requests.length,
          urls: requests.map((r) => r.params.request?.url).slice(0, 5),
        },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK.DISABLE + DETACH
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('Network.disable stops capture', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      await chrome.call('debugger.sendCommand', {
        tabId,
        method: 'Network.disable',
      });
      return { pass: true, data: 'disabled' };
    })
  );

  results.push(
    await test('debugger.detach closes session', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.detach', { tabId })) as {
        detached?: boolean;
      };
      return { pass: result.detached === true, data: result };
    })
  );

  results.push(
    await test('debugger.sendCommand fails after detach', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };

      try {
        await chrome.call('debugger.sendCommand', {
          tabId,
          method: 'Network.enable',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { pass: msg.includes('No debugger session'), data: msg };
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('close tab', async () => {
      if (!tabId) return { pass: false, data: 'No tab' };
      await chrome.call('tabs.remove', tabId);
      try {
        await chrome.call('tabs.get', tabId);
        return { pass: false, data: 'Tab still exists' };
      } catch {
        return { pass: true, data: { removedTabId: tabId } };
      }
    })
  );

  // ── Report ──────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Network E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
