/**
 * search_memory — AgentTool for searching notes by semantic query and/or tags.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const SearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: 'Semantic search query' })),
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Filter by tags' })),
  limit: Type.Optional(Type.Number({ description: 'Max results to return (default 10)' })),
});

export function createSearchTool(store: MemoryStore): AgentTool<typeof SearchParams> {
  return {
    name: 'search_memory',
    label: 'Search Memory',
    description:
      'Search personal knowledge memory by semantic similarity and/or tags. Returns matching note slugs, headings, and relevance scores.',
    parameters: SearchParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;
      const results = await store.search(params.query ?? '', params.tags, params.limit ?? 10);
      const text =
        results.length > 0
          ? results
              .map((r) => `- ${r.slug} > ${r.heading} (score: ${r.score.toFixed(3)})`)
              .join('\n')
          : 'No matching notes found.';
      return {
        content: [{ type: 'text', content: text }],
        details: { results },
      };
    },
  };
}
