import { Type } from '@sinclair/typebox';

import type { AgentTool, AgentToolResult } from '@ank1015/llm-types';

const CONVERTER_URL = 'http://localhost:8080/convert';

/** Callback that fetches page HTML from the Chrome extension for a given tab. */
export type GetPageHtml = (tabId: number) => Promise<string>;

interface ConvertResponse {
  markdown: string;
  success: boolean;
}

interface ConvertErrorResponse {
  error: string;
  details?: string;
  success: boolean;
}

const EmptyParams = Type.Object({});

/**
 * Creates an extract_page_markdown tool bound to a specific tab.
 *
 * The tool has no LLM-facing parameters — the tab ID and URL are pre-configured.
 * When invoked it fetches the page HTML from the extension, converts it
 * to markdown via the local converter service, and returns the result
 * with the source URL prepended.
 */
export function createExtractPageMarkdownTool(
  tabId: number,
  tabUrl: string,
  getPageHtml: GetPageHtml
): AgentTool<typeof EmptyParams> {
  return {
    name: 'extract_page_markdown',
    label: 'Extract Page Markdown',
    description:
      'Extracts the content of the current browser page as markdown. ' +
      'Use this to read and understand what the user is viewing.',
    parameters: EmptyParams,

    execute: async (
      _toolCallId: string,
      _params: Record<string, never>,
      signal?: AbortSignal
    ): Promise<AgentToolResult<unknown>> => {
      // 1. Get HTML from the Chrome extension
      const html = await getPageHtml(tabId);

      // 2. Convert to markdown via local service
      const response = await fetch(CONVERTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
        signal: signal ?? null,
      });

      if (!response.ok) {
        const body = (await response.json()) as ConvertErrorResponse;
        throw new Error(`HTML-to-markdown conversion failed: ${body.error}`);
      }

      const { markdown } = (await response.json()) as ConvertResponse;
      const content = `Source: ${tabUrl}\n\n${markdown}`;

      return {
        content: [{ type: 'text', content }],
        details: { tabId, tabUrl, htmlLength: html.length, markdownLength: markdown.length },
      };
    },
  };
}
