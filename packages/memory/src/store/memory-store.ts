/**
 * MemoryStore — core class that orchestrates note CRUD,
 * metadata indexing, and semantic search.
 */

import type {
  MemoryStoreConfig,
  Note,
  NoteFilter,
  NoteSummary,
  SearchResult,
} from './note.types.js';

const DEFAULT_NOTES_DIR = `${process.env['HOME'] ?? '~'}/.llm/memory/notes`;

export class MemoryStore {
  private readonly notesDir: string;
  private readonly openaiApiKey: string | undefined;

  constructor(config: MemoryStoreConfig = {}) {
    this.notesDir = config.notesDir ?? DEFAULT_NOTES_DIR;
    this.openaiApiKey = config.openaiApiKey ?? process.env['OPENAI_API_KEY'];
  }

  async saveNote(title: string, content: string, tags: string[], source?: string): Promise<Note> {
    void title;
    void content;
    void tags;
    void source;
    throw new Error('Not implemented');
  }

  async getNote(slug: string): Promise<Note> {
    void slug;
    throw new Error('Not implemented');
  }

  async listNotes(filter?: NoteFilter): Promise<NoteSummary[]> {
    void filter;
    throw new Error('Not implemented');
  }

  async search(query: string, tags?: string[], limit?: number): Promise<SearchResult[]> {
    void query;
    void tags;
    void limit;
    throw new Error('Not implemented');
  }

  async rebuildIndex(): Promise<void> {
    throw new Error('Not implemented');
  }
}
