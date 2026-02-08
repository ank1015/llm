import { describe, it, expect } from 'vitest';

import { parseNote, serializeNote, slugify } from '../../../src/store/markdown.js';

describe('parseNote', () => {
  it('should parse frontmatter and content from markdown', () => {
    const raw = `---
title: Understanding Transformers
tags:
  - ml
  - transformers
source: https://example.com/transformers
date: "2026-02-08"
---

## Key Concepts

Attention is all you need.`;

    const note = parseNote('understanding-transformers', raw);

    expect(note.slug).toBe('understanding-transformers');
    expect(note.frontmatter.title).toBe('Understanding Transformers');
    expect(note.frontmatter.tags).toEqual(['ml', 'transformers']);
    expect(note.frontmatter.source).toBe('https://example.com/transformers');
    expect(note.frontmatter.date).toBe('2026-02-08');
    expect(note.content).toBe('## Key Concepts\n\nAttention is all you need.');
  });

  it('should handle missing optional source field', () => {
    const raw = `---
title: Quick Note
tags:
  - misc
date: "2026-02-08"
---

Some content.`;

    const note = parseNote('quick-note', raw);

    expect(note.frontmatter.source).toBeUndefined();
    expect(note.content).toBe('Some content.');
  });

  it('should trim whitespace from content', () => {
    const raw = `---
title: Test
tags: []
date: "2026-02-08"
---

  Content with surrounding whitespace.

`;

    const note = parseNote('test', raw);

    expect(note.content).toBe('Content with surrounding whitespace.');
  });
});

describe('serializeNote', () => {
  it('should roundtrip through parse and serialize', () => {
    const frontmatter = {
      title: 'My Note',
      tags: ['a', 'b'],
      date: '2026-02-08',
    };

    const result = serializeNote(frontmatter, '## Hello\n\nWorld.');
    const reparsed = parseNote('test', result);

    expect(reparsed.frontmatter.title).toBe('My Note');
    expect(reparsed.frontmatter.tags).toEqual(['a', 'b']);
    expect(reparsed.content).toBe('## Hello\n\nWorld.');
  });

  it('should preserve source through roundtrip', () => {
    const frontmatter = {
      title: 'Roundtrip',
      tags: ['test'],
      date: '2026-01-01',
      source: 'https://example.com',
    };
    const content = 'Some body text.';

    const serialized = serializeNote(frontmatter, content);
    const reparsed = parseNote('roundtrip', serialized);

    expect(reparsed.frontmatter).toEqual(frontmatter);
    expect(reparsed.content).toBe(content);
  });
});

describe('slugify', () => {
  it('should lowercase and replace spaces with hyphens', () => {
    expect(slugify('Understanding Transformers')).toBe('understanding-transformers');
  });

  it('should remove special characters', () => {
    expect(slugify("What's New in React 19?")).toBe('what-s-new-in-react-19');
  });

  it('should collapse multiple hyphens', () => {
    expect(slugify('foo --- bar')).toBe('foo-bar');
  });

  it('should strip leading and trailing hyphens', () => {
    expect(slugify('--hello world--')).toBe('hello-world');
  });

  it('should handle already-slugified input', () => {
    expect(slugify('already-a-slug')).toBe('already-a-slug');
  });
});
