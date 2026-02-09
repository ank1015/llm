import { describe, it, expect, vi } from 'vitest';

import { createHighlightTextTool } from '../../../src/native/tools/highlight-text.tool.js';

describe('highlight_text tool', () => {
  it('should call highlightText with the configured tabId and text param', async () => {
    const highlightText = vi.fn().mockResolvedValue('found text');

    const tool = createHighlightTextTool(42, highlightText);
    await tool.execute('call-1', { text: 'found text' });

    expect(highlightText).toHaveBeenCalledWith(42, 'found text');
  });

  it('should return success content with the highlighted text', async () => {
    const highlightText = vi.fn().mockResolvedValue('hello world');

    const tool = createHighlightTextTool(1, highlightText);
    const result = await tool.execute('call-1', { text: 'hello world' });

    expect(result.content).toEqual([
      { type: 'text', content: 'Successfully highlighted text: "hello world"' },
    ]);
    expect(result.details).toEqual({ tabId: 1, text: 'hello world' });
  });

  it('should propagate highlightText errors', async () => {
    const highlightText = vi.fn().mockRejectedValue(new Error('Text not found on page: "missing"'));

    const tool = createHighlightTextTool(999, highlightText);

    await expect(tool.execute('call-1', { text: 'missing' })).rejects.toThrow('Text not found');
  });

  it('should have correct tool metadata', () => {
    const tool = createHighlightTextTool(1, vi.fn());

    expect(tool.name).toBe('highlight_text');
    expect(tool.label).toBe('Highlight Text');
    expect(tool.description).toContain('highlight');
    expect(tool.description).toContain('browser page');
  });
});
