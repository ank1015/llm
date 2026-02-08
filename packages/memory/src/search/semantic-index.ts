/**
 * SemanticIndex — stores chunk embeddings and performs cosine similarity search.
 * Stored as .semantic-index.json alongside notes.
 */

import type { Embedder } from './embedder.js';
import type { EmbeddedChunk, SearchResult } from '../store/note.types.js';

export class SemanticIndex {
  constructor(
    private readonly indexPath: string,
    private readonly embedder: Embedder
  ) {
    void indexPath;
    void embedder;
  }

  async load(): Promise<void> {
    throw new Error('Not implemented');
  }

  async save(): Promise<void> {
    throw new Error('Not implemented');
  }

  async addChunks(chunks: EmbeddedChunk[]): Promise<void> {
    void chunks;
    throw new Error('Not implemented');
  }

  async removeBySlug(slug: string): Promise<void> {
    void slug;
    throw new Error('Not implemented');
  }

  async search(query: string, limit: number): Promise<SearchResult[]> {
    void query;
    void limit;
    throw new Error('Not implemented');
  }
}
