/**
 * Anthropic provider types
 */

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Anthropic native response type
 */
export type AnthropicNativeResponse = Message;

/**
 * Additional properties for Anthropic provider
 */
interface AnthropicProps {
  apiKey: string;
  signal?: AbortSignal;
  max_tokens?: number;
}

/**
 * Anthropic provider options
 *
 * Extends Anthropic's MessageCreateParams with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type AnthropicProviderOptions = Omit<
  MessageCreateParamsNonStreaming,
  'model' | 'messages' | 'system' | 'max_tokens'
> &
  AnthropicProps;
