import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import { createActTool, type ActToolDetails } from '../../../../src/tools/browser/act.js';

interface ChromeWindow {
  id?: number;
}

interface ChromeTab {
  id?: number;
  status?: string;
  url?: string;
}

const runRealChromeIntegration = true;
const chromePort = process.env.CHROME_RPC_PORT
  ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
  : undefined;

const TEST_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Act Test</title></head>
  <body>
    <main>
      <h1>Act Tool Test</h1>
      <label for="name">Name</label>
      <input id="name" name="name" />
      <label for="plan">Plan</label>
      <select id="plan" name="plan">
        <option value="">Pick one</option>
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
      <button id="go" onclick="location.href='https://example.com/'">Continue</button>
    </main>
  </body>
</html>
`.trim();

describe.skipIf(!runRealChromeIntegration)('act tool real integration', () => {
  it('types, selects, and clicks on a real tab', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const dataUrl = `data:text/html,${encodeURIComponent(TEST_HTML)}`;
      const createdWindow = (await chrome.call('windows.create', {
        url: dataUrl,
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const actTool = createActTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const tabId = await getActiveTabId(chrome, createdWindowId!);
      await waitForTabLoad(chrome, tabId);

      const typeResult = (await actTool.execute('type-name', {
        tabId,
        type: 'type',
        target: { id: 'name' },
        value: 'Jane Doe',
      })) as { details: ActToolDetails };
      expect(typeResult.details.action).toBe('type');
      expect(typeResult.details.value).toBe('Jane Doe');

      const selectResult = (await actTool.execute('select-plan', {
        tabId,
        type: 'select',
        target: { id: 'plan' },
        value: 'pro',
      })) as { details: ActToolDetails };
      expect(selectResult.details.action).toBe('select');
      expect(selectResult.details.value).toBe('pro');

      const clickResult = (await actTool.execute('click-continue', {
        tabId,
        type: 'click',
        target: { id: 'go' },
        opts: {
          waitForNavigationMs: 8000,
        },
      })) as { details: ActToolDetails };
      expect(clickResult.details.action).toBe('click');

      await waitForTabLoad(chrome, tabId, 20000);
      const tab = (await chrome.call('tabs.get', tabId)) as ChromeTab;
      expect(typeof tab.url).toBe('string');
      expect(tab.url).toContain('example.com');
    } finally {
      if (typeof createdWindowId === 'number') {
        await cleanupWindow(chrome, createdWindowId);
      }
    }
  });
});

async function getActiveTabId(chrome: ChromeClient, windowId: number): Promise<number> {
  const activeTabs = (await chrome.call('tabs.query', {
    active: true,
    windowId,
  })) as ChromeTab[];

  const tabId = activeTabs[0]?.id;
  if (typeof tabId !== 'number') {
    throw new Error(`No active tab found in window ${windowId}`);
  }

  return tabId;
}

async function waitForTabLoad(
  chrome: ChromeClient,
  tabId: number,
  timeoutMs = 15000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = (await chrome.call('tabs.get', tabId)) as ChromeTab;
    if (tab.status === 'complete') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

async function cleanupWindow(chrome: ChromeClient, windowId: number): Promise<void> {
  try {
    await chrome.call('windows.remove', windowId);
  } catch {
    // Ignore cleanup failures (window may already be closed).
  }
}
