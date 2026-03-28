/**
 * Z.AI provider types
 *
 * Z.AI uses OpenAI-compatible API with ChatCompletion format.
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions.js';

/**
 * Z.AI native response type (OpenAI ChatCompletion compatible)
 */
export type ZaiNativeResponse = ChatCompletion;

/**
 * Z.AI thinking configuration
 */
export interface ZaiThinkingConfig {
  type: 'enabled' | 'disabled';
  /** Whether to clear thinking content from previous turns */
  clear_thinking?: boolean;
}

/**
 * Additional properties for Z.AI provider
 */
interface ZaiProps {
  apiKey: string;
  signal?: AbortSignal;
  /** Thinking/reasoning configuration */
  thinking?: ZaiThinkingConfig;
}

/**
 * Z.AI provider options
 *
 * Extends OpenAI's ChatCompletionCreateParamsBase with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type ZaiProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> &
  ZaiProps;
