import { Type } from '@sinclair/typebox';

import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

/** Callback that highlights text on a Chrome tab via the extension. */
export type HighlightText = (tabId: number, text: string) => Promise<string>;

const HighlightTextParams = Type.Object({
  text: Type.String({ description: 'The exact text to find and highlight on the page' }),
});

/**
 * Creates a highlight_text tool bound to a specific tab.
 *
 * The tool has one LLM-facing parameter: `text`. The tab ID is pre-configured.
 * When invoked it sends a highlightText request to the extension, which
 * injects a script to find, scroll to, and highlight the text on the page.
 */
export function createHighlightTextTool(
  tabId: number,
  highlightText: HighlightText
): AgentTool<typeof HighlightTextParams> {
  return {
    name: 'highlight_text',
    label: 'Highlight Text',
    description:
      'Finds and highlights specific text on the current browser page, then scrolls to it. ' +
      "Use this to draw the user's attention to a specific passage on the page they are viewing.",
    parameters: HighlightTextParams,

    execute: async (
      _toolCallId: string,
      params: { text: string }
    ): Promise<AgentToolResult<unknown>> => {
      const highlightedText = await highlightText(tabId, params.text);

      return {
        content: [{ type: 'text', content: `Successfully highlighted text: "${highlightedText}"` }],
        details: { tabId, text: highlightedText },
      };
    },
  };
}
