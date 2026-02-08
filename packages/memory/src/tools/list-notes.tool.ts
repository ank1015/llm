/**
 * list_notes — AgentTool for browsing/filtering the note index.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const ListNotesParams = Type.Object({
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Filter by tags' })),
  query: Type.Optional(Type.String({ description: 'Filter by keyword in title' })),
});

export function createListNotesTool(store: MemoryStore): AgentTool<typeof ListNotesParams> {
  return {
    name: 'list_notes',
    label: 'List Notes',
    description: 'List all notes in memory, optionally filtered by tags or title keyword.',
    parameters: ListNotesParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;
      const notes = await store.listNotes({ tags: params.tags, query: params.query });
      const text =
        notes.length > 0
          ? notes.map((n) => `- ${n.slug} [${n.tags.join(', ')}] (${n.date})`).join('\n')
          : 'No notes found.';
      return {
        content: [{ type: 'text', content: text }],
        details: { count: notes.length, notes },
      };
    },
  };
}
