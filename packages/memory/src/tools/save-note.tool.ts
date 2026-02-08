/**
 * save_note — AgentTool for creating a new note in memory.
 */

import { Type } from '@sinclair/typebox';

import type { MemoryStore } from '../store/memory-store.js';
import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const SaveNoteParams = Type.Object({
  title: Type.String({ description: 'Title for the note' }),
  content: Type.String({ description: 'Markdown content of the note' }),
  tags: Type.Array(Type.String(), { description: 'Tags to categorize the note' }),
  source: Type.Optional(Type.String({ description: 'Source URL (blog, paper, etc.)' })),
});

export function createSaveNoteTool(store: MemoryStore): AgentTool<typeof SaveNoteParams> {
  return {
    name: 'save_note',
    label: 'Save Note',
    description:
      'Save a new note to the personal knowledge memory. Creates a markdown file with tags and optional source URL.',
    parameters: SaveNoteParams,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      void toolCallId;
      const note = await store.saveNote(params.title, params.content, params.tags, params.source);
      return {
        content: [{ type: 'text', content: `Note saved: ${note.slug}` }],
        details: { slug: note.slug, tags: note.frontmatter.tags },
      };
    },
  };
}
