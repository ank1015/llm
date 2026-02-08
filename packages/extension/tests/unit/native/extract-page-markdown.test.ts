import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createExtractPageMarkdownTool } from '../../../src/native/tools/extract-page-markdown.tool.js';

describe('extract_page_markdown tool', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should call getPageHtml with the configured tabId', async () => {
    const getPageHtml = vi.fn().mockResolvedValue('<p>hello</p>');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ markdown: 'hello', success: true }),
    });

    const tool = createExtractPageMarkdownTool(42, getPageHtml);
    await tool.execute('call-1', {});

    expect(getPageHtml).toHaveBeenCalledWith(42);
  });

  it('should POST html to the converter service and return markdown', async () => {
    const html = '<h1>Title</h1><p>Body text</p>';
    const expectedMarkdown = '# Title\n\nBody text';
    const getPageHtml = vi.fn().mockResolvedValue(html);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ markdown: expectedMarkdown, success: true }),
    });

    const tool = createExtractPageMarkdownTool(1, getPageHtml);
    const result = await tool.execute('call-1', {});

    // Verify fetch was called with correct body
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/convert',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ html }),
      })
    );

    // Verify result
    expect(result.content).toEqual([{ type: 'text', content: expectedMarkdown }]);
    expect(result.details).toEqual({
      tabId: 1,
      htmlLength: html.length,
      markdownLength: expectedMarkdown.length,
    });
  });

  it('should throw when converter service returns an error', async () => {
    const getPageHtml = vi.fn().mockResolvedValue('<p>test</p>');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'HTML field is required', success: false }),
    });

    const tool = createExtractPageMarkdownTool(1, getPageHtml);

    await expect(tool.execute('call-1', {})).rejects.toThrow(/HTML-to-markdown conversion failed/);
  });

  it('should propagate getPageHtml errors', async () => {
    const getPageHtml = vi.fn().mockRejectedValue(new Error('tab not found'));

    const tool = createExtractPageMarkdownTool(999, getPageHtml);

    await expect(tool.execute('call-1', {})).rejects.toThrow('tab not found');
  });

  it('should have correct tool metadata', () => {
    const tool = createExtractPageMarkdownTool(1, vi.fn());

    expect(tool.name).toBe('extract_page_markdown');
    expect(tool.label).toBe('Extract Page Markdown');
    expect(tool.description).toContain('browser page');
  });
});
