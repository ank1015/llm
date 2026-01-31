/**
 * DeepSeek provider types
 *
 * DeepSeek uses OpenAI-compatible API with ChatCompletion format.
 */

import type { ChatCompletion, ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.js";

/**
 * DeepSeek native response type (OpenAI ChatCompletion compatible)
 */
export type DeepSeekNativeResponse = ChatCompletion;

/**
 * Additional properties for DeepSeek provider
 */
interface DeepSeekProps {
	apiKey?: string;
	signal?: AbortSignal;
}

/**
 * DeepSeek provider options
 *
 * Extends OpenAI's ChatCompletionCreateParamsBase with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type DeepSeekProviderOptions = Omit<ChatCompletionCreateParamsBase, "model" | "messages"> & DeepSeekProps;
