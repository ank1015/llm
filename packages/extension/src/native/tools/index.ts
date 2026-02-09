import { createSaveNoteTool, createGetNotesTool, createSearchTool } from '@ank1015/llm-memory';

import { createExtractPageMarkdownTool } from './extract-page-markdown.tool.js';
import { createHighlightTextTool } from './highlight-text.tool.js';

import type { GetPageHtml } from './extract-page-markdown.tool.js';
import type { HighlightText } from './highlight-text.tool.js';
import type { MemoryStore } from '@ank1015/llm-memory';
import type { AgentTool } from '@ank1015/llm-types';

export type { GetPageHtml } from './extract-page-markdown.tool.js';
export { createExtractPageMarkdownTool } from './extract-page-markdown.tool.js';

export type { HighlightText } from './highlight-text.tool.js';
export { createHighlightTextTool } from './highlight-text.tool.js';

export interface CreateAgentToolsConfig {
  /** The Chrome tab ID this agent session is bound to */
  tabId: number;
  /** The URL of the tab this session is bound to */
  tabUrl: string;
  /** Callback to fetch page HTML from the extension for a given tab */
  getPageHtml: GetPageHtml;
  /** Callback to highlight text on the page via the extension */
  highlightText: HighlightText;
  /** Initialized MemoryStore instance for the memory tools */
  memoryStore: MemoryStore;
}

/**
 * Creates the full set of agent tools for an extension session.
 *
 * Returns 5 tools:
 *  - save_note (memory)
 *  - get_notes (memory)
 *  - search_memory (memory)
 *  - extract_page_markdown (extension)
 *  - highlight_text (extension)
 */
export function createAgentTools(config: CreateAgentToolsConfig): AgentTool[] {
  // AgentTool is contravariant on TParameters — specific tool types don't assign
  // to AgentTool<TSchema> directly. The runner validates args at runtime via AJV
  // so the cast is safe (same pattern as chat-app's tool array).
  return [
    createSaveNoteTool(config.memoryStore),
    createGetNotesTool(config.memoryStore),
    createSearchTool(config.memoryStore),
    createExtractPageMarkdownTool(config.tabId, config.tabUrl, config.getPageHtml),
    createHighlightTextTool(config.tabId, config.highlightText),
  ] as unknown as AgentTool[];
}
