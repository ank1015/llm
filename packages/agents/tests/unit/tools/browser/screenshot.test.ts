import { describe, expect, it, vi } from 'vitest';

import { createScreenshotTool } from '../../../../src/tools/browser/screenshot.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createScreenshotTool', () => {
  it('captures the active tab by default and returns image content', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        return [
          { id: 12, url: 'https://example.com', title: 'Example', windowId: 7001, active: true },
        ];
      }

      if (method === 'tabs.update') {
        return {
          id: 12,
          url: 'https://example.com',
          title: 'Example',
          windowId: 7001,
          active: true,
        };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'tabs.captureVisibleTab') {
        return 'data:image/png;base64,ZmFrZQ==';
      }

      if (method === 'tabs.get') {
        return { id: 12, url: 'https://example.com', title: 'Example', windowId: 7001 };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createScreenshotTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('1', {});

    expect(result.details).toMatchObject({
      tab: {
        tabId: 12,
        url: 'https://example.com',
        title: 'Example',
      },
      windowId: 7001,
      mimeType: 'image/png',
      bytes: 4,
    });

    expect(result.content[1]).toMatchObject({
      type: 'image',
      data: 'ZmFrZQ==',
      mimeType: 'image/png',
    });
    expect(call).toHaveBeenCalledWith('tabs.captureVisibleTab', 7001, { format: 'png' });
  });

  it('captures provided tab id as jpeg', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.get') {
        return { id: 25, url: 'https://example.org', title: 'Org', windowId: 7001 };
      }

      if (method === 'tabs.update') {
        return { id: 25, url: 'https://example.org', title: 'Org', windowId: 7001, active: true };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'tabs.captureVisibleTab') {
        return 'data:image/jpeg;base64,ZmFrZWpwZWc=';
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createScreenshotTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('1', { tabId: 25, format: 'jpeg' });

    expect(result.details).toMatchObject({
      tab: {
        tabId: 25,
        url: 'https://example.org',
        title: 'Org',
      },
      windowId: 7001,
      mimeType: 'image/jpeg',
    });
    expect(call).toHaveBeenCalledWith('tabs.captureVisibleTab', 7001, {
      format: 'jpeg',
      quality: 90,
    });
  });

  it('rejects tab ids that belong to another window', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'tabs.get') {
        return { id: 99, url: 'https://wrong-window.test', title: 'Wrong', windowId: 9001 };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createScreenshotTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('1', {
        tabId: 99,
      })
    ).rejects.toThrow('Tab 99 does not belong to window 7001');
  });
});
