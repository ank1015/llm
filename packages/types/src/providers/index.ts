/**
 * Provider types index
 *
 * Re-exports all provider types and defines the type maps
 * for native responses and provider options.
 */

import type { Api } from "../api.js";

// Re-export all provider types
export type { AnthropicNativeResponse, AnthropicProviderOptions } from "./anthropic.js";
export type { DeepSeekNativeResponse, DeepSeekProviderOptions } from "./deepseek.js";
export type { GoogleNativeResponse, GoogleProviderOptions } from "./google.js";
export type { KimiNativeResponse, KimiProviderOptions, KimiThinkingConfig } from "./kimi.js";
export type { OpenAINativeResponse, OpenAIProviderOptions } from "./openai.js";
export type { ZaiNativeResponse, ZaiProviderOptions, ZaiThinkingConfig } from "./zai.js";

// Import native response types for the map
// Import provider options for the map
import type { AnthropicNativeResponse, AnthropicProviderOptions } from "./anthropic.js";
import type { DeepSeekNativeResponse, DeepSeekProviderOptions } from "./deepseek.js";
import type { GoogleNativeResponse, GoogleProviderOptions } from "./google.js";
import type { KimiNativeResponse, KimiProviderOptions } from "./kimi.js";
import type { OpenAINativeResponse, OpenAIProviderOptions } from "./openai.js";
import type { ZaiNativeResponse, ZaiProviderOptions } from "./zai.js";

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
	zai: ZaiNativeResponse;
	kimi: KimiNativeResponse;
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
	zai: ZaiProviderOptions;
	kimi: KimiProviderOptions;
}

/**
 * Get the options type for a specific API.
 */
export type OptionsForApi<TApi extends Api> = ApiOptionsMap[TApi];
