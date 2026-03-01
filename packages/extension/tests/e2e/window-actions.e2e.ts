/**
 * E2E tests for Window action helpers.
 *
 * Verifies:
 *   - click, type, clear, select, toggle, hover, focus, pressEnter, scroll
 *   - target actions resolve element details from observe snapshot ids
 *   - missing observe snapshot returns "You must observe before act"
 *
 * Prerequisites:
 *   1. pnpm build
 *   2. Extension loaded
 *   3. Native host running (TCP :9224)
 *
 * Run:
 *   pnpm test:e2e:window-actions
 */

import { connect, Window } from '../../src/index.js';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  data?: unknown;
}

interface WindowTab {
  id?: number;
  windowId?: number;
  url?: string;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

function log(message: string): void {
  process.stderr.write(`[e2e:window-actions] ${message}\n`);
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

function buildActionsPageDataUrl(): string {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Window Actions E2E</title>
        <style>
          body { font-family: sans-serif; margin: 0; padding: 20px; }
          .spacer { height: 2400px; }
          .row { margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>Action Playground</h1>

        <div class="row">
          <button id="click-btn" data-testid="click-btn">Action Click</button>
          <span id="click-count">0</span>
        </div>

        <div class="row">
          <input id="name-input" name="name" placeholder="Type Here" />
        </div>

        <div class="row">
          <select id="plan-select" name="plan" aria-label="Plan Select">
            <option value="">Choose Plan</option>
            <option value="basic">Basic Plan</option>
            <option value="pro">Pro Plan</option>
          </select>
        </div>

        <div class="row">
          <label>
            <input id="terms-checkbox" type="checkbox" aria-label="Accept Terms" />
            Accept Terms
          </label>
        </div>

        <div class="row">
          <button id="hover-btn">Hover Me</button>
        </div>

        <div class="row">
          <form id="submit-form">
            <input id="enter-input" placeholder="Enter Field" />
          </form>
          <span id="submit-count">0</span>
        </div>

        <div class="spacer"></div>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildNoObservePageDataUrl(): string {
  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /><title>No Observe</title></head>
      <body>
        <button id="plain-btn">Plain Button</button>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function extractElementId(markdown: string, containsText: string): string | null {
  const lines = markdown.split('\n');
  const targetLine = lines.find((line) => line.includes(containsText));
  if (!targetLine) {
    return null;
  }

  const match = targetLine.match(/\*\*(E\d+)\*\*/);
  return match?.[1] ?? null;
}

async function evaluateTab<T>(
  chrome: Awaited<ReturnType<typeof connect>>,
  tabId: number,
  code: string
): Promise<T> {
  const evalResult = (await chrome.call('debugger.evaluate', {
    tabId,
    code,
  })) as DebuggerEvaluateResult;

  return evalResult.result as T;
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
  let tabId: number | null = null;

  const ids: Record<string, string> = {};

  results.push(
    await test('setup: open deterministic action page', async () => {
      const tab = (await window.open(buildActionsPageDataUrl(), {
        newTab: true,
        active: true,
      })) as WindowTab;

      if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
        return { pass: false, data: tab };
      }

      tabId = tab.id;
      windowId = tab.windowId;

      await chrome.call('debugger.evaluate', {
        tabId,
        code: `
(() => {
  window.__clickCount = 0;
  window.__submitCount = 0;

  const clickBtn = document.getElementById('click-btn');
  const clickCount = document.getElementById('click-count');
  if (clickBtn && clickCount) {
    clickBtn.addEventListener('click', () => {
      window.__clickCount += 1;
      clickCount.textContent = String(window.__clickCount);
    });
  }

  const hoverBtn = document.getElementById('hover-btn');
  if (hoverBtn) {
    hoverBtn.addEventListener('mouseover', () => {
      hoverBtn.setAttribute('data-hovered', 'yes');
    });
  }

  const form = document.getElementById('submit-form');
  const submitCount = document.getElementById('submit-count');
  if (form && submitCount) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      window.__submitCount += 1;
      submitCount.textContent = String(window.__submitCount);
    });
  }

  return 'ok';
})()
        `.trim(),
      });

      return { pass: true, data: { tabId, windowId } };
    })
  );

  results.push(
    await test('observe provides ids used by action methods', async () => {
      const markdown = await window.observe({ max: 150 });

      ids.click = extractElementId(markdown, 'Action Click') ?? '';
      ids.input = extractElementId(markdown, 'Type Here') ?? '';
      ids.select = extractElementId(markdown, 'Plan Select') ?? '';
      ids.checkbox = extractElementId(markdown, 'Accept Terms') ?? '';
      ids.hover = extractElementId(markdown, 'Hover Me') ?? '';
      ids.enter = extractElementId(markdown, 'Enter Field') ?? '';

      const missing = Object.entries(ids)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      return {
        pass: missing.length === 0,
        data: {
          ids,
          missing,
        },
      };
    })
  );

  results.push(
    await test('click(id) clicks target from observe snapshot', async () => {
      if (tabId === null || !ids.click) return { pass: false, data: { tabId, clickId: ids.click } };

      const message = await window.click(ids.click, { tabId });
      const clickCount = await evaluateTab<number>(chrome, tabId, 'window.__clickCount');

      return {
        pass: clickCount === 1 && message.includes('Clicked target element'),
        data: { message, clickCount },
      };
    })
  );

  results.push(
    await test('type(id, value) updates input', async () => {
      if (tabId === null || !ids.input) return { pass: false, data: { tabId, inputId: ids.input } };

      const message = await window.type(ids.input, 'Alice', { tabId });
      const value = await evaluateTab<string>(
        chrome,
        tabId,
        `(() => {
          const input = document.getElementById('name-input');
          return String(input && 'value' in input ? input.value : '');
        })()`
      );

      return {
        pass: value === 'Alice' && message.includes('Typed into target'),
        data: { message, value },
      };
    })
  );

  results.push(
    await test('clear(id) clears input', async () => {
      if (tabId === null || !ids.input) return { pass: false, data: { tabId, inputId: ids.input } };

      const message = await window.clear(ids.input, { tabId });
      const value = await evaluateTab<string>(
        chrome,
        tabId,
        `(() => {
          const input = document.getElementById('name-input');
          return String(input && 'value' in input ? input.value : '');
        })()`
      );

      return {
        pass: value === '' && message.includes('Cleared'),
        data: { message, value },
      };
    })
  );

  results.push(
    await test('select(id, value) selects option', async () => {
      if (tabId === null || !ids.select)
        return { pass: false, data: { tabId, selectId: ids.select } };

      const message = await window.select(ids.select, 'pro', { tabId });
      const value = await evaluateTab<string>(
        chrome,
        tabId,
        `(() => {
          const select = document.getElementById('plan-select');
          return String(select && 'value' in select ? select.value : '');
        })()`
      );

      return {
        pass: value === 'pro' && message.includes('Selected option'),
        data: { message, value },
      };
    })
  );

  results.push(
    await test('toggle(id) toggles checkbox', async () => {
      if (tabId === null || !ids.checkbox) {
        return { pass: false, data: { tabId, checkboxId: ids.checkbox } };
      }

      const message = await window.toggle(ids.checkbox, { tabId });
      const checked = await evaluateTab<boolean>(
        chrome,
        tabId,
        `(() => {
          const checkbox = document.getElementById('terms-checkbox');
          return Boolean(checkbox && 'checked' in checkbox ? checkbox.checked : false);
        })()`
      );

      return {
        pass: checked === true && message.includes('Toggled'),
        data: { message, checked },
      };
    })
  );

  results.push(
    await test('hover(id) dispatches hover events', async () => {
      if (tabId === null || !ids.hover) return { pass: false, data: { tabId, hoverId: ids.hover } };

      const message = await window.hover(ids.hover, { tabId });
      const hovered = await evaluateTab<string>(
        chrome,
        tabId,
        `String((document.getElementById('hover-btn')?.getAttribute('data-hovered')) || '')`
      );

      return {
        pass: hovered === 'yes' && message.includes('Hovered target element'),
        data: { message, hovered },
      };
    })
  );

  results.push(
    await test('focus(id) focuses target input', async () => {
      if (tabId === null || !ids.input) return { pass: false, data: { tabId, inputId: ids.input } };

      const message = await window.focus(ids.input, { tabId });
      const activeId = await evaluateTab<string>(
        chrome,
        tabId,
        `(() => {
          const active = document.activeElement;
          return String(active && 'id' in active ? active.id : '');
        })()`
      );

      return {
        pass: activeId === 'name-input' && message.includes('Focused target element'),
        data: { message, activeId },
      };
    })
  );

  results.push(
    await test('pressEnter(id) triggers form submit handler', async () => {
      if (tabId === null || !ids.enter) return { pass: false, data: { tabId, enterId: ids.enter } };

      await window.type(ids.enter, 'hello', { tabId });
      const message = await window.pressEnter(ids.enter, { tabId });
      const submitCount = await evaluateTab<number>(chrome, tabId, 'window.__submitCount');

      return {
        pass: submitCount >= 1 && message.includes('Pressed Enter'),
        data: { message, submitCount },
      };
    })
  );

  results.push(
    await test('scroll() scrolls page and scroll({targetId}) scrolls target into view', async () => {
      if (tabId === null || !ids.click) return { pass: false, data: { tabId, clickId: ids.click } };

      const pageMessage = await window.scroll({ tabId, y: 900 });
      const scrollYAfterPage = await evaluateTab<number>(chrome, tabId, 'window.scrollY');
      const targetMessage = await window.scroll({ tabId, targetId: ids.click });
      const targetVisible = await evaluateTab<boolean>(
        chrome,
        tabId,
        `(() => {
          const el = document.getElementById('click-btn');
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        })()`
      );

      return {
        pass:
          scrollYAfterPage > 0 &&
          targetVisible === true &&
          pageMessage.includes('Scrolled page') &&
          targetMessage.includes('Scrolled target'),
        data: {
          pageMessage,
          targetMessage,
          scrollYAfterPage,
          targetVisible,
        },
      };
    })
  );

  results.push(
    await test('action returns observe reminder when snapshot is missing for tab', async () => {
      const freshTab = (await window.open(buildNoObservePageDataUrl(), {
        newTab: true,
        active: true,
      })) as WindowTab;

      if (typeof freshTab.id !== 'number') {
        return { pass: false, data: freshTab };
      }

      const message = await window.click('E1', { tabId: freshTab.id });

      return {
        pass: message === 'You must observe before act',
        data: { message, tabId: freshTab.id },
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('No window with id')) {
          return { pass: true, data: { removedWindowId: windowId, note: 'already closed' } };
        }
        return { pass: false, data: { windowId, error: message } };
      }
    })
  );

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass).length;

  log('');
  log('='.repeat(60));
  log(`  Window Actions E2E: ${passed} passed, ${failed} failed, ${results.length} total`);
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
