import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemoryStore } from '../../../src/store/memory-store.js';

const apiKey = process.env['OPENAI_API_KEY'];

describe.skipIf(!apiKey)('MemoryStore integration', () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-store-integ-'));
    store = new MemoryStore({ notesDir: tmpDir, openaiApiKey: apiKey });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('should save a note and find it via semantic search', async () => {
    await store.saveNote(
      'Transformer Architecture',
      '## Attention Mechanism\n\nSelf-attention allows the model to weigh different parts of the input.',
      ['ml', 'transformers']
    );

    await store.saveNote(
      'Rust Borrow Checker',
      '## Ownership Rules\n\nEach value has exactly one owner at a time.',
      ['rust', 'systems']
    );

    // Search for ML-related content
    const { semantic } = await store.search('how does attention work in neural networks');

    expect(semantic.length).toBeGreaterThan(0);
    // Transformer note should rank higher than Rust note
    expect(semantic[0]!.slug).toBe('transformer-architecture');
  });

  it('should return both semantic and tag results when both provided', async () => {
    await store.saveNote('ML Note', '## Topic\n\nMachine learning concepts.', ['ml']);
    await store.saveNote('Rust Note', '## Topic\n\nSystems programming concepts.', ['rust']);

    const { semantic, tags } = await store.search('programming concepts', ['rust']);

    expect(semantic.length).toBeGreaterThan(0);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.slug).toBe('rust-note');
  });

  it('should rebuild index from disk and search correctly', async () => {
    await store.saveNote(
      'Embeddings',
      '## Vector Representations\n\nEmbeddings map text to dense vectors.',
      ['ml', 'embeddings']
    );

    // Fresh store, rebuild from files
    const freshStore = new MemoryStore({ notesDir: tmpDir, openaiApiKey: apiKey });
    await freshStore.rebuildIndex();

    const { semantic } = await freshStore.search('vector representations for text');
    expect(semantic.length).toBeGreaterThan(0);
    expect(semantic[0]!.slug).toBe('embeddings');
  });
});
