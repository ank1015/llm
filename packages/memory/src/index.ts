/**
 * @ank1015/llm-memory
 *
 * Personal knowledge memory system with semantic search.
 * Stores notes as markdown files with YAML frontmatter,
 * indexes them for tag and semantic search, and exposes
 * AgentTools for AI agents to interact with.
 */

// Core store
export { MemoryStore } from './store/memory-store.js';

// Types
export type {
  Note,
  NoteFrontmatter,
  NoteSummary,
  NoteChunk,
  EmbeddedChunk,
  SearchResult,
  NoteFilter,
  MemoryStoreConfig,
} from './store/note.types.js';

// Markdown utilities
export { parseNote, serializeNote, slugify } from './store/markdown.js';

// Search
export { MetadataIndex } from './search/metadata-index.js';
export { SemanticIndex } from './search/semantic-index.js';
export { chunkByHeadings } from './search/chunker.js';
export { OpenAIEmbedder, cosineSimilarity, type Embedder } from './search/embedder.js';

// Tools
export { createSaveNoteTool } from './tools/save-note.tool.js';
export { createSearchTool } from './tools/search.tool.js';
export { createGetNoteTool } from './tools/get-note.tool.js';
export { createListNotesTool } from './tools/list-notes.tool.js';
