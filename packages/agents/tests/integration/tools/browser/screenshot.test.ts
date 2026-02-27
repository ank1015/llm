import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import {
  createScreenshotTool,
  type ScreenshotToolDetails,
} from '../../../../src/tools/browser/screenshot.js';

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

describe.skipIf(!runRealChromeIntegration)('screenshot tool real integration', () => {
  it('captures screenshots for active and explicit tabs in a real window', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const createdWindow = (await chrome.call('windows.create', {
        url: 'https://example.com',
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const screenshotTool = createScreenshotTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const initialActiveTabId = await getActiveTabId(chrome, createdWindowId!);
      await waitForTabLoad(chrome, initialActiveTabId);

      const primaryShot = (await screenshotTool.execute('shot-primary', {})) as {
        details: ScreenshotToolDetails;
        content: Array<{ type: string; data?: string; mimeType?: string }>;
      };

      expect(primaryShot.details.windowId).toBe(createdWindowId);
      expect(primaryShot.details.tab.tabId).toBe(initialActiveTabId);
      expect(primaryShot.details.mimeType).toMatch(/^image\//u);
      expect(primaryShot.details.bytes).toBeGreaterThan(100);

      const primaryImage = primaryShot.content.find((block) => block.type === 'image');
      expect(primaryImage).toBeDefined();
      expect(primaryImage?.data?.length ?? 0).toBeGreaterThan(100);

      const secondTab = (await chrome.call('tabs.create', {
        windowId: createdWindowId,
        url: 'https://example.org',
        active: true,
      })) as ChromeTab;

      expect(typeof secondTab.id).toBe('number');
      await waitForTabLoad(chrome, secondTab.id!);

      const secondShot = (await screenshotTool.execute('shot-secondary', {
        tabId: secondTab.id,
        format: 'jpeg',
      })) as {
        details: ScreenshotToolDetails;
      };

      expect(secondShot.details.windowId).toBe(createdWindowId);
      expect(secondShot.details.tab.tabId).toBe(secondTab.id);
      expect(secondShot.details.mimeType).toBe('image/jpeg');
      expect(secondShot.details.bytes).toBeGreaterThan(100);
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
