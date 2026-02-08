/**
 * Demo script — exercises all 3 tools with real data to verify behavior.
 * Run: npx tsx scripts/demo.ts
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryStore } from '../src/store/memory-store.js';
import { createGetNotesTool } from '../src/tools/get-note.tool.js';
import { createSaveNoteTool } from '../src/tools/save-note.tool.js';
import { createSearchTool } from '../src/tools/search.tool.js';

// ── Helpers ──

function logSection(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

function logTool(name: string, params: unknown) {
  console.log(`\n→ Tool: ${name}`);
  console.log(`  Input: ${JSON.stringify(params, null, 2).replace(/\n/g, '\n  ')}`);
}

function logResult(result: { content: unknown[]; details: unknown }) {
  const text = (result.content[0] as { content: string }).content;
  console.log(`  Output (content):\n    ${text.replace(/\n/g, '\n    ')}`);
  console.log(
    `  Output (details): ${JSON.stringify(result.details, null, 2).replace(/\n/g, '\n    ')}`
  );
}

// ── Mock notes ──

const NOTES = [
  {
    title: 'Transformer Architecture',
    content:
      '## Self-Attention\n\nThe self-attention mechanism computes queries, keys, and values from input embeddings.\n\n## Multi-Head Attention\n\nMultiple attention heads allow the model to attend to different representation subspaces.',
    tags: ['ml', 'transformers', 'deep-learning'],
    source: 'https://arxiv.org/abs/1706.03762',
  },
  {
    title: 'Rust Ownership Model',
    content:
      '## Ownership Rules\n\nEach value in Rust has exactly one owner. When the owner goes out of scope, the value is dropped.\n\n## Borrowing\n\nReferences allow borrowing values without taking ownership. Mutable references are exclusive.',
    tags: ['rust', 'systems', 'memory-safety'],
  },
  {
    title: 'React Server Components',
    content:
      '## What Are RSCs\n\nServer Components render on the server and send HTML to the client, reducing bundle size.\n\n## When to Use\n\nUse for data fetching, accessing backend resources, and keeping sensitive logic server-side.',
    tags: ['react', 'frontend', 'javascript'],
    source: 'https://react.dev/blog/2023/03/22/react-labs',
  },
  {
    title: 'PostgreSQL Indexing Strategies',
    content:
      '## B-Tree Indexes\n\nDefault index type. Best for equality and range queries on sortable data.\n\n## GIN Indexes\n\nGeneralized Inverted Index. Best for full-text search, JSONB, and array columns.\n\n## Partial Indexes\n\nIndexes with a WHERE clause. Reduce index size by only indexing rows that match a condition.',
    tags: ['databases', 'postgresql', 'performance'],
  },
  {
    title: 'Docker Multi-Stage Builds',
    content:
      '## Why Multi-Stage\n\nKeep final images small by separating build dependencies from runtime.\n\n## Pattern\n\nUse FROM ... AS builder for compilation, then COPY --from=builder to pick only the artifacts you need.',
    tags: ['docker', 'devops', 'containers'],
  },
  {
    title: 'Gradient Descent Variants',
    content:
      '## Batch Gradient Descent\n\nComputes gradient over the entire dataset. Stable but slow for large datasets.\n\n## Stochastic Gradient Descent\n\nUpdates per sample. Noisy but fast. SGD with momentum smooths updates.\n\n## Adam Optimizer\n\nAdaptive learning rates per parameter. Combines momentum with RMSProp. Most popular default.',
    tags: ['ml', 'optimization', 'deep-learning'],
  },
  {
    title: 'TypeScript Discriminated Unions',
    content:
      '## Pattern\n\nUse a shared literal type field as a discriminant. TypeScript narrows the type in switch/if blocks.\n\n## Example\n\ntype Result = { status: "ok"; data: string } | { status: "error"; message: string }',
    tags: ['typescript', 'patterns', 'frontend'],
  },
  {
    title: 'CAP Theorem',
    content:
      '## The Three Guarantees\n\nConsistency: every read gets the most recent write. Availability: every request gets a response. Partition tolerance: system works despite network partitions.\n\n## Trade-offs\n\nYou can only guarantee two of three. Most distributed systems choose AP or CP.',
    tags: ['distributed-systems', 'databases', 'theory'],
  },
  {
    title: 'Prompt Engineering Techniques',
    content:
      '## Chain of Thought\n\nAsk the model to reason step by step. Improves accuracy on complex tasks.\n\n## Few-Shot Examples\n\nProvide examples in the prompt to guide the model output format and style.\n\n## System Prompts\n\nSet persona and constraints in the system message for consistent behavior.',
    tags: ['ai', 'prompt-engineering', 'llm'],
  },
  {
    title: 'WebSocket vs SSE',
    content:
      '## WebSockets\n\nFull-duplex communication. Client and server can send messages at any time. Good for chat, gaming.\n\n## Server-Sent Events\n\nServer-to-client only. Simple HTTP-based protocol. Auto-reconnect built in. Good for live feeds, notifications.',
    tags: ['web', 'networking', 'real-time'],
  },
];

// ── Main ──

async function main() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'memory-demo-'));
  console.log(`Notes directory: ${tmpDir}`);

  const store = new MemoryStore({ notesDir: tmpDir });
  const saveNote = createSaveNoteTool(store);
  const search = createSearchTool(store);
  const getNotes = createGetNotesTool(store);

  // ── 1. Show tool schemas ──

  logSection('TOOL SCHEMAS');

  for (const tool of [saveNote, search, getNotes]) {
    console.log(`\n[${tool.name}] ${tool.description}`);
    console.log(`  Parameters: ${JSON.stringify(tool.parameters, null, 2).replace(/\n/g, '\n  ')}`);
  }

  // ── 2. Save all notes ──

  logSection('SAVING 10 NOTES');

  for (const note of NOTES) {
    const params = {
      title: note.title,
      content: note.content,
      tags: note.tags,
      source: note.source,
    };
    logTool('save_note', { title: note.title, tags: note.tags, source: note.source });
    const result = await saveNote.execute('demo', params);
    logResult(result);
  }

  // ── 3. Semantic search tests ──

  logSection('SEARCH: Semantic queries');

  const semanticQueries = [
    { query: 'how does attention work in neural networks' },
    { query: 'memory management in systems programming' },
    { query: 'optimizing database queries' },
    { query: 'building real-time web applications' },
    { query: 'best practices for prompting large language models' },
  ];

  for (const params of semanticQueries) {
    logTool('search_memory', params);
    const result = await search.execute('demo', { ...params, limit: 3 });
    logResult(result);
  }

  // ── 4. Tag-only search ──

  logSection('SEARCH: Tag filtering');

  const tagQueries = [{ tags: ['ml'] }, { tags: ['databases'] }, { tags: ['frontend'] }];

  for (const params of tagQueries) {
    logTool('search_memory', params);
    const result = await search.execute('demo', params);
    logResult(result);
  }

  // ── 5. Combined semantic + tag search ──

  logSection('SEARCH: Semantic + Tag combined');

  const combinedQuery = { query: 'learning rate optimization', tags: ['ml'], limit: 2 };
  logTool('search_memory', combinedQuery);
  const combinedResult = await search.execute('demo', combinedQuery);
  logResult(combinedResult);

  // ── 6. Get notes ──

  logSection('GET NOTES: Single and multiple');

  const singleGet = { slugs: ['rust-ownership-model'] };
  logTool('get_notes', singleGet);
  const singleResult = await getNotes.execute('demo', singleGet);
  logResult(singleResult);

  const multiGet = { slugs: ['cap-theorem', 'transformer-architecture', 'nonexistent-note'] };
  logTool('get_notes', multiGet);
  const multiResult = await getNotes.execute('demo', multiGet);
  logResult(multiResult);

  // ── Cleanup ──

  await rm(tmpDir, { recursive: true });
  console.log(`\n✓ Demo complete. Cleaned up ${tmpDir}`);
}

main().catch(console.error);
