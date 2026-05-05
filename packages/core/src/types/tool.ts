/**
 * Tool types
 *
 * Defines tool/function calling types for LLM interactions.
 */

import type { Message } from './message.js';
import type { TSchema } from '@sinclair/typebox';

export interface CustomToolFormat {
  type: 'grammar';
  syntax: 'lark';
  definition: string;
}

/**
 * Tool definition with TypeBox schema for parameters.
 *
 * @template TParameters - TypeBox schema type for parameters
 * @template TName - String literal type for tool name
 */
export interface Tool<TParameters extends TSchema = TSchema, TName extends string = string> {
  /** Unique tool name */
  name: TName;
  /** Description of what the tool does (shown to the model) */
  description: string;
  /** TypeBox schema defining the tool's parameters */
  parameters: TParameters;
  /** Tool transport type. Defaults to function calling. */
  type?: 'function' | 'custom';
  /** Custom/freeform tool input format. */
  format?: CustomToolFormat;
  /** Provider strict-schema setting for function tools. Defaults to provider behavior. */
  strict?: boolean | null;
}

export function isCustomTool(
  tool: Tool
): tool is Tool & { type: 'custom'; format: CustomToolFormat } {
  return tool.type === 'custom' && tool.format !== undefined;
}

/**
 * Context for LLM requests.
 * Contains messages, system prompt, and available tools.
 */
export interface Context {
  /** Conversation messages */
  messages: Message[];
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Available tools for the model to use */
  tools?: Tool[];
}
