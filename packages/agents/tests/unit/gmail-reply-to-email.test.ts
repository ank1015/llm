import { describe, expect, it } from 'vitest';

import {
  normalizeReplyAttachmentPaths,
  previewReplyBody,
} from '../../src/helpers/web/scripts/gmail/reply-to-email.js';

describe('gmail reply-to-email helpers', () => {
  it('normalizes attachment paths from strings and arrays', () => {
    expect(normalizeReplyAttachmentPaths(' ./note.txt ')).toEqual(['./note.txt']);
    expect(normalizeReplyAttachmentPaths([' ./a.txt ', '', 'b.txt '])).toEqual([
      './a.txt',
      'b.txt',
    ]);
  });

  it('returns an empty list when attachment paths are omitted', () => {
    expect(normalizeReplyAttachmentPaths(undefined)).toEqual([]);
  });

  it('builds a compact reply body preview', () => {
    expect(previewReplyBody('Hello there\n\nThis is a reply.')).toBe(
      'Hello there This is a reply.'
    );
  });

  it('truncates long reply previews', () => {
    expect(previewReplyBody('a'.repeat(300), 10)).toBe('aaaaaaaaa…');
  });
});
