import { describe, expect, it, vi } from 'vitest';

import { createNavigationTool } from '../../../../src/tools/browser/navigation.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createNavigationTool', () => {
  it('requires a valid windowId at tool creation', () => {
    expect(() => {
      createNavigationTool({ windowId: 0 });
    }).toThrow('createNavigationTool requires a positive integer windowId');
  });

  it('uses scoped windowId for navigation actions', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.create') {
        const payload = args[0] as { url?: string; windowId?: number };
        return {
          id: 11,
          url: payload.url,
          title: 'Example Domain',
          windowId: payload.windowId,
          active: true,
        };
      }

      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 11,
              url: 'https://example.com',
              title: 'Example Domain',
              windowId: 7001,
              active: true,
            },
          ];
        }
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createNavigationTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const first = await tool.execute('1', {
      action: 'open_url_new_tab',
      url: 'https://example.com',
    });
    const second = await tool.execute('2', {
      action: 'get_active_tab',
    });

    expect(first.details).toMatchObject({
      action: 'open_url_new_tab',
      tab: {
        tabId: 11,
        url: 'https://example.com',
        title: 'Example Domain',
      },
      windowId: 7001,
    });

    expect(second.details).toMatchObject({
      action: 'get_active_tab',
      tab: {
        tabId: 11,
        url: 'https://example.com',
        title: 'Example Domain',
      },
      windowId: 7001,
    });

    expect(call).toHaveBeenCalledWith('tabs.create', {
      url: 'https://example.com',
      active: true,
      windowId: 7001,
    });
    expect(call).toHaveBeenCalledWith('tabs.query', {
      active: true,
      windowId: 7001,
    });
  });

  it('lists tabs in the scoped window and returns active tab as primary', async () => {
    const tabs = [
      { id: 101, url: 'https://one.test', title: 'One', active: false, windowId: 7001 },
      { id: 102, url: 'https://two.test', title: 'Two', active: true, windowId: 7001 },
      { id: 103, url: 'https://three.test', title: 'Three', active: false, windowId: 7001 },
    ];

    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { windowId?: number };
        if (query.windowId !== 7001) {
          throw new Error('Expected list_tabs to query scoped windowId');
        }
        return tabs;
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createNavigationTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('1', {
      action: 'list_tabs',
    });

    expect(result.details).toMatchObject({
      action: 'list_tabs',
      tab: {
        tabId: 102,
        url: 'https://two.test',
        title: 'Two',
      },
      tabs: [
        { tabId: 101, url: 'https://one.test', title: 'One' },
        { tabId: 102, url: 'https://two.test', title: 'Two' },
        { tabId: 103, url: 'https://three.test', title: 'Three' },
      ],
      windowId: 7001,
    });
  });

  it('rejects operations on tabs from another window', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.get') {
        const tabId = args[0] as number;
        return {
          id: tabId,
          url: 'https://other-window.test',
          title: 'Other Window Tab',
          windowId: 9001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createNavigationTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('1', {
        action: 'close_tab',
        tabId: 9,
      })
    ).rejects.toThrow('Tab 9 does not belong to window 7001');
  });
});
