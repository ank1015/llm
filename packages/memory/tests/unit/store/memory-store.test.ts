import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MemoryStore } from '../../../src/store/memory-store.js';

// Mock the OpenAIEmbedder so unit tests don't need an API key
vi.mock('../../../src/search/embedder.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/search/embedder.js')>();

  const hashToVector = (text: string): number[] => {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    }
    const a = Math.sin(h) * 0.5 + 0.5;
    const b = Math.cos(h) * 0.5 + 0.5;
    const c = Math.sin(h * 2) * 0.5 + 0.5;
    const len = Math.sqrt(a * a + b * b + c * c);
    return [a / len, b / len, c / len];
  };

  return {
    ...original,
    OpenAIEmbedder: class {
      async embed(texts: string[]) {
        return texts.map(hashToVector);
      }
    },
  };
});

describe('MemoryStore', () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-store-test-'));
    store = new MemoryStore({ notesDir: tmpDir, openaiApiKey: 'fake-key' });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  describe('saveNote', () => {
    it('should create a markdown file and return the note', async () => {
      const note = await store.saveNote(
        'Understanding Transformers',
        '## Introduction\n\nAttention is all you need.',
        ['ml', 'transformers'],
        'https://example.com'
      );

      expect(note.slug).toBe('understanding-transformers');
      expect(note.frontmatter.title).toBe('Understanding Transformers');
      expect(note.frontmatter.tags).toEqual(['ml', 'transformers']);
      expect(note.frontmatter.source).toBe('https://example.com');
      expect(note.content).toBe('## Introduction\n\nAttention is all you need.');

      // File should exist on disk
      const filePath = join(tmpDir, 'understanding-transformers.md');
      const raw = await readFile(filePath, 'utf-8');
      expect(raw).toContain('Understanding Transformers');
    });

    it('should update metadata index on save', async () => {
      await store.saveNote('Note A', '## Content\n\nHello', ['tag-a']);
      await store.saveNote('Note B', '## Content\n\nWorld', ['tag-b']);

      const all = await store.listNotes();
      expect(all).toHaveLength(2);
      expect(all.map((n) => n.slug).sort()).toEqual(['note-a', 'note-b']);
    });

    it('should overwrite existing note with same title', async () => {
      await store.saveNote('My Note', '## V1\n\nOld content', ['old']);
      await store.saveNote('My Note', '## V2\n\nNew content', ['new']);

      const note = await store.getNote('my-note');
      expect(note.content).toBe('## V2\n\nNew content');
      expect(note.frontmatter.tags).toEqual(['new']);
    });
  });

  describe('getNote', () => {
    it('should read and parse a saved note', async () => {
      await store.saveNote('Test Note', '## Body\n\nSome text.', ['test']);

      const note = await store.getNote('test-note');
      expect(note.slug).toBe('test-note');
      expect(note.frontmatter.title).toBe('Test Note');
      expect(note.content).toBe('## Body\n\nSome text.');
    });

    it('should throw for non-existent slug', async () => {
      await expect(store.getNote('does-not-exist')).rejects.toThrow();
    });
  });

  describe('listNotes', () => {
    beforeEach(async () => {
      await store.saveNote('ML Basics', '## Intro\n\nML stuff', ['ml', 'intro']);
      await store.saveNote('Rust Ownership', '## Borrow\n\nBorrowing', ['rust', 'systems']);
      await store.saveNote('Advanced ML', '## Deep\n\nDeep learning', ['ml', 'advanced']);
    });

    it('should list all notes without filter', async () => {
      const notes = await store.listNotes();
      expect(notes).toHaveLength(3);
    });

    it('should filter by tags', async () => {
      const notes = await store.listNotes({ tags: ['ml'] });
      expect(notes).toHaveLength(2);
      expect(notes.map((n) => n.slug).sort()).toEqual(['advanced-ml', 'ml-basics']);
    });

    it('should filter by title keyword', async () => {
      const notes = await store.listNotes({ query: 'rust' });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.slug).toBe('rust-ownership');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await store.saveNote('ML Basics', '## Neural Networks\n\nIntro to neural nets.', ['ml']);
      await store.saveNote('Rust Ownership', '## Borrow Checker\n\nRust memory safety.', ['rust']);
    });

    it('should return semantic results when query provided', async () => {
      const { semantic } = await store.search('neural networks');
      expect(semantic.length).toBeGreaterThan(0);
      expect(semantic[0]!.score).toBeDefined();
    });

    it('should return tag results when tags provided', async () => {
      const { tags } = await store.search('', ['rust']);
      expect(tags).toHaveLength(1);
      expect(tags[0]!.slug).toBe('rust-ownership');
    });

    it('should return both sections when query and tags provided', async () => {
      const { semantic, tags } = await store.search('memory', ['rust']);
      expect(semantic.length).toBeGreaterThan(0);
      expect(tags).toHaveLength(1);
      expect(tags[0]!.slug).toBe('rust-ownership');
    });

    it('should respect limit for semantic results', async () => {
      const { semantic } = await store.search('programming', undefined, 1);
      expect(semantic.length).toBeLessThanOrEqual(1);
    });
  });

  describe('rebuildIndex', () => {
    it('should rebuild indexes from markdown files on disk', async () => {
      // Save notes normally
      await store.saveNote('Note One', '## Section\n\nFirst note', ['a']);
      await store.saveNote('Note Two', '## Section\n\nSecond note', ['b']);

      // Create a fresh store pointing to same dir — indexes not loaded
      const freshStore = new MemoryStore({ notesDir: tmpDir, openaiApiKey: 'fake-key' });
      await freshStore.rebuildIndex();

      const all = await freshStore.listNotes();
      expect(all).toHaveLength(2);
    });
  });
});
