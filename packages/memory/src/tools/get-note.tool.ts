/**
 * get_notes — AgentTool for reading one or more notes by slug.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const GetNotesParams = Type.Object({
  slugs: Type.Array(Type.String(), {
    description: 'One or more note slugs (filenames without .md) to retrieve',
  }),
});

export function createGetNotesTool(store: MemoryStore): AgentTool<typeof GetNotesParams> {
  return {
    name: 'get_notes',
    label: 'Get Notes',
    description:
      'Retrieve the full content of one or more notes by their slugs. Returns each note with its frontmatter and markdown content.',
    parameters: GetNotesParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;

      const results = await Promise.all(
        params.slugs.map(async (slug) => {
          try {
            const note = await store.getNote(slug);
            return {
              slug,
              found: true as const,
              frontmatter: note.frontmatter,
              content: note.content,
            };
          } catch {
            return { slug, found: false as const };
          }
        })
      );

      const found = results.filter((r) => r.found);
      const notFound = results.filter((r) => !r.found);

      const textParts: string[] = [];
      for (const r of found) {
        if (r.found) {
          textParts.push(
            `# ${r.frontmatter.title}\nTags: ${r.frontmatter.tags.join(', ')}\n\n${r.content}`
          );
        }
      }
      if (notFound.length > 0) {
        textParts.push(`Not found: ${notFound.map((r) => r.slug).join(', ')}`);
      }

      return {
        content: [{ type: 'text', content: textParts.join('\n\n---\n\n') }],
        details: { results },
      };
    },
  };
}
