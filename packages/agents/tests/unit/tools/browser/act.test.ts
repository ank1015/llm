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
    let actionEvaluateCalls = 0;
    let sampleEvaluateCalls = 0;

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
        const code = typeof payload.code === 'string' ? payload.code : '';
        if (code.includes('readyState') && code.includes('nodeCount')) {
          sampleEvaluateCalls += 1;
          return {
            result: {
              readyState: 'complete',
              textLength: 220,
              nodeCount: 14,
            },
          };
        }
        expect(code).toContain('"type":"click"');
        actionEvaluateCalls += 1;
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
            outcome: {
              observed: true,
              signals: ['focus moved to target'],
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
    expect(actionEvaluateCalls).toBe(1);
    expect(sampleEvaluateCalls).toBeGreaterThan(0);
    expect(result.content[0]?.content).toContain('Action: click');
    expect(result.content[0]?.content).toContain('Result: Clicked target element');
  });

  it('fails click when no observable effect is detected', async () => {
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

      if (method === 'tabs.get') {
        return {
          id: 33,
          url: 'https://example.com/login',
          title: 'Login',
          windowId: 7001,
          status: 'complete',
        };
      }

      if (method === 'debugger.evaluate') {
        const payload = args[0] as { tabId?: number; code?: string };
        expect(payload.tabId).toBe(33);
        const code = typeof payload.code === 'string' ? payload.code : '';
        if (code.includes('readyState') && code.includes('nodeCount')) {
          return {
            result: {
              readyState: 'complete',
              textLength: 220,
              nodeCount: 14,
            },
          };
        }
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
            outcome: {
              observed: false,
              signals: [],
            },
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
      tool.execute('act-no-effect', {
        type: 'click',
        target: { id: 'submit' },
      })
    ).rejects.toThrow('[NO_OBSERVABLE_EFFECT]');
  });

  it('resolves inspect_page element ids before acting', async () => {
    let evaluateCalls = 0;
    let sampleCalls = 0;
    let postAction = false;

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
        evaluateCalls += 1;
        const code = typeof payload.code === 'string' ? payload.code : '';

        if (code.includes('const options =')) {
          return {
            result: {
              page: {
                url: 'https://example.com/login',
                title: 'Login',
                lang: 'en',
                capturedAt: '2026-02-27T12:00:00.000Z',
                viewport: { width: 1440, height: 900 },
                scroll: { x: 0, y: 0, maxY: 1200 },
              },
              summary: {
                interactiveCount: 1,
                totalInteractiveCount: 1,
                textBlockCount: 0,
                totalTextBlockCount: 0,
                formCount: 0,
                alertCount: 0,
                totalLinks: 0,
                totalButtons: 1,
                totalInputs: 0,
                mediaCount: 0,
                playingMediaCount: 0,
                pausedMediaCount: 0,
                bufferingMediaCount: 0,
                endedMediaCount: 0,
                mutedMediaCount: 0,
              },
              interactive: [
                {
                  id: 'E1',
                  tag: 'button',
                  role: '',
                  name: 'Sign in',
                  actions: ['click'],
                  state: [],
                  locator: { id: 'submit', cssPath: '#submit' },
                  bbox: { x: 100, y: 200, width: 100, height: 40 },
                },
              ],
              textBlocks: [],
              forms: [],
              media: [],
              alerts: [],
              truncation: {
                interactive: false,
                textBlocks: false,
                hiddenFilteredCount: 0,
                offscreenFilteredCount: 0,
                suppressedAlertCount: 0,
              },
              warnings: [],
            },
          };
        }
        if (code.includes('"type":"click"')) {
          expect(code).toContain('"selector":"#submit"');
          postAction = true;
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
              outcome: {
                observed: true,
                signals: ['target class changed'],
              },
              warnings: [],
            },
          };
        }

        if (code.includes('readyState') && code.includes('nodeCount')) {
          sampleCalls += 1;
          return {
            result: {
              readyState: 'complete',
              textLength: postAction ? 240 : 180,
              nodeCount: postAction ? 16 : 12,
            },
          };
        }

        throw new Error('Unexpected debugger.evaluate code payload');
      }

      if (method === 'tabs.get') {
        if (postAction) {
          return {
            id: 33,
            url: 'https://example.com/dashboard',
            title: 'Dashboard',
            windowId: 7001,
            status: 'complete',
          };
        }
        return {
          id: 33,
          url: 'https://example.com/login',
          title: 'Login',
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

    const result = await tool.execute('act-inspect-id', {
      type: 'click',
      target: 'E1',
    });

    expect(evaluateCalls).toBeGreaterThanOrEqual(3);
    expect(sampleCalls).toBeGreaterThan(0);
    expect(result.details).toMatchObject({
      action: 'click',
      target: 'E1',
      message: 'Clicked target element',
      element: {
        tag: 'button',
        name: 'Sign in',
      },
    });
  });

  it('uses inspect_page result from context before re-inspecting', async () => {
    let evaluateCalls = 0;
    let sampleCalls = 0;

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
        const code = typeof payload.code === 'string' ? payload.code : '';
        if (code.includes('readyState') && code.includes('nodeCount')) {
          sampleCalls += 1;
          return {
            result: {
              readyState: 'complete',
              textLength: 110,
              nodeCount: 9,
            },
          };
        }

        expect(code).toContain('"type":"click"');
        expect(code).toContain('"selector":"#submit"');
        expect(code).not.toContain('const options =');

        evaluateCalls += 1;
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
            outcome: {
              observed: true,
              signals: ['focus moved to target'],
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

    const result = await tool.execute(
      'act-context-id',
      {
        type: 'click',
        target: 'E1',
      },
      undefined,
      undefined,
      {
        messages: [
          {
            role: 'toolResult',
            id: 'inspect-msg-1',
            toolName: 'inspect_page',
            toolCallId: 'inspect-call-1',
            content: [{ type: 'text', content: '# Page Snapshot' }],
            details: {
              tab: {
                tabId: 33,
              },
              interactive: [
                {
                  id: 'E1',
                  tag: 'button',
                  role: '',
                  name: 'Sign in',
                  actions: ['click'],
                  state: [],
                  locator: {
                    id: 'submit',
                    cssPath: '#submit',
                  },
                  bbox: { x: 100, y: 200, width: 100, height: 40 },
                },
              ],
            },
            isError: false,
            timestamp: Date.now(),
          },
        ],
      } as never
    );

    expect(evaluateCalls).toBe(1);
    expect(sampleCalls).toBeGreaterThan(0);
    expect(result.details).toMatchObject({
      action: 'click',
      target: 'E1',
      message: 'Clicked target element',
      element: {
        tag: 'button',
        name: 'Sign in',
      },
    });
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

      if (method === 'tabs.get') {
        return {
          id: 33,
          url: 'https://example.com',
          title: 'Example',
          windowId: 7001,
          status: 'complete',
        };
      }

      if (method === 'debugger.evaluate') {
        const payload = args[0] as { code?: string };
        if (typeof payload.code === 'string' && payload.code.includes('readyState')) {
          return {
            result: {
              readyState: 'complete',
              textLength: 120,
              nodeCount: 10,
            },
          };
        }
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
    ).rejects.toThrow('[TARGET_NOT_FOUND]');
  });
});
