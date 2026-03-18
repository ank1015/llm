import { describe, expect, it, vi } from 'vitest';

import { WebTab, _createWebBrowserForTesting } from '../../src/helpers/web/web.js';

import type { ManagedChromeBridge } from '../../src/helpers/web/transport.js';
import type { WebDebuggerEvent, WebDownloadInfo, WebTabInfo } from '../../src/helpers/web/web.js';

function createMockBridge(
  handler: (method: string, args: unknown[]) => Promise<unknown> | unknown
): ManagedChromeBridge {
  return {
    client: {
      call: vi.fn(async (method: string, ...args: unknown[]) => await handler(method, args)),
      getPageMarkdown: vi.fn(async (_tabId: number) => '# Mock Markdown'),
    },
    close: vi.fn(async () => {}),
  };
}

describe('web helper browser primitives', () => {
  it('opens tabs, lists tabs, and closes other tabs', async () => {
    const tabs: WebTabInfo[] = [
      { id: 1, title: 'Notion', url: 'https://www.notion.so/a', active: true },
      { id: 2, title: 'GitHub', url: 'https://github.com/', active: false },
      { id: 3, title: 'X', url: 'https://x.com/home', active: false },
    ];
    const removedCalls: unknown[][] = [];

    const bridge = createMockBridge(async (method, args) => {
      if (method === 'tabs.create') {
        return { id: 99, title: 'Opened', url: 'https://example.com' };
      }

      if (method === 'tabs.query') {
        return tabs;
      }

      if (method === 'tabs.remove') {
        removedCalls.push(args);
        return undefined;
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    const browser = _createWebBrowserForTesting(bridge);

    const opened = await browser.openTab('https://example.com');
    expect(opened.id).toBe(99);

    const listed = await browser.listTabs();
    expect(listed.map((tab) => tab.id)).toEqual([1, 2, 3]);

    await browser.closeOtherTabs([listed[0]!]);

    expect(removedCalls).toEqual([[[2, 3]]]);
  });

  it('waits for tab load and evaluates page code', async () => {
    let getCalls = 0;

    const bridge = createMockBridge(async (method, args) => {
      if (method === 'tabs.get') {
        getCalls += 1;
        return {
          id: args[0],
          status: getCalls >= 2 ? 'complete' : 'loading',
          title: 'Demo',
          url: 'https://example.com',
        };
      }

      if (method === 'debugger.evaluate') {
        return { result: { ok: true, title: 'Demo' } };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    const browser = _createWebBrowserForTesting(bridge);
    const tab = new WebTab(browser, 10, { id: 10, status: 'loading' });

    const info = await tab.waitForLoad({ timeoutMs: 1_000 });
    expect(info.status).toBe('complete');

    const result = await tab.evaluate<{ ok: boolean; title: string }>('document.title');
    expect(result).toEqual({ ok: true, title: 'Demo' });
  });

  it('captures network activity and summarizes requests', async () => {
    const events: WebDebuggerEvent[] = [
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '1',
          type: 'Document',
          request: { url: 'https://github.com/', method: 'GET' },
        },
      },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: '1',
          type: 'Document',
          response: {
            url: 'https://github.com/',
            status: 200,
            mimeType: 'text/html',
            protocol: 'h2',
          },
        },
      },
      {
        method: 'Network.requestWillBeSent',
        params: {
          requestId: '2',
          type: 'Fetch',
          request: { url: 'https://github.com/conduit/for_you_feed', method: 'GET' },
        },
      },
      {
        method: 'Network.responseReceived',
        params: {
          requestId: '2',
          type: 'Fetch',
          response: {
            url: 'https://github.com/conduit/for_you_feed',
            status: 200,
            mimeType: 'text/html',
            protocol: 'h2',
          },
        },
      },
    ];

    const bridge = createMockBridge(async (method, args) => {
      if (method === 'debugger.attach') {
        return { attached: true };
      }

      if (method === 'debugger.sendCommand') {
        return {};
      }

      if (method === 'debugger.getEvents') {
        const payload = args[0] as { clear?: boolean };
        return payload.clear ? [] : events;
      }

      if (method === 'debugger.detach') {
        return { detached: true };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    const browser = _createWebBrowserForTesting(bridge);
    const tab = new WebTab(browser, 1, { id: 1 });

    const capture = await tab.captureNetwork(async () => 'done', {
      includeRawEvents: true,
      settleMs: 0,
    });

    expect(capture.result).toBe('done');
    expect(capture.requests).toHaveLength(2);
    expect(capture.summary.totalRequests).toBe(2);
    expect(capture.summary.mainDocument?.url).toBe('https://github.com/');
  });

  it('lists downloads and waits for a completed download', async () => {
    let attempts = 0;
    const downloads: WebDownloadInfo[] = [
      {
        id: 1,
        url: 'https://example.com/report.csv',
        filename: '/tmp/report.csv',
        state: 'complete',
        mime: 'text/csv',
      },
    ];

    const bridge = createMockBridge(async (method) => {
      if (method === 'downloads.search') {
        attempts += 1;
        return attempts >= 2 ? downloads : [];
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    const browser = _createWebBrowserForTesting(bridge);

    const match = await browser.waitForDownload(
      { filenameIncludes: 'report.csv' },
      { timeoutMs: 1_000, pollIntervalMs: 10 }
    );

    expect(match.filename).toContain('report.csv');
  });
});
