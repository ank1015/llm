import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import {
  createInspectTool,
  type InspectToolDetails,
} from '../../../../src/tools/browser/inspect.js';

interface ChromeWindow {
  id?: number;
}

interface ChromeTab {
  id?: number;
  status?: string;
}

const runRealChromeIntegration = true;
const chromePort = process.env.CHROME_RPC_PORT
  ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
  : undefined;

const INSPECT_ALERT_MEDIA_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Inspect Alerts And Media</title></head>
  <body>
    <main>
      <h1>Compose</h1>
      <form id="visible-form" aria-label="Visible Form">
        <label for="visible-field">Visible Field</label>
        <input id="visible-field" name="visible-field" required aria-invalid="true" />
      </form>
      <form id="hidden-form" style="display:none" aria-label="Hidden Form">
        <label for="hidden-field">Hidden Field</label>
        <input id="hidden-field" name="hidden-field" required aria-invalid="true" />
      </form>
      <video id="preview-video" controls></video>
    </main>
  </body>
</html>
`.trim();

describe.skipIf(!runRealChromeIntegration)('inspect tool real integration', () => {
  it('captures readable markdown and structured page snapshot for a real tab', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const createdWindow = (await chrome.call('windows.create', {
        url: 'https://example.com',
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const inspectTool = createInspectTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const activeTabId = await getActiveTabId(chrome, createdWindowId!);
      await waitForTabLoad(chrome, activeTabId);

      const result = (await inspectTool.execute('inspect-primary', {
        maxInteractive: 80,
        maxTextBlocks: 30,
      })) as {
        details: InspectToolDetails;
        content: Array<{ type: string; content?: string }>;
      };

      expect(result.details.windowId).toBe(createdWindowId);
      expect(result.details.tab.tabId).toBe(activeTabId);
      expect(result.details.page.url).toContain('example.com');
      expect(typeof result.details.page.title).toBe('string');
      expect(result.details.summary.interactiveCount).toBeGreaterThanOrEqual(1);
      expect(result.details.summary.textBlockCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(result.details.interactive)).toBe(true);
      expect(Array.isArray(result.details.textBlocks)).toBe(true);
      expect(Array.isArray(result.details.forms)).toBe(true);
      expect(Array.isArray(result.details.media)).toBe(true);
      expect(Array.isArray(result.details.alerts)).toBe(true);

      const markdown = result.content.find((block) => block.type === 'text')?.content;
      expect(typeof markdown).toBe('string');
      expect(markdown).toContain('# Page Snapshot');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Interactive Elements');
      expect(markdown).toContain('## Media');
      expect(markdown).toContain('## Key Text');
      expect(markdown).toContain('## Notes');
    } finally {
      if (typeof createdWindowId === 'number') {
        await cleanupWindow(chrome, createdWindowId);
      }
    }
  });

  it('reports media state and suppresses hidden/background validation alerts', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const dataUrl = `data:text/html,${encodeURIComponent(INSPECT_ALERT_MEDIA_HTML)}`;
      const createdWindow = (await chrome.call('windows.create', {
        url: dataUrl,
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const inspectTool = createInspectTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const activeTabId = await getActiveTabId(chrome, createdWindowId!);
      await waitForTabLoad(chrome, activeTabId);

      const result = (await inspectTool.execute('inspect-alerts-media', {})) as {
        details: InspectToolDetails;
        content: Array<{ type: string; content?: string }>;
      };

      expect(result.details.summary.mediaCount).toBe(1);
      expect(result.details.summary.pausedMediaCount).toBeGreaterThanOrEqual(1);
      expect(result.details.media.length).toBe(1);
      expect(result.details.media[0]?.kind).toBe('video');
      expect(result.details.alerts.join(' ')).not.toContain('Hidden Field');
      expect(result.details.truncation.suppressedAlertCount).toBeGreaterThanOrEqual(1);

      const markdown = result.content.find((block) => block.type === 'text')?.content;
      expect(typeof markdown).toBe('string');
      expect(markdown).toContain('## Media');
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
  timeoutMs = 20000
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
    // Ignore cleanup failures (window may already be closed)
  }
}
