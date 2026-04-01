/**
 * Claude Code provider types
 */

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Claude Code native response type
 */
export type ClaudeCodeNativeResponse = Message;

/**
 * Additional properties for Claude Code provider
 */
interface ClaudeCodeProps {
  oauthToken: string;
  betaFlag: string;
  billingHeader: string;
  signal?: AbortSignal;
  max_tokens?: number;
}

/**
 * Claude Code provider options
 *
 * Extends Anthropic's MessageCreateParams with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type ClaudeCodeProviderOptions = Omit<
  MessageCreateParamsNonStreaming,
  'model' | 'messages' | 'system' | 'max_tokens'
> &
  ClaudeCodeProps;
