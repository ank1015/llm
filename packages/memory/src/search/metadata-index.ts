/**
 * MetadataIndex — JSON index of note frontmatter for fast tag/keyword lookup.
 * Stored as .metadata-index.json alongside notes.
 */

import { readFile, writeFile } from 'node:fs/promises';

import type { NoteFilter, NoteSummary } from '../store/note.types.js';

export class MetadataIndex {
  private entries: Map<string, NoteSummary> = new Map();

  constructor(private readonly indexPath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, NoteSummary>;
      this.entries = new Map(Object.entries(data));
    } catch {
      // File doesn't exist yet — start empty
      this.entries = new Map();
    }
  }

  async save(): Promise<void> {
    const obj = Object.fromEntries(this.entries);
    await writeFile(this.indexPath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  upsert(summary: NoteSummary): void {
    this.entries.set(summary.slug, summary);
  }

  remove(slug: string): void {
    this.entries.delete(slug);
  }

  filter(filter: NoteFilter): NoteSummary[] {
    let results = [...this.entries.values()];

    if (filter.tags && filter.tags.length > 0) {
      const filterTags = new Set(filter.tags.map((t) => t.toLowerCase()));
      results = results.filter((n) => n.tags.some((t) => filterTags.has(t.toLowerCase())));
    }

    if (filter.query) {
      const q = filter.query.toLowerCase();
      results = results.filter((n) => n.title.toLowerCase().includes(q));
    }

    return results;
  }

  getAll(): NoteSummary[] {
    return [...this.entries.values()];
  }
}
