/**
 * Cerebras provider types
 *
 * Cerebras uses OpenAI-compatible API with ChatCompletion format.
 * Hosts multiple model families (Llama, GPT-OSS, Qwen, GLM) with
 * ultra-fast inference and automatic prompt caching.
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions.js';

/**
 * Cerebras native response type (OpenAI ChatCompletion compatible)
 */
export type CerebrasNativeResponse = ChatCompletion;

/**
 * Cerebras reasoning format.
 *
 * - `parsed` — reasoning in separate `reasoning` field
 * - `raw` — reasoning prepended to content (GLM/Qwen use `<think>` tags)
 * - `hidden` — reasoning dropped from response (tokens still counted)
 * - `none` — model default behavior
 */
export type CerebrasReasoningFormat = 'parsed' | 'raw' | 'hidden' | 'none';

/**
 * Additional properties for Cerebras provider
 */
interface CerebrasProps {
  apiKey: string;
  signal?: AbortSignal;
  /** Controls how reasoning text appears in responses */
  reasoning_format?: CerebrasReasoningFormat;
  /** Reasoning effort for GPT-OSS models: low | medium | high */
  reasoning_effort?: 'low' | 'medium' | 'high';
  /** Disable reasoning for GLM models */
  disable_reasoning?: boolean;
}

/**
 * Cerebras provider options
 *
 * Extends OpenAI's ChatCompletionCreateParamsBase with Cerebras-specific
 * reasoning and inference parameters.
 */
export type CerebrasProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> &
  CerebrasProps;
