/**
 * OpenRouter provider types
 *
 * OpenRouter is an OpenAI-compatible meta-router that provides access to
 * hundreds of models through a unified API. Model IDs use provider/model
 * format (e.g., openai/gpt-4o, anthropic/claude-sonnet-4).
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions.js';

/**
 * OpenRouter native response type (OpenAI ChatCompletion compatible)
 */
export type OpenRouterNativeResponse = ChatCompletion;

/**
 * Additional properties for OpenRouter provider
 */
interface OpenRouterProps {
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * OpenRouter provider options
 *
 * Extends OpenAI's ChatCompletionCreateParamsBase with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type OpenRouterProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> &
  OpenRouterProps;
