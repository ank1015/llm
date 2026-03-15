import { describe, expect, it, vi, afterEach } from 'vitest';

import { getPageMarkdownForTab } from '../../../src/sdk/page-markdown.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createChromeCaller() {
  return {
    call: vi.fn(async (method: string, arg?: unknown) => {
      if (method === 'tabs.get') {
        return { status: 'complete' };
      }

      if (method === 'debugger.evaluate') {
        expect(arg).toMatchObject({
          tabId: 123,
          awaitPromise: false,
          userGesture: false,
        });

        return {
          result: '<!DOCTYPE html>\n<html><body><h1>Alpha</h1><p>Beta</p></body></html>',
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
  };
}

describe('getPageMarkdownForTab', () => {
  it('should parse markdown from a json object payload', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ markdown: '# Alpha\n\nBeta' }),
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).resolves.toBe('# Alpha\n\nBeta');
  });

  it('should parse markdown from a raw json string payload', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify('# Alpha\n\nBeta'),
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).resolves.toBe('# Alpha\n\nBeta');
  });

  it('should parse markdown from a content field', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ content: '# Alpha\n\nBeta' }),
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).resolves.toBe('# Alpha\n\nBeta');
  });

  it('should parse markdown from a result field', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ result: '# Alpha\n\nBeta' }),
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).resolves.toBe('# Alpha\n\nBeta');
  });

  it('should return plain text markdown responses as-is', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '# Alpha\n\nBeta',
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).resolves.toBe('# Alpha\n\nBeta');
  });

  it('should throw when the converter returns a non-ok response', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
    );

    await expect(getPageMarkdownForTab(chrome, 123)).rejects.toThrow(
      'Markdown converter request failed with 503 Service Unavailable'
    );
  });

  it('should throw when the converter is unavailable', async () => {
    const chrome = createChromeCaller();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    await expect(getPageMarkdownForTab(chrome, 123)).rejects.toThrow(
      'Failed to reach markdown converter at http://localhost:8080/convert: connect ECONNREFUSED'
    );
  });
});
