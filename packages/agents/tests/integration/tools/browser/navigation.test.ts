import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import {
  createNavigationTool,
  type NavigationToolDetails,
} from '../../../../src/tools/browser/navigation.js';

interface ChromeWindow {
  id?: number;
}

const runRealChromeIntegration = true;
const chromePort = process.env.CHROME_RPC_PORT
  ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
  : undefined;

describe.skipIf(!runRealChromeIntegration)('navigation tool real integration', () => {
  it('creates a real window, opens tabs, and returns scoped tab results', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const createdWindow = (await chrome.call('windows.create', {
        url: 'about:blank',
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const navigationTool = createNavigationTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const openPrimary = (await navigationTool.execute('open-primary', {
        action: 'open_url',
        url: 'https://example.com',
      })) as { details: NavigationToolDetails };

      expect(openPrimary.details.windowId).toBe(createdWindowId);
      expect(openPrimary.details.tab.tabId).toBeGreaterThan(0);
      expect(typeof openPrimary.details.tab.url).toBe('string');
      expect(typeof openPrimary.details.tab.title).toBe('string');

      const openSecondary = (await navigationTool.execute('open-secondary', {
        action: 'open_url_new_tab',
        url: 'https://example.org',
      })) as { details: NavigationToolDetails };

      expect(openSecondary.details.windowId).toBe(createdWindowId);
      expect(openSecondary.details.tab.tabId).toBeGreaterThan(0);
      expect(typeof openSecondary.details.tab.url).toBe('string');
      expect(typeof openSecondary.details.tab.title).toBe('string');

      const active = (await navigationTool.execute('get-active', {
        action: 'get_active_tab',
      })) as { details: NavigationToolDetails };

      expect(active.details.windowId).toBe(createdWindowId);
      expect(active.details.tab.tabId).toBe(openSecondary.details.tab.tabId);

      const listed = (await navigationTool.execute('list-tabs', {
        action: 'list_tabs',
      })) as { details: NavigationToolDetails };

      expect(listed.details.windowId).toBe(createdWindowId);
      expect(Array.isArray(listed.details.tabs)).toBe(true);
      expect(listed.details.tabs!.length).toBeGreaterThanOrEqual(2);

      const listedTabIds = listed.details.tabs!.map((tab) => tab.tabId);
      expect(listedTabIds).toContain(openPrimary.details.tab.tabId);
      expect(listedTabIds).toContain(openSecondary.details.tab.tabId);
    } finally {
      if (typeof createdWindowId === 'number') {
        await cleanupWindow(chrome, createdWindowId);
      }
    }
  });
});

async function cleanupWindow(chrome: ChromeClient, windowId: number): Promise<void> {
  try {
    await chrome.call('windows.remove', windowId);
  } catch {
    // Ignore cleanup failures (window may already be closed)
  }
}
