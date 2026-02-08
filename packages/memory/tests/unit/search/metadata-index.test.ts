import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MetadataIndex } from '../../../src/search/metadata-index.js';

import type { NoteSummary } from '../../../src/store/note.types.js';

const makeSummary = (slug: string, overrides?: Partial<NoteSummary>): NoteSummary => ({
  slug,
  title: slug.replace(/-/g, ' '),
  tags: ['test'],
  date: '2026-02-08',
  ...overrides,
});

describe('MetadataIndex', () => {
  let tmpDir: string;
  let indexPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'memory-test-'));
    indexPath = join(tmpDir, '.metadata-index.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('should start empty when no index file exists', async () => {
    const index = new MetadataIndex(indexPath);
    await index.load();

    expect(index.getAll()).toEqual([]);
  });

  it('should upsert and retrieve entries', async () => {
    const index = new MetadataIndex(indexPath);
    await index.load();

    index.upsert(makeSummary('note-a'));
    index.upsert(makeSummary('note-b'));

    expect(index.getAll()).toHaveLength(2);
  });

  it('should overwrite on upsert with same slug', async () => {
    const index = new MetadataIndex(indexPath);
    await index.load();

    index.upsert(makeSummary('note-a', { tags: ['old'] }));
    index.upsert(makeSummary('note-a', { tags: ['new'] }));

    const all = index.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.tags).toEqual(['new']);
  });

  it('should remove entries by slug', async () => {
    const index = new MetadataIndex(indexPath);
    await index.load();

    index.upsert(makeSummary('note-a'));
    index.upsert(makeSummary('note-b'));
    index.remove('note-a');

    expect(index.getAll()).toHaveLength(1);
    expect(index.getAll()[0]!.slug).toBe('note-b');
  });

  it('should persist and reload from disk', async () => {
    const index = new MetadataIndex(indexPath);
    await index.load();
    index.upsert(makeSummary('note-a', { tags: ['ml', 'transformers'] }));
    await index.save();

    const index2 = new MetadataIndex(indexPath);
    await index2.load();

    expect(index2.getAll()).toHaveLength(1);
    expect(index2.getAll()[0]!.tags).toEqual(['ml', 'transformers']);
  });

  describe('filter', () => {
    let index: MetadataIndex;

    beforeEach(async () => {
      index = new MetadataIndex(indexPath);
      await index.load();
      index.upsert(
        makeSummary('transformers', {
          title: 'Understanding Transformers',
          tags: ['ml', 'transformers'],
        })
      );
      index.upsert(
        makeSummary('rust-ownership', { title: 'Rust Ownership Model', tags: ['rust', 'systems'] })
      );
      index.upsert(makeSummary('ml-basics', { title: 'ML Basics', tags: ['ml', 'intro'] }));
    });

    it('should filter by tags', () => {
      const results = index.filter({ tags: ['ml'] });
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.slug).sort()).toEqual(['ml-basics', 'transformers']);
    });

    it('should filter by title keyword', () => {
      const results = index.filter({ query: 'rust' });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe('rust-ownership');
    });

    it('should combine tag and keyword filters', () => {
      const results = index.filter({ tags: ['ml'], query: 'basics' });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe('ml-basics');
    });

    it('should be case-insensitive for tags', () => {
      const results = index.filter({ tags: ['ML'] });
      expect(results).toHaveLength(2);
    });

    it('should be case-insensitive for query', () => {
      const results = index.filter({ query: 'TRANSFORMERS' });
      expect(results).toHaveLength(1);
    });

    it('should return all when filter is empty', () => {
      const results = index.filter({});
      expect(results).toHaveLength(3);
    });
  });
});
