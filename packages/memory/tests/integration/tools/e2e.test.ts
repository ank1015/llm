import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemoryStore } from '../../../src/store/memory-store.js';
import { createGetNoteTool } from '../../../src/tools/get-note.tool.js';
import { createListNotesTool } from '../../../src/tools/list-notes.tool.js';
import { createSaveNoteTool } from '../../../src/tools/save-note.tool.js';
import { createSearchTool } from '../../../src/tools/search.tool.js';

import type { AgentTool } from '@ank1015/llm-types';

const apiKey = process.env['OPENAI_API_KEY'];

describe.skipIf(!apiKey)('AgentTools e2e', () => {
  let tmpDir: string;
  let store: MemoryStore;
  let saveNote: AgentTool;
  let searchMemory: AgentTool;
  let getNote: AgentTool;
  let listNotes: AgentTool;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-tools-e2e-'));
    store = new MemoryStore({ notesDir: tmpDir, openaiApiKey: apiKey });
    saveNote = createSaveNoteTool(store);
    searchMemory = createSearchTool(store);
    getNote = createGetNoteTool(store);
    listNotes = createListNotesTool(store);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('should save notes via tool and list them', async () => {
    const saveResult = await saveNote.execute('call-1', {
      title: 'Attention Mechanisms',
      content: '## Self-Attention\n\nQueries, keys, and values are projections of the input.',
      tags: ['ml', 'transformers'],
      source: 'https://arxiv.org/abs/1706.03762',
    });

    expect(saveResult.content[0]).toMatchObject({
      type: 'text',
      content: 'Note saved: attention-mechanisms',
    });

    await saveNote.execute('call-2', {
      title: 'Rust Lifetimes',
      content:
        "## Borrow Checker\n\nLifetimes ensure references don't outlive the data they point to.",
      tags: ['rust', 'systems'],
    });

    const listResult = await listNotes.execute('call-3', {});
    const listText = (listResult.content[0] as { content: string }).content;
    expect(listText).toContain('attention-mechanisms');
    expect(listText).toContain('rust-lifetimes');
    expect((listResult.details as { count: number }).count).toBe(2);
  });

  it('should search notes via tool and return ranked results', async () => {
    await saveNote.execute('call-1', {
      title: 'Neural Network Basics',
      content: '## Layers\n\nNeural networks consist of layers of interconnected neurons.',
      tags: ['ml', 'neural-nets'],
    });

    await saveNote.execute('call-2', {
      title: 'Cooking Pasta',
      content: '## Boiling\n\nBoil water and add salt before adding pasta.',
      tags: ['cooking'],
    });

    const searchResult = await searchMemory.execute('call-3', {
      query: 'how do neural networks learn',
    });

    const searchText = (searchResult.content[0] as { content: string }).content;
    expect(searchText).toContain('neural-network-basics');

    const details = searchResult.details as { results: Array<{ slug: string; score: number }> };
    // Neural net note should score higher than cooking
    expect(details.results[0]!.slug).toBe('neural-network-basics');
  });

  it('should retrieve a note by slug via get_note tool', async () => {
    await saveNote.execute('call-1', {
      title: 'Quick Tip',
      content: '## Tip\n\nAlways commit before refactoring.',
      tags: ['dev'],
    });

    const getResult = await getNote.execute('call-2', { slug: 'quick-tip' });

    const noteContent = (getResult.content[0] as { content: string }).content;
    expect(noteContent).toContain('Always commit before refactoring.');

    const details = getResult.details as { slug: string; frontmatter: { title: string } };
    expect(details.slug).toBe('quick-tip');
    expect(details.frontmatter.title).toBe('Quick Tip');
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

    const searchResult = await searchMemory.execute('call-3', {
      tags: ['rust'],
    });

    const searchText = (searchResult.content[0] as { content: string }).content;
    expect(searchText).toContain('rust-tip');
    expect(searchText).not.toContain('ml-paper');
  });

  it('should filter list_notes by tag and keyword', async () => {
    await saveNote.execute('call-1', {
      title: 'Intro to ML',
      content: '## Basics\n\nML basics.',
      tags: ['ml'],
    });

    await saveNote.execute('call-2', {
      title: 'Advanced ML',
      content: '## Deep\n\nDeep learning.',
      tags: ['ml'],
    });

    await saveNote.execute('call-3', {
      title: 'Rust Guide',
      content: '## Ownership\n\nOwnership rules.',
      tags: ['rust'],
    });

    const tagResult = await listNotes.execute('call-4', { tags: ['ml'] });
    expect((tagResult.details as { count: number }).count).toBe(2);

    const keywordResult = await listNotes.execute('call-5', { query: 'advanced' });
    expect((keywordResult.details as { count: number }).count).toBe(1);
  });
});
