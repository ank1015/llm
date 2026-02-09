/**
 * Integration test — hits the real HTML-to-markdown converter at localhost:8080.
 * Skips automatically if the service is not running.
 */
import { describe, it, expect } from 'vitest';

import { createExtractPageMarkdownTool } from '../../src/native/tools/extract-page-markdown.tool.js';

let serviceAvailable = false;
try {
  const res = await fetch('http://localhost:8080/health');
  serviceAvailable = res.ok;
} catch {
  serviceAvailable = false;
}

describe.skipIf(!serviceAvailable)('extract_page_markdown (integration)', () => {
  it('should convert a simple HTML page to markdown', async () => {
    const html = `
      <html><body>
        <h1>Hello World</h1>
        <p>This is a <strong>test</strong> paragraph.</p>
        <ul>
          <li>Item one</li>
          <li>Item two</li>
        </ul>
      </body></html>
    `;
    const getPageHtml = async () => html;
    const tool = createExtractPageMarkdownTool(1, 'https://test.com/page', getPageHtml);

    const result = await tool.execute('call-1', {});
    const content = (result.content[0] as { type: 'text'; content: string }).content;

    expect(content).toContain('Source: https://test.com/page');
    expect(content).toContain('Hello World');
    expect(content).toContain('test');
    expect(content).toContain('Item one');
    expect(content).toContain('Item two');
  });

  it('should handle a page with links and images', async () => {
    const html = `
      <html><body>
        <h2>Links and Images</h2>
        <a href="https://example.com">Example</a>
        <img src="photo.jpg" alt="A photo" />
      </body></html>
    `;
    const getPageHtml = async () => html;
    const tool = createExtractPageMarkdownTool(5, 'https://test.com/links', getPageHtml);

    const result = await tool.execute('call-2', {});
    const markdown = (result.content[0] as { type: 'text'; content: string }).content;

    expect(markdown).toContain('example.com');
    expect(markdown).toContain('photo');
  });

  it('should return details with lengths', async () => {
    const html = '<p>Short</p>';
    const getPageHtml = async () => html;
    const tool = createExtractPageMarkdownTool(10, 'https://test.com/short', getPageHtml);

    const result = await tool.execute('call-3', {});
    const details = result.details as {
      tabId: number;
      tabUrl: string;
      htmlLength: number;
      markdownLength: number;
    };

    expect(details.tabId).toBe(10);
    expect(details.htmlLength).toBe(html.length);
    expect(details.markdownLength).toBeGreaterThan(0);
  });
});
