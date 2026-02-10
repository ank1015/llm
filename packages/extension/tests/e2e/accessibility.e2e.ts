/**
 * E2E test for Chrome accessibility, tabs, and debugger APIs.
 *
 * Opens the Anthropic research page and exercises:
 *   - tabs.create / tabs.get / tabs.update / tabs.remove
 *   - accessibilityFeatures.animationPolicy get/set/clear
 *   - debugger.evaluate for CSP-bypassing JS execution
 *
 * Note: Most accessibilityFeatures (highContrast, largeCursor, etc.)
 * are ChromeOS-only. Only animationPolicy works cross-platform.
 *
 * Prerequisites — same as chrome-rpc.e2e.ts:
 *   1. pnpm build
 *   2. Extension loaded with debugger + accessibilityFeatures permissions
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:accessibility
 */

import { connect, type ChromeClient } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

function log(msg: string): void {
  process.stderr.write(`[e2e:a11y] ${msg}\n`);
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

/** Poll tabs.get until status is 'complete' or timeout. */
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

const ANTHROPIC_URL = 'https://www.anthropic.com/research/AI-assistance-coding-skills';

async function main(): Promise<void> {
  log('connecting to Chrome RPC server...');

  const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : undefined;

  const chrome = await connect({ port });
  log('connected');

  const results: TestResult[] = [];
  let tabId: number | null = null;

  // ═══════════════════════════════════════════════════════════════
  //  TABS LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('tabs.create opens Anthropic page', async () => {
      const tab = (await chrome.call('tabs.create', { url: ANTHROPIC_URL })) as {
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

  results.push(
    await test('tabs.get returns tab with url and title', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };
      const tab = (await chrome.call('tabs.get', tabId)) as {
        id: number;
        url?: string;
        title?: string;
        status?: string;
      };
      return {
        pass:
          tab.id === tabId &&
          tab.status === 'complete' &&
          typeof tab.url === 'string' &&
          tab.url.includes('anthropic.com'),
        data: { id: tab.id, url: tab.url, title: tab.title, status: tab.status },
      };
    })
  );

  results.push(
    await test('tabs.update can pin a tab', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };
      const tab = (await chrome.call('tabs.update', tabId, {
        pinned: true,
      })) as { id: number; pinned: boolean };
      return {
        pass: tab.pinned === true,
        data: { id: tab.id, pinned: tab.pinned },
      };
    })
  );

  results.push(
    await test('tabs.update can unpin a tab', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };
      const tab = (await chrome.call('tabs.update', tabId, {
        pinned: false,
      })) as { id: number; pinned: boolean };
      return {
        pass: tab.pinned === false,
        data: { id: tab.id, pinned: tab.pinned },
      };
    })
  );

  results.push(
    await test('tabs.query can filter by url pattern', async () => {
      const tabs = (await chrome.call('tabs.query', {
        url: '*://www.anthropic.com/*',
      })) as { id: number; url?: string }[];
      const found = tabs.some((t) => t.id === tabId);
      return {
        pass: found,
        data: { matchCount: tabs.length, foundCreatedTab: found },
      };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  ACCESSIBILITY FEATURES
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('accessibilityFeatures.animationPolicy.get reads setting', async () => {
      const result = (await chrome.call('accessibilityFeatures.animationPolicy.get', {})) as {
        value?: unknown;
        levelOfControl?: string;
      };
      return {
        pass: result !== null && typeof result === 'object' && 'value' in result,
        data: result,
      };
    })
  );

  results.push(
    await test('accessibilityFeatures.animationPolicy.set can change value', async () => {
      const original = (await chrome.call('accessibilityFeatures.animationPolicy.get', {})) as {
        value?: string;
      };
      const originalValue = original?.value ?? 'allowed';

      const newValue = originalValue === 'allowed' ? 'once' : 'allowed';
      await chrome.call('accessibilityFeatures.animationPolicy.set', { value: newValue });

      const updated = (await chrome.call('accessibilityFeatures.animationPolicy.get', {})) as {
        value?: string;
      };
      const pass = updated?.value === newValue;

      // Restore
      await chrome.call('accessibilityFeatures.animationPolicy.set', { value: originalValue });

      return {
        pass,
        data: { originalValue, setValue: newValue, readBack: updated?.value },
      };
    })
  );

  results.push(
    await test('accessibilityFeatures.animationPolicy.clear restores default', async () => {
      await chrome.call('accessibilityFeatures.animationPolicy.set', { value: 'once' });
      await chrome.call('accessibilityFeatures.animationPolicy.clear', {});

      const result = (await chrome.call('accessibilityFeatures.animationPolicy.get', {})) as {
        value?: string;
      };
      return {
        pass: result?.value === 'allowed',
        data: result,
      };
    })
  );

  results.push(
    await test('ChromeOS-only features return "not available" on macOS', async () => {
      const chromeOsOnly = [
        'highContrast',
        'largeCursor',
        'stickyKeys',
        'focusHighlight',
        'spokenFeedback',
      ];
      const errors: Record<string, string> = {};
      for (const feature of chromeOsOnly) {
        try {
          await chrome.call(`accessibilityFeatures.${feature}.get`, {});
          errors[feature] = 'unexpectedly succeeded';
        } catch (e) {
          errors[feature] = e instanceof Error ? e.message : String(e);
        }
      }
      const allFailed = Object.values(errors).every((msg) => msg.includes('not available'));
      return { pass: allFailed, data: errors };
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  DEBUGGER.EVALUATE (CSP-bypassing JS execution on Anthropic)
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('debugger.evaluate reads page title', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId,
        code: 'document.title',
      })) as { result: unknown; type: string };

      return {
        pass: typeof result.result === 'string' && (result.result as string).length > 0,
        data: result,
      };
    })
  );

  results.push(
    await test('debugger.evaluate counts headings', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId,
        code: `({
          h1: document.querySelectorAll('h1').length,
          h2: document.querySelectorAll('h2').length,
          h3: document.querySelectorAll('h3').length,
          total: document.querySelectorAll('h1,h2,h3').length,
        })`,
      })) as { result: unknown; type: string };

      const data = result.result as { total?: number } | null;
      return {
        pass: typeof data?.total === 'number' && data.total > 0,
        data: result,
      };
    })
  );

  results.push(
    await test('debugger.evaluate reads ARIA landmarks', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId,
        code: `({
          lang: document.documentElement.lang,
          hasMain: !!document.querySelector('main, [role="main"]'),
          hasNav: !!document.querySelector('nav, [role="navigation"]'),
          imgCount: document.querySelectorAll('img').length,
          imgWithAlt: document.querySelectorAll('img[alt]').length,
          ariaLabelCount: document.querySelectorAll('[aria-label]').length,
        })`,
      })) as { result: unknown; type: string };

      const data = result.result as { lang?: string } | null;
      return {
        pass: typeof data?.lang === 'string',
        data: result,
      };
    })
  );

  results.push(
    await test('debugger.evaluate audits link accessibility', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };

      const result = (await chrome.call('debugger.evaluate', {
        tabId,
        code: `(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return {
            totalLinks: links.length,
            withHref: links.filter(a => a.href).length,
            withAriaLabel: links.filter(a => a.getAttribute('aria-label')).length,
            emptyText: links.filter(a => !a.textContent?.trim() && !a.getAttribute('aria-label')).length,
          };
        })()`,
      })) as { result: unknown; type: string };

      const data = result.result as { totalLinks?: number } | null;
      return {
        pass: typeof data?.totalLinks === 'number',
        data: result,
      };
    })
  );

  results.push(
    await test('debugger.evaluate returns error for invalid code', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };

      try {
        await chrome.call('debugger.evaluate', {
          tabId,
          code: '({]]]invalid',
        });
        return { pass: false, data: 'Should have thrown' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { pass: msg.length > 0, data: msg };
      }
    })
  );

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  results.push(
    await test('tabs.remove closes the created tab', async () => {
      if (!tabId) return { pass: false, data: 'No tab created' };
      await chrome.call('tabs.remove', tabId);

      try {
        await chrome.call('tabs.get', tabId);
        return { pass: false, data: 'Tab still exists after remove' };
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
  log(`  Accessibility E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
