/**
 * Splits markdown content into chunks by ## headings.
 * Each chunk contains the heading and its body text.
 */

import type { NoteChunk } from '../store/note.types.js';

/** Split markdown content into chunks by ## headings */
export function chunkByHeadings(slug: string, content: string): NoteChunk[] {
  void slug;
  void content;
  throw new Error('Not implemented');
}
