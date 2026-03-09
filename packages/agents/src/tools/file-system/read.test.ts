import { describe, expect, it, vi } from 'vitest';

import { createReadTool } from './read.js';

import type { ReadOperations } from './read.js';

describe('createReadTool', () => {
  it('mentions text files, images, and PDFs in the description', () => {
    const operations: ReadOperations = {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    };

    const tool = createReadTool('/workspace', { operations });

    expect(tool.description).toContain('Supports text files, images, and PDFs.');
  });

  it('returns PDFs as file attachments with base64 data', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf-8');
    const operations: ReadOperations = {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(pdfBuffer),
      detectImageMimeType: vi.fn().mockResolvedValue(null),
    };

    const tool = createReadTool('/workspace', {
      operations,
      autoResizeImages: false,
    });

    const result = await tool.execute('tool-call-1', { path: 'docs/spec.pdf' });

    expect(result).toEqual({
      content: [
        { type: 'text', content: 'Read PDF file [application/pdf]' },
        {
          type: 'file',
          data: pdfBuffer.toString('base64'),
          mimeType: 'application/pdf',
          filename: 'spec.pdf',
        },
      ],
      details: undefined,
    });
  });

  it('still returns text files as text content', async () => {
    const operations: ReadOperations = {
      access: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('line 1\nline 2', 'utf-8')),
      detectImageMimeType: vi.fn().mockResolvedValue(null),
    };

    const tool = createReadTool('/workspace', { operations });

    const result = await tool.execute('tool-call-1', { path: 'notes.txt' });

    expect(result).toEqual({
      content: [{ type: 'text', content: 'line 1\nline 2' }],
      details: undefined,
    });
  });
});
