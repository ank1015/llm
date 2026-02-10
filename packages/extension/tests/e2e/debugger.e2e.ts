/**
 * E2E test for chrome.debugger API via debugger.evaluate RPC method.
 *
 * Tests CSP-bypassing JS execution on a strict-CSP page (claude.ai)
 * and a permissive page (example.com) to verify the debugger attach →
 * Runtime.evaluate → detach lifecycle works correctly.
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded with debugger permission
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:debugger
 */

import { connect, type ChromeClient } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:debugger] ${msg}\n`);
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

// claude.ai has strict CSP — proves debugger bypasses it
const STRICT_CSP_URL = 'https://claude.ai/new';
// example.com has no CSP — baseline comparison
const PERMISSIVE_URL = 'https://example.com';

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;

  const chrome = await connect({ port });
  log('connected');

  const results: TestResult[] = [];
  let strictTabId: number | null = null;
  let permissiveTabId: number | null = null;

  // ── Setup: open both tabs ───────────────────────────────────────
  results.push(
    await test('open strict-CSP page (claude.ai)', async () => {
      const tab = (await chrome.call('tabs.create', { url: STRICT_CSP_URL })) as {
        id: number;
        status?: string;
      };
      strictTabId = tab.id;
      return { pass: tab.id > 0, data: { id: tab.id } };
    })
  );

  results.push(
    await test('open permissive page (example.com)', async () => {
      const tab = (await chrome.call('tabs.create', { url: PERMISSIVE_URL })) as {
        id: number;
        status?: string;
      };
      permissiveTabId = tab.id;
      return { pass: tab.id > 0, data: { id: tab.id } };
    })
  );

  if (strictTabId) {
    log('waiting for claude.ai to load...');
    await waitForTabLoad(chrome, strictTabId);
    log('claude.ai loaded');
  }
  if (permissiveTabId) {
    log('waiting for example.com to load...');
    await waitForTabLoad(chrome, permissiveTabId);
    log('example.com loaded');
  }

  // ═══════════════════════════════════════════════════════════════
  //  BASIC EVALUATION
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('evaluate simple expression (string)', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '"hello"',
      })) as { result: unknown; type: string };

      return {
        pass: result.result === 'hello' && result.type === 'string',
        data: result,
      };
    })
  );

  results.push(
    await test('evaluate numeric expression', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '2 + 2',
      })) as { result: unknown; type: string };

      return {
        pass: result.result === 4 && result.type === 'number',
        data: result,
      };
    })
  );

  results.push(
    await test('evaluate boolean expression', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: 'true && !false',
      })) as { result: unknown; type: string };

      return {
        pass: result.result === true && result.type === 'boolean',
        data: result,
      };
    })
  );

  results.push(
    await test('evaluate object expression', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '({ a: 1, b: "two", c: [3] })',
      })) as { result: unknown; type: string };

      const data = result.result as { a?: number; b?: string; c?: number[] } | null;
      return {
        pass: data?.a === 1 && data?.b === 'two' && Array.isArray(data?.c),
        data: result,
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CSP BYPASS — strict-CSP page (claude.ai)
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('read document.title on strict-CSP page', async () => {
      if (!strictTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: strictTabId,
        code: 'document.title',
      })) as { result: unknown; type: string };

      return {
        pass: typeof result.result === 'string' && (result.result as string).length > 0,
        data: result,
      };
    })
  );

  results.push(
    await test('read location.href on strict-CSP page', async () => {
      if (!strictTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: strictTabId,
        code: 'location.href',
      })) as { result: unknown; type: string };

      return {
        pass: typeof result.result === 'string' && (result.result as string).includes('claude.ai'),
        data: result,
      };
    })
  );

  results.push(
    await test('query DOM on strict-CSP page', async () => {
      if (!strictTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: strictTabId,
        code: `({
          nodeCount: document.querySelectorAll('*').length,
          hasHead: !!document.head,
          hasBody: !!document.body,
          charset: document.characterSet,
        })`,
      })) as { result: unknown; type: string };

      const data = result.result as { nodeCount?: number; hasBody?: boolean } | null;
      return {
        pass: typeof data?.nodeCount === 'number' && data.nodeCount > 0 && data?.hasBody === true,
        data: result,
      };
    })
  );

  results.push(
    await test('execute IIFE on strict-CSP page', async () => {
      if (!strictTabId) return { pass: false, data: 'No tab' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId: strictTabId,
        code: `(() => {
          const meta = document.querySelectorAll('meta');
          return {
            metaCount: meta.length,
            names: Array.from(meta).map(m => m.getAttribute('name')).filter(Boolean),
          };
        })()`,
      })) as { result: unknown; type: string };

      const data = result.result as { metaCount?: number } | null;
      return {
        pass: typeof data?.metaCount === 'number',
        data: result,
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  SEQUENTIAL EVALUATIONS (attach/detach cycle works repeatedly)
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('multiple sequential evaluations on same tab', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      const r1 = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '1',
      })) as { result: unknown };

      const r2 = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '2',
      })) as { result: unknown };

      const r3 = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '3',
      })) as { result: unknown };

      return {
        pass: r1.result === 1 && r2.result === 2 && r3.result === 3,
        data: { r1: r1.result, r2: r2.result, r3: r3.result },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('syntax error returns descriptive error', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      try {
        await chrome.call('debugger.evaluate', {
          tabId: permissiveTabId,
          code: '({]]])',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          pass: msg.length > 0 && msg.includes('SyntaxError'),
          data: msg,
        };
      }
    })
  );

  results.push(
    await test('runtime error returns descriptive error', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      try {
        await chrome.call('debugger.evaluate', {
          tabId: permissiveTabId,
          code: 'undefinedVariable.property',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          pass: msg.length > 0,
          data: msg,
        };
      }
    })
  );

  results.push(
    await test('throw expression returns error', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      try {
        await chrome.call('debugger.evaluate', {
          tabId: permissiveTabId,
          code: 'throw new Error("test error")',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          pass: msg.includes('test error'),
          data: msg,
        };
      }
    })
  );

  results.push(
    await test('invalid tabId returns error', async () => {
      try {
        await chrome.call('debugger.evaluate', {
          tabId: 999999999,
          code: '1+1',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          pass: msg.includes('attach'),
          data: msg,
        };
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  DETACH RESILIENCE (debugger detaches cleanly after each call)
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('eval works after a previous error (detach was clean)', async () => {
      if (!permissiveTabId) return { pass: false, data: 'No tab' };

      // First: trigger an error
      try {
        await chrome.call('debugger.evaluate', {
          tabId: permissiveTabId,
          code: 'throw new Error("fail")',
        });
      } catch {
        // expected
      }

      // Second: this should still work (debugger was detached properly)
      const result = (await chrome.call('debugger.evaluate', {
        tabId: permissiveTabId,
        code: '"recovered"',
      })) as { result: unknown };

      return {
        pass: result.result === 'recovered',
        data: result,
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('close both tabs', async () => {
      const removed: number[] = [];
      for (const id of [strictTabId, permissiveTabId]) {
        if (!id) continue;
        await chrome.call('tabs.remove', id);
        try {
          await chrome.call('tabs.get', id);
        } catch {
          removed.push(id);
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
  log(`  Debugger E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
