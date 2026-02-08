/**
 * Splits markdown content into chunks by ## headings.
 * Each chunk contains the heading and its body text.
 */

import type { NoteChunk } from '../store/note.types.js';

/** Split markdown content into chunks by ## headings */
export function chunkByHeadings(slug: string, content: string): NoteChunk[] {
  const lines = content.split('\n');
  const chunks: NoteChunk[] = [];

  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = /^## (.+)$/.exec(line);
    if (match) {
      // Flush previous chunk
      flushChunk(slug, currentHeading, currentLines, chunks);
      currentHeading = match[1]!;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last chunk
  flushChunk(slug, currentHeading, currentLines, chunks);

  return chunks;
}

function flushChunk(
  slug: string,
  heading: string | null,
  lines: string[],
  chunks: NoteChunk[]
): void {
  const text = lines.join('\n').trim();
  if (!text) return;

  const label = heading ?? 'content';
  const headingSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  chunks.push({
    chunkId: `${slug}#${headingSlug}`,
    slug,
    heading: label,
    text,
  });
}
