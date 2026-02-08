/**
 * get_note — AgentTool for reading a note's full content by slug.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const GetNoteParams = Type.Object({
  slug: Type.String({ description: 'The slug (filename without .md) of the note to retrieve' }),
});

export function createGetNoteTool(store: MemoryStore): AgentTool<typeof GetNoteParams> {
  return {
    name: 'get_note',
    label: 'Get Note',
    description: 'Retrieve the full content of a note by its slug.',
    parameters: GetNoteParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;
      const note = await store.getNote(params.slug);
      return {
        content: [{ type: 'text', content: note.content }],
        details: { slug: note.slug, frontmatter: note.frontmatter },
      };
    },
  };
}
