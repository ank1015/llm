import { describe, expect, it, vi } from 'vitest';

import { createExtractTool } from '../../../../src/tools/browser/extract.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createExtractTool', () => {
  it('requires a valid windowId at tool creation', () => {
    expect(() => {
      createExtractTool({ windowId: 0 });
    }).toThrow('createExtractTool requires a positive integer windowId');
  });

  it('extracts links and returns structured details', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 12,
              url: 'https://example.com',
              title: 'Example',
              windowId: 7001,
              active: true,
            },
          ];
        }
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

      if (method === 'debugger.evaluate') {
        const payload = args[0] as { tabId?: number; code?: string };
        expect(payload.tabId).toBe(12);
        expect(typeof payload.code).toBe('string');
        expect(payload.code).toContain('"type":"links"');
        expect(payload.code).toContain('"filter":"docs"');

        return {
          result: {
            success: true,
            kind: 'links',
            page: {
              url: 'https://example.com',
              title: 'Example',
            },
            totalCount: 3,
            returnedCount: 2,
            truncated: true,
            links: [
              { text: 'Docs', url: 'https://example.com/docs' },
              { text: 'API Docs', url: 'https://example.com/api/docs' },
            ],
            warnings: [],
          },
        };
      }

      if (method === 'tabs.get') {
        return {
          id: 12,
          url: 'https://example.com',
          title: 'Example',
          windowId: 7001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createExtractTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('extract-links', {
      what: {
        type: 'links',
        filter: 'docs',
        limit: 2,
      },
    });

    expect(result.details).toMatchObject({
      tab: {
        tabId: 12,
        url: 'https://example.com',
        title: 'Example',
      },
      windowId: 7001,
      kind: 'links',
      totalCount: 3,
      returnedCount: 2,
      truncated: true,
      links: [
        { text: 'Docs', url: 'https://example.com/docs' },
        { text: 'API Docs', url: 'https://example.com/api/docs' },
      ],
    });

    expect(result.content[0]?.content).toContain('Extract kind: links');
    expect(result.content[0]?.content).toContain('https://example.com/docs');
  });

  it('extracts main_text on explicit tab id', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.get') {
        const tabId = args[0] as number;
        if (tabId === 42) {
          return {
            id: 42,
            url: 'https://example.org/post',
            title: 'Post',
            windowId: 7001,
          };
        }

        return {
          id: 42,
          url: 'https://example.org/post',
          title: 'Post',
          windowId: 7001,
        };
      }

      if (method === 'tabs.update') {
        return {
          id: 42,
          url: 'https://example.org/post',
          title: 'Post',
          windowId: 7001,
          active: true,
        };
      }

      if (method === 'windows.update') {
        return { id: 7001, focused: true };
      }

      if (method === 'debugger.evaluate') {
        const payload = args[0] as { tabId?: number; code?: string };
        expect(payload.tabId).toBe(42);
        expect(typeof payload.code).toBe('string');
        expect(payload.code).toContain('"type":"main_text"');
        return {
          result: {
            success: true,
            kind: 'main_text',
            page: {
              url: 'https://example.org/post',
              title: 'Post',
            },
            totalCount: 1200,
            returnedCount: 900,
            truncated: false,
            text: 'Main article text.',
            warnings: [],
          },
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createExtractTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('extract-main-text', {
      tabId: 42,
      what: {
        type: 'main_text',
      },
    });

    expect(result.details).toMatchObject({
      kind: 'main_text',
      tab: {
        tabId: 42,
      },
      text: 'Main article text.',
      totalCount: 1200,
      returnedCount: 900,
      truncated: false,
    });
  });

  it('rejects tab ids from another window', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'tabs.get') {
        return {
          id: 99,
          url: 'https://wrong-window.test',
          title: 'Wrong',
          windowId: 9001,
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createExtractTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('extract-window', {
        tabId: 99,
        what: { type: 'selected_text' },
      })
    ).rejects.toThrow('Tab 99 does not belong to window 7001');
  });

  it('throws when extraction script reports failure', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 12,
              url: 'https://example.com',
              title: 'Example',
              windowId: 7001,
              active: true,
            },
          ];
        }
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

      if (method === 'debugger.evaluate') {
        return {
          result: {
            success: false,
            kind: 'container_html',
            page: {
              url: 'https://example.com',
              title: 'Example',
            },
            totalCount: 0,
            returnedCount: 0,
            truncated: false,
            warnings: [],
            message: 'No element found for selector: #missing',
          },
        };
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createExtractTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('extract-fail', {
        what: {
          type: 'container_html',
          selector: '#missing',
        },
      })
    ).rejects.toThrow('No element found for selector: #missing');
  });
});
