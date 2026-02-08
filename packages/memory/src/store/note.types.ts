/**
 * Note and memory system type definitions.
 */

/** YAML frontmatter stored at the top of each markdown note */
export interface NoteFrontmatter {
  title: string;
  tags: string[];
  source?: string | undefined;
  date: string;
}

/** A full note with parsed frontmatter and content */
export interface Note {
  slug: string;
  frontmatter: NoteFrontmatter;
  content: string;
}

/** Lightweight note summary for listing/browsing */
export interface NoteSummary {
  slug: string;
  title: string;
  tags: string[];
  date: string;
  source?: string | undefined;
}

/** A chunk of a note for semantic indexing */
export interface NoteChunk {
  chunkId: string;
  slug: string;
  heading: string;
  text: string;
}

/** A chunk with its embedding vector */
export interface EmbeddedChunk extends NoteChunk {
  vector: number[];
}

/** Search result from semantic search */
export interface SearchResult {
  slug: string;
  heading: string;
  text: string;
  score: number;
}

/** Filter options for listing notes */
export interface NoteFilter {
  tags?: string[] | undefined;
  query?: string | undefined;
}

/** Configuration for the memory store */
export interface MemoryStoreConfig {
  /** Directory where notes are stored. Defaults to ~/.llm/memory/notes */
  notesDir?: string;
  /** OpenAI API key for embeddings. Falls back to OPENAI_API_KEY env var */
  openaiApiKey?: string;
}
