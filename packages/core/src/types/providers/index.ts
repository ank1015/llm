/**
 * Provider types index
 *
 * Re-exports all provider types and defines the type maps
 * for native responses and provider options.
 */

import type { Api } from '../api.js';
// Import native response types for the map
// Import provider options for the map
import type { AnthropicNativeResponse, AnthropicProviderOptions } from './anthropic.js';
import type { CerebrasNativeResponse, CerebrasProviderOptions } from './cerebras.js';
import type { ClaudeCodeNativeResponse, ClaudeCodeProviderOptions } from './claude-code.js';
import type { CodexNativeResponse, CodexProviderOptions } from './codex.js';
import type { DeepSeekNativeResponse, DeepSeekProviderOptions } from './deepseek.js';
import type { GoogleNativeResponse, GoogleProviderOptions } from './google.js';
import type { KimiNativeResponse, KimiProviderOptions } from './kimi.js';
import type { MiniMaxNativeResponse, MiniMaxProviderOptions } from './minimax.js';
import type { OpenAINativeResponse, OpenAIProviderOptions } from './openai.js';
import type { OpenRouterNativeResponse, OpenRouterProviderOptions } from './openrouter.js';
import type { ZaiNativeResponse, ZaiProviderOptions } from './zai.js';

// Re-export all provider types
export type { AnthropicNativeResponse, AnthropicProviderOptions } from './anthropic.js';
export type {
  CerebrasNativeResponse,
  CerebrasProviderOptions,
  CerebrasReasoningFormat,
} from './cerebras.js';
export type { ClaudeCodeNativeResponse, ClaudeCodeProviderOptions } from './claude-code.js';
export type { CodexNativeResponse, CodexProviderOptions } from './codex.js';
export type { DeepSeekNativeResponse, DeepSeekProviderOptions } from './deepseek.js';
export type { GoogleNativeResponse, GoogleProviderOptions } from './google.js';
export type { KimiNativeResponse, KimiProviderOptions, KimiThinkingConfig } from './kimi.js';
export type { MiniMaxNativeResponse, MiniMaxProviderOptions } from './minimax.js';
export type { OpenAINativeResponse, OpenAIProviderOptions } from './openai.js';
export type { OpenRouterNativeResponse, OpenRouterProviderOptions } from './openrouter.js';
export type { ZaiNativeResponse, ZaiProviderOptions, ZaiThinkingConfig } from './zai.js';

/**
 * Maps each API provider to its native response type.
 *
 * This preserves the original provider response structure,
 * allowing access to provider-specific fields.
 */
export interface ApiNativeResponseMap {
  openai: OpenAINativeResponse;
  google: GoogleNativeResponse;
  deepseek: DeepSeekNativeResponse;
  anthropic: AnthropicNativeResponse;
  codex: CodexNativeResponse;
  'claude-code': ClaudeCodeNativeResponse;
  zai: ZaiNativeResponse;
  kimi: KimiNativeResponse;
  minimax: MiniMaxNativeResponse;
  cerebras: CerebrasNativeResponse;
  openrouter: OpenRouterNativeResponse;
}

/**
 * Get the native response type for a specific API.
 */
export type NativeResponseForApi<TApi extends Api> = ApiNativeResponseMap[TApi];

/**
 * Maps each API provider to its options type.
 */
export interface ApiOptionsMap {
  openai: OpenAIProviderOptions;
  google: GoogleProviderOptions;
  deepseek: DeepSeekProviderOptions;
  anthropic: AnthropicProviderOptions;
  codex: CodexProviderOptions;
  'claude-code': ClaudeCodeProviderOptions;
  zai: ZaiProviderOptions;
  kimi: KimiProviderOptions;
  minimax: MiniMaxProviderOptions;
  cerebras: CerebrasProviderOptions;
  openrouter: OpenRouterProviderOptions;
}

/**
 * Get the options type for a specific API.
 */
export type OptionsForApi<TApi extends Api> = ApiOptionsMap[TApi];

/**
 * Makes apiKey optional in provider options.
 *
 * Use this at boundaries where apiKey is injected externally
 * (e.g., SDK services, agent runner) rather than provided directly.
 */
export type WithOptionalKey<T> = Omit<T, 'apiKey'> & { apiKey?: string };
