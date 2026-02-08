/**
 * search_memory — AgentTool for searching notes by semantic query and/or tags.
 * Returns results in separate sections: semantic matches and tag matches.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const SearchParams = Type.Object({
  query: Type.Optional(Type.String({ description: 'Semantic search query' })),
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Filter by tags' })),
  limit: Type.Optional(Type.Number({ description: 'Max semantic results to return (default 10)' })),
});

export function createSearchTool(store: MemoryStore): AgentTool<typeof SearchParams> {
  return {
    name: 'search_memory',
    label: 'Search Memory',
    description:
      'Search personal knowledge memory. Provide a query for semantic search, tags for tag-based filtering, or both. Results are returned in two sections: "Semantic Results" ranked by relevance, and "Tag Results" listing notes matching the given tags.',
    parameters: SearchParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;
      const results = await store.search(params.query ?? '', params.tags, params.limit ?? 10);

      const sections: string[] = [];

      if (params.query) {
        if (results.semantic.length > 0) {
          const lines = results.semantic.map(
            (r) => `  - ${r.slug} > ${r.heading} (score: ${r.score.toFixed(3)})`
          );
          sections.push(`Semantic Results:\n${lines.join('\n')}`);
        } else {
          sections.push('Semantic Results:\n  No matches found.');
        }
      }

      if (params.tags && params.tags.length > 0) {
        if (results.tags.length > 0) {
          const lines = results.tags.map((r) => `  - ${r.slug} [${r.tags.join(', ')}]`);
          sections.push(`Tag Results:\n${lines.join('\n')}`);
        } else {
          sections.push('Tag Results:\n  No matches found.');
        }
      }

      const text = sections.length > 0 ? sections.join('\n\n') : 'No search criteria provided.';

      return {
        content: [{ type: 'text', content: text }],
        details: results,
      };
    },
  };
}
