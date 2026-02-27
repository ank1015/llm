import { describe, expect, it, vi } from 'vitest';

import { createActTool } from '../../../../src/tools/browser/act.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createActTool', () => {
  it('requires a valid windowId at tool creation', () => {
    expect(() => {
      createActTool({ windowId: 0 });
    }).toThrow('createActTool requires a positive integer windowId');
  });

  it('executes click action and returns action summary', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 33,
              url: 'https://example.com/login',
              title: 'Login',
              windowId: 7001,
              active: true,
            },
          ];
        }
      }

      if (method === 'tabs.update') {
        return {
          id: 33,
          url: 'https://example.com/login',
          title: 'Login',
          windowId: 7001,
          active: true,
        };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'debugger.evaluate') {
        const payload = args[0] as { tabId?: number; code?: string };
        expect(payload.tabId).toBe(33);
        expect(typeof payload.code).toBe('string');
        expect(payload.code).toContain('"type":"click"');
        return {
          result: {
            success: true,
            action: 'click',
            message: 'Clicked target element',
            url: 'https://example.com/login',
            title: 'Login',
            element: {
              tag: 'button',
              role: '',
              name: 'Sign in',
              selectorUsed: '#submit',
              bbox: { x: 100, y: 200, width: 100, height: 40 },
            },
            warnings: [],
          },
        };
      }

      if (method === 'tabs.get') {
        return {
          id: 33,
          url: 'https://example.com/dashboard',
          title: 'Dashboard',
          windowId: 7001,
          status: 'complete',
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createActTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('act-1', {
      type: 'click',
      target: { id: 'submit' },
    });

    expect(result.details).toMatchObject({
      action: 'click',
      tab: {
        tabId: 33,
        url: 'https://example.com/dashboard',
        title: 'Dashboard',
      },
      message: 'Clicked target element',
      element: {
        tag: 'button',
        name: 'Sign in',
      },
    });
    expect(result.content[0]?.content).toContain('Action: click');
    expect(result.content[0]?.content).toContain('Result: Clicked target element');
  });

  it('rejects target tab from another window', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.get') {
        const tabId = args[0] as number;
        return {
          id: tabId,
          url: 'https://other-window.test',
          title: 'Other',
          windowId: 9001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createActTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('act-2', {
        tabId: 99,
        type: 'click',
        target: { id: 'submit' },
      })
    ).rejects.toThrow('Tab 99 does not belong to window 7001');
  });

  it('validates action-specific required params', async () => {
    const tool = createActTool({
      windowId: 7001,
      operations: {
        getClient: async () =>
          createMockClient(async () => {
            throw new Error('should not be called');
          }),
      },
    });

    await expect(
      tool.execute('act-3', {
        type: 'type',
        target: { id: 'email' },
      })
    ).rejects.toThrow('Action "type" requires a string value');

    await expect(
      tool.execute('act-4', {
        type: 'select',
        target: { id: 'plan' },
        value: 42,
      })
    ).rejects.toThrow('Action "select" requires value to be a string');
  });

  it('throws when script reports action failure', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 33,
              url: 'https://example.com',
              title: 'Example',
              windowId: 7001,
              active: true,
            },
          ];
        }
      }

      if (method === 'tabs.update') {
        return { id: 33, windowId: 7001 };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'debugger.evaluate') {
        return {
          result: {
            success: false,
            action: 'click',
            message: 'Target element not found',
            url: 'https://example.com',
            title: 'Example',
            warnings: [],
          },
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createActTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('act-5', {
        type: 'click',
        target: { id: 'missing' },
      })
    ).rejects.toThrow('Target element not found');
  });
});
