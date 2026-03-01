import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import {
  createWindowReplTool,
  type WindowReplToolDetails,
} from '../../../../src/tools/browser/repl.js';

interface ChromeWindow {
  id?: number;
}

const runRealChromeIntegration = true;
const chromePort = process.env.CHROME_RPC_PORT
  ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
  : undefined;

describe.skipIf(!runRealChromeIntegration)('repl tool real integration', () => {
  it('executes TypeScript against a scoped window', async () => {
    const chrome = await connect({ launch: true });

    let createdWindowId: number | undefined;

    try {
      const createdWindow = (await chrome.call('windows.create', {
        url: 'about:blank',
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const tool = createWindowReplTool({
        windowId: createdWindowId!,
      });

      const tabsResult = (await tool.execute('window-repl-tabs', {
        code: `
const tabs = await window.tabs();
return tabs.map((tab) => ({ id: tab.id, windowId: tab.windowId, url: tab.url ?? '' }));
`.trim(),
      })) as { details: WindowReplToolDetails };

      expect(tabsResult.details.windowId).toBe(createdWindowId);
      expect(tabsResult.details.mode).toBe('block');
      expect(tabsResult.details.resultType).toBe('array');
      expect(Array.isArray(tabsResult.details.result)).toBe(true);
      expect((tabsResult.details.result as unknown[]).length).toBeGreaterThan(0);

      const typeResult = (await tool.execute('window-repl-window-class', {
        code: 'typeof Window',
      })) as { details: WindowReplToolDetails };

      expect(typeResult.details.mode).toBe('expression');
      expect(typeResult.details.result).toBe('function');
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
