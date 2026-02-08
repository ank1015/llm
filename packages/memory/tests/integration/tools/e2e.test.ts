import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemoryStore } from '../../../src/store/memory-store.js';
import { createGetNotesTool } from '../../../src/tools/get-note.tool.js';
import { createSaveNoteTool } from '../../../src/tools/save-note.tool.js';
import { createSearchTool } from '../../../src/tools/search.tool.js';

const apiKey = process.env['OPENAI_API_KEY'];

describe.skipIf(!apiKey)('AgentTools e2e', () => {
  let tmpDir: string;
  let store: MemoryStore;
  let saveNote: ReturnType<typeof createSaveNoteTool>;
  let searchMemory: ReturnType<typeof createSearchTool>;
  let getNotes: ReturnType<typeof createGetNotesTool>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-tools-e2e-'));
    store = new MemoryStore({ notesDir: tmpDir, openaiApiKey: apiKey });
    saveNote = createSaveNoteTool(store);
    searchMemory = createSearchTool(store);
    getNotes = createGetNotesTool(store);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('should save notes and search them semantically', async () => {
    await saveNote.execute('call-1', {
      title: 'Attention Mechanisms',
      content: '## Self-Attention\n\nQueries, keys, and values are projections of the input.',
      tags: ['ml', 'transformers'],
      source: 'https://arxiv.org/abs/1706.03762',
    });

    await saveNote.execute('call-2', {
      title: 'Cooking Pasta',
      content: '## Boiling\n\nBoil water and add salt before adding pasta.',
      tags: ['cooking'],
    });

    const searchResult = await searchMemory.execute('call-3', {
      query: 'how does attention work in neural networks',
    });

    const text = (searchResult.content[0] as { content: string }).content;
    expect(text).toContain('Semantic Results:');
    expect(text).toContain('attention-mechanisms');

    const details = searchResult.details as { semantic: Array<{ slug: string }> };
    expect(details.semantic[0]!.slug).toBe('attention-mechanisms');
  });

  it('should filter by tags via search tool', async () => {
    await saveNote.execute('call-1', {
      title: 'ML Paper',
      content: '## Abstract\n\nA new approach to learning.',
      tags: ['ml', 'papers'],
    });

    await saveNote.execute('call-2', {
      title: 'Rust Tip',
      content: '## Tip\n\nUse pattern matching.',
      tags: ['rust'],
    });

    const searchResult = await searchMemory.execute('call-3', { tags: ['rust'] });
    const searchText = (searchResult.content[0] as { content: string }).content;
    expect(searchText).toContain('Tag Results:');
    expect(searchText).toContain('rust-tip');
    expect(searchText).not.toContain('ml-paper');
  });

  it('should retrieve single note via get_notes', async () => {
    await saveNote.execute('call-1', {
      title: 'Quick Tip',
      content: '## Tip\n\nAlways commit before refactoring.',
      tags: ['dev'],
    });

    const result = await getNotes.execute('call-2', { slugs: ['quick-tip'] });
    const text = (result.content[0] as { content: string }).content;
    expect(text).toContain('Always commit before refactoring.');

    const details = result.details as { results: Array<{ slug: string; found: boolean }> };
    expect(details.results[0]!.slug).toBe('quick-tip');
    expect(details.results[0]!.found).toBe(true);
  });

  it('should retrieve multiple notes and handle missing slugs', async () => {
    await saveNote.execute('call-1', {
      title: 'Note A',
      content: '## A\n\nFirst note.',
      tags: ['test'],
    });

    await saveNote.execute('call-2', {
      title: 'Note B',
      content: '## B\n\nSecond note.',
      tags: ['test'],
    });

    const result = await getNotes.execute('call-3', {
      slugs: ['note-a', 'note-b', 'does-not-exist'],
    });

    const text = (result.content[0] as { content: string }).content;
    expect(text).toContain('# Note A');
    expect(text).toContain('# Note B');
    expect(text).toContain('Not found: does-not-exist');

    const details = result.details as { results: Array<{ slug: string; found: boolean }> };
    expect(details.results).toHaveLength(3);
    expect(details.results[2]!.found).toBe(false);
  });

  it('should combine semantic search with tag filter', async () => {
    await saveNote.execute('call-1', {
      title: 'ML Note',
      content: '## Topic\n\nMachine learning concepts and optimization.',
      tags: ['ml'],
    });

    await saveNote.execute('call-2', {
      title: 'Rust Note',
      content: '## Topic\n\nSystems programming concepts and optimization.',
      tags: ['rust'],
    });

    const result = await searchMemory.execute('call-3', {
      query: 'optimization techniques',
      tags: ['ml'],
    });

    const text = (result.content[0] as { content: string }).content;
    expect(text).toContain('Semantic Results:');
    expect(text).toContain('Tag Results:');

    const details = result.details as {
      semantic: Array<{ slug: string }>;
      tags: Array<{ slug: string }>;
    };
    expect(details.semantic.length).toBeGreaterThan(0);
    expect(details.tags).toHaveLength(1);
    expect(details.tags[0]!.slug).toBe('ml-note');
  });
});
