/**
 * Kimi provider types
 *
 * Kimi uses OpenAI-compatible API with ChatCompletion format.
 */

import type {
  ChatCompletion,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions.js';

/**
 * Kimi native response type (OpenAI ChatCompletion compatible)
 */
export type KimiNativeResponse = ChatCompletion;

/**
 * Kimi thinking configuration
 */
export interface KimiThinkingConfig {
  type: 'enabled' | 'disabled';
}

/**
 * Additional properties for Kimi provider
 */
interface KimiProps {
  apiKey?: string;
  signal?: AbortSignal;
  /** Thinking/reasoning configuration */
  thinking?: KimiThinkingConfig;
}

/**
 * Kimi provider options
 *
 * Extends OpenAI's ChatCompletionCreateParamsBase with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type KimiProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> &
  KimiProps;
