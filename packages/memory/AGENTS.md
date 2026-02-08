# @ank1015/llm-memory

Personal knowledge memory system. Stores notes as markdown files with YAML frontmatter, indexes them for tag and semantic search, and exposes AgentTools for AI agents.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm test` — Run all tests
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts                  — Public exports
  store/
    note.types.ts           — Note, NoteSummary, NoteChunk, SearchResult types
    markdown.ts             — Parse/serialize markdown + YAML frontmatter, slugify
    memory-store.ts         — MemoryStore class (orchestrates CRUD + indexing)
  search/
    chunker.ts              — Split markdown by ## headings into NoteChunks
    embedder.ts             — Embedder interface, OpenAIEmbedder, cosineSimilarity
    metadata-index.ts       — JSON index of frontmatter for tag/keyword lookup
    semantic-index.ts       — Vector storage + cosine similarity search
  tools/
    save-note.tool.ts       — AgentTool: save_note
    search.tool.ts          — AgentTool: search_memory
    get-note.tool.ts        — AgentTool: get_notes (supports multiple slugs)
```

## Key Concepts

- Notes stored as flat `.md` files in `~/.llm/memory/notes/`
- `.metadata-index.json` — tag/keyword index (JSON, auto-rebuilt on save)
- `.semantic-index.json` — chunk embeddings for semantic search (JSON)
- Chunking splits by `##` headings; content before first heading goes to a "content" chunk
- Embeddings via OpenAI `text-embedding-3-small` (1536 dims, normalized, cosine = dot product)
- Tools conform to `AgentTool` from `@ank1015/llm-types` with TypeBox parameter schemas

## Testing

```
tests/
  unit/
    store/
      markdown.test.ts        — Parse, serialize, slugify
      memory-store.test.ts    — CRUD, search, rebuild (mocked embedder)
    search/
      chunker.test.ts         — Heading-based chunking
      embedder.test.ts        — CosineSimilarity, mocked OpenAI
      metadata-index.test.ts  — Tag/keyword filtering, persistence
      semantic-index.test.ts  — Vector search, persistence (mock embedder)
  integration/
    search/
      embedder.test.ts        — Real OpenAI embedding API
    store/
      memory-store.test.ts    — Full CRUD + semantic search with real API
    tools/
      e2e.test.ts             — All 3 tools end-to-end with real API
```

Environment variables for integration tests:

- `OPENAI_API_KEY` — Required for embedding API calls

## Conventions

- Use `exactOptionalPropertyTypes` — add `| undefined` to optional properties
- Mock `OpenAIEmbedder` in unit tests via `vi.mock` to avoid API calls
- Tools are created via factory functions: `createSaveNoteTool(store)`
- All tools return `AgentToolResult` with `content` (text for LLM) and `details` (structured data for UI)

## Dependencies

- Depends on: `@ank1015/llm-sdk`, `@ank1015/llm-types`, `@sinclair/typebox`, `gray-matter`, `openai`
- Depended on by: (consumer applications)
