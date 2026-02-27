import { describe, expect, it, vi } from 'vitest';

import { createInspectTool } from '../../../../src/tools/browser/inspect.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createInspectTool', () => {
  it('requires a valid windowId at tool creation', () => {
    expect(() => {
      createInspectTool({ windowId: 0 });
    }).toThrow('createInspectTool requires a positive integer windowId');
  });

  it('returns markdown and structured page snapshot', async () => {
    const snapshot = {
      page: {
        url: 'https://example.com/login',
        title: 'Login',
        lang: 'en',
        capturedAt: '2026-02-27T12:00:00.000Z',
        viewport: { width: 1440, height: 900 },
        scroll: { x: 0, y: 0, maxY: 1200 },
      },
      summary: {
        interactiveCount: 2,
        totalInteractiveCount: 2,
        textBlockCount: 2,
        totalTextBlockCount: 2,
        formCount: 1,
        alertCount: 1,
        totalLinks: 1,
        totalButtons: 1,
        totalInputs: 2,
      },
      interactive: [
        {
          id: 'E1',
          tag: 'input',
          role: '',
          name: 'Email',
          actions: ['type'],
          state: ['required'],
          locator: { id: 'email', cssPath: '#email' },
          bbox: { x: 100, y: 200, width: 280, height: 40 },
        },
        {
          id: 'E2',
          tag: 'button',
          role: '',
          name: 'Sign in',
          actions: ['click'],
          state: [],
          locator: { testId: 'sign-in-submit', cssPath: 'form > button' },
          bbox: { x: 100, y: 260, width: 120, height: 40 },
        },
      ],
      textBlocks: [
        { id: 'T1', kind: 'heading', text: 'Welcome back', source: 'h1', level: 1 },
        { id: 'T2', kind: 'text', text: 'Use your work email to sign in.', source: 'main p' },
      ],
      forms: [
        {
          id: 'F1',
          name: 'Login form',
          fields: ['Email', 'Password'],
          submitButtons: ['Sign in'],
        },
      ],
      alerts: ['Invalid password'],
      truncation: {
        interactive: false,
        textBlocks: false,
        hiddenFilteredCount: 3,
        offscreenFilteredCount: 0,
      },
      warnings: ['Iframe contents are not expanded in this snapshot.'],
    };

    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 12,
              url: 'https://example.com/login',
              title: 'Login',
              windowId: 7001,
              active: true,
            },
          ];
        }
        if (query.windowId === 7001) {
          return [
            {
              id: 12,
              url: 'https://example.com/login',
              title: 'Login',
              windowId: 7001,
            },
          ];
        }
      }

      if (method === 'tabs.update') {
        return {
          id: 12,
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
        expect(payload.tabId).toBe(12);
        expect(typeof payload.code).toBe('string');
        expect(payload.code).toContain('const options =');
        return { result: snapshot, type: 'object' };
      }

      if (method === 'tabs.get') {
        return {
          id: 12,
          url: 'https://example.com/login',
          title: 'Login',
          windowId: 7001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createInspectTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('inspect-1', {});

    expect(result.details).toMatchObject({
      tab: {
        tabId: 12,
        url: 'https://example.com/login',
        title: 'Login',
      },
      windowId: 7001,
      summary: {
        interactiveCount: 2,
        textBlockCount: 2,
      },
      forms: [
        {
          id: 'F1',
          name: 'Login form',
        },
      ],
      warnings: ['Iframe contents are not expanded in this snapshot.'],
    });

    expect(result.content[0]).toMatchObject({
      type: 'text',
    });
    expect(result.content[0]?.content).toContain('# Page Snapshot');
    expect(result.content[0]?.content).toContain('## Interactive Elements');
    expect(result.content[0]?.content).toContain('**E1**');
    expect(result.content[0]?.content).toContain('## Forms');

    expect(call).toHaveBeenCalledWith('debugger.evaluate', expect.any(Object));
  });

  it('rejects tab ids from another window', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.get') {
        const requestedTabId = args[0] as number;
        return {
          id: requestedTabId,
          url: 'https://other-window.test',
          title: 'Other',
          windowId: 9001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createInspectTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('inspect-2', {
        tabId: 99,
      })
    ).rejects.toThrow('Tab 99 does not belong to window 7001');
  });

  it('throws when debugger payload is invalid', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 12,
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
          id: 12,
          windowId: 7001,
        };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'debugger.evaluate') {
        return { result: null };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createInspectTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(tool.execute('inspect-3', {})).rejects.toThrow(
      'Page inspection returned an invalid payload'
    );
  });
});
