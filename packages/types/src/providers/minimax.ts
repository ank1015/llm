/**
 * MiniMax provider types
 *
 * MiniMax exposes an Anthropic-compatible API, so we reuse
 * the Anthropic SDK types for native responses and params.
 */

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages.js';

/**
 * MiniMax native response type (Anthropic Message format)
 */
export type MiniMaxNativeResponse = Message;

/**
 * Additional properties for MiniMax provider
 */
interface MiniMaxProps {
  apiKey: string;
  signal?: AbortSignal;
  max_tokens?: number;
}

/**
 * MiniMax provider options
 *
 * Extends Anthropic's MessageCreateParams with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type MiniMaxProviderOptions = Omit<
  MessageCreateParamsNonStreaming,
  'model' | 'messages' | 'system' | 'max_tokens'
> &
  MiniMaxProps;
