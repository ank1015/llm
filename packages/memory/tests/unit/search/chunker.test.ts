import { describe, it, expect } from 'vitest';

import { chunkByHeadings } from '../../../src/search/chunker.js';

describe('chunkByHeadings', () => {
  it('should split content by ## headings', () => {
    const content = `## Introduction

This is the intro.

## Key Concepts

These are the key concepts.

## Summary

Final thoughts.`;

    const chunks = chunkByHeadings('my-note', content);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({
      chunkId: 'my-note#introduction',
      slug: 'my-note',
      heading: 'Introduction',
      text: 'This is the intro.',
    });
    expect(chunks[1]).toEqual({
      chunkId: 'my-note#key-concepts',
      slug: 'my-note',
      heading: 'Key Concepts',
      text: 'These are the key concepts.',
    });
    expect(chunks[2]).toEqual({
      chunkId: 'my-note#summary',
      slug: 'my-note',
      heading: 'Summary',
      text: 'Final thoughts.',
    });
  });

  it('should handle content with no headings as a single chunk', () => {
    const content = 'Just some plain text without any headings.';

    const chunks = chunkByHeadings('plain', content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      chunkId: 'plain#content',
      slug: 'plain',
      heading: 'content',
      text: 'Just some plain text without any headings.',
    });
  });

  it('should handle text before the first heading', () => {
    const content = `Some preamble text.

## First Section

Section content.`;

    const chunks = chunkByHeadings('with-preamble', content);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.heading).toBe('content');
    expect(chunks[0]!.text).toBe('Some preamble text.');
    expect(chunks[1]!.heading).toBe('First Section');
    expect(chunks[1]!.text).toBe('Section content.');
  });

  it('should ignore ### and deeper headings (keep them in parent chunk)', () => {
    const content = `## Main Section

Intro text.

### Subsection

Subsection text.`;

    const chunks = chunkByHeadings('deep', content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe('Main Section');
    expect(chunks[0]!.text).toBe('Intro text.\n\n### Subsection\n\nSubsection text.');
  });

  it('should skip empty chunks', () => {
    const content = `## First

Content here.

## Empty

## Third

More content.`;

    const chunks = chunkByHeadings('with-empty', content);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.heading).toBe('First');
    expect(chunks[1]!.heading).toBe('Third');
  });
});
