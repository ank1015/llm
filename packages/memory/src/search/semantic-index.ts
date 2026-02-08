/**
 * SemanticIndex — stores chunk embeddings and performs cosine similarity search.
 * Stored as .semantic-index.json alongside notes.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { cosineSimilarity } from './embedder.js';

import type { Embedder } from './embedder.js';
import type { EmbeddedChunk, NoteChunk, SemanticHit } from '../store/note.types.js';

export class SemanticIndex {
  private chunks: EmbeddedChunk[] = [];

  constructor(
    private readonly indexPath: string,
    private readonly embedder: Embedder
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      this.chunks = JSON.parse(raw) as EmbeddedChunk[];
    } catch {
      this.chunks = [];
    }
  }

  async save(): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(this.chunks), 'utf-8');
  }

  /** Embed and add new chunks. Call save() after to persist. */
  async addChunks(noteChunks: NoteChunk[]): Promise<void> {
    if (noteChunks.length === 0) return;

    const texts = noteChunks.map((c) => `${c.heading}\n\n${c.text}`);
    const vectors = await this.embedder.embed(texts);

    for (let i = 0; i < noteChunks.length; i++) {
      this.chunks.push({ ...noteChunks[i]!, vector: vectors[i]! });
    }
  }

  removeBySlug(slug: string): void {
    this.chunks = this.chunks.filter((c) => c.slug !== slug);
  }

  /** Search by embedding the query and ranking chunks by cosine similarity */
  async search(query: string, limit: number): Promise<SemanticHit[]> {
    if (this.chunks.length === 0) return [];

    const [queryVector] = await this.embedder.embed([query]);
    if (!queryVector) return [];

    const scored = this.chunks.map((chunk) => ({
      slug: chunk.slug,
      heading: chunk.heading,
      text: chunk.text,
      score: cosineSimilarity(queryVector, chunk.vector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
