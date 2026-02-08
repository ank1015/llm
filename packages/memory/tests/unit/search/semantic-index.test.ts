import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SemanticIndex } from '../../../src/search/semantic-index.js';

import type { Embedder } from '../../../src/search/embedder.js';
import type { NoteChunk } from '../../../src/store/note.types.js';

/** Mock embedder that returns predictable vectors based on text content */
function createMockEmbedder(): Embedder {
  // Simple deterministic embedding: hash text into a 3-element vector
  const hashToVector = (text: string): number[] => {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    }
    const a = Math.sin(h) * 0.5 + 0.5;
    const b = Math.cos(h) * 0.5 + 0.5;
    const c = Math.sin(h * 2) * 0.5 + 0.5;
    // Normalize
    const len = Math.sqrt(a * a + b * b + c * c);
    return [a / len, b / len, c / len];
  };

  return {
    embed: vi.fn(async (texts: string[]) => texts.map(hashToVector)),
  };
}

const makeChunk = (slug: string, heading: string, text: string): NoteChunk => ({
  chunkId: `${slug}#${heading.toLowerCase().replace(/\s+/g, '-')}`,
  slug,
  heading,
  text,
});

describe('SemanticIndex', () => {
  let tmpDir: string;
  let indexPath: string;
  let embedder: Embedder;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-semantic-test-'));
    indexPath = join(tmpDir, '.semantic-index.json');
    embedder = createMockEmbedder();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('should start empty when no index file exists', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    const results = await index.search('anything', 10);
    expect(results).toEqual([]);
  });

  it('should add chunks and make them searchable', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    const chunks = [
      makeChunk('note-a', 'Introduction', 'This is about machine learning'),
      makeChunk('note-a', 'Summary', 'ML is great'),
    ];

    await index.addChunks(chunks);

    const results = await index.search('machine learning', 10);
    expect(results).toHaveLength(2);
    expect(results[0]!.slug).toBe('note-a');
    // Scores should be between -1 and 1
    expect(results[0]!.score).toBeGreaterThanOrEqual(-1);
    expect(results[0]!.score).toBeLessThanOrEqual(1);
  });

  it('should respect limit parameter', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    await index.addChunks([
      makeChunk('a', 'One', 'First chunk'),
      makeChunk('b', 'Two', 'Second chunk'),
      makeChunk('c', 'Three', 'Third chunk'),
    ]);

    const results = await index.search('chunk', 2);
    expect(results).toHaveLength(2);
  });

  it('should remove chunks by slug', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    await index.addChunks([
      makeChunk('note-a', 'Intro', 'A intro'),
      makeChunk('note-b', 'Intro', 'B intro'),
    ]);

    index.removeBySlug('note-a');

    const results = await index.search('intro', 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.slug).toBe('note-b');
  });

  it('should persist and reload from disk', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    await index.addChunks([makeChunk('note-a', 'Intro', 'About ML')]);
    await index.save();

    // Load into a fresh instance — should not need to re-embed
    const index2 = new SemanticIndex(indexPath, embedder);
    await index2.load();

    const results = await index2.search('ML', 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.slug).toBe('note-a');
  });

  it('should call embedder with heading + text concatenated', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    await index.addChunks([makeChunk('note', 'My Heading', 'Body text here')]);

    expect(embedder.embed).toHaveBeenCalledWith(['My Heading\n\nBody text here']);
  });

  it('should return results sorted by score descending', async () => {
    const index = new SemanticIndex(indexPath, embedder);
    await index.load();

    await index.addChunks([
      makeChunk('a', 'Alpha', 'Alpha content'),
      makeChunk('b', 'Beta', 'Beta content'),
      makeChunk('c', 'Gamma', 'Gamma content'),
    ]);

    const results = await index.search('test', 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });
});
