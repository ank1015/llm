/**
 * MetadataIndex — JSON index of note frontmatter for fast tag/keyword lookup.
 * Stored as .metadata-index.json alongside notes.
 */

import type { NoteSummary, NoteFilter } from '../store/note.types.js';

export class MetadataIndex {
  constructor(private readonly indexPath: string) {
    void indexPath;
  }

  async load(): Promise<void> {
    throw new Error('Not implemented');
  }

  async save(): Promise<void> {
    throw new Error('Not implemented');
  }

  async upsert(summary: NoteSummary): Promise<void> {
    void summary;
    throw new Error('Not implemented');
  }

  async remove(slug: string): Promise<void> {
    void slug;
    throw new Error('Not implemented');
  }

  filter(filter: NoteFilter): NoteSummary[] {
    void filter;
    throw new Error('Not implemented');
  }

  getAll(): NoteSummary[] {
    throw new Error('Not implemented');
  }
}
