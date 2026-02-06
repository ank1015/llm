/**
 * OpenAI provider types
 */

import type { Response, ResponseCreateParamsBase } from 'openai/resources/responses/responses.js';

/**
 * OpenAI native response type
 */
export type OpenAINativeResponse = Response;

/**
 * Additional properties for OpenAI provider
 */
interface OpenAIProps {
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * OpenAI provider options
 *
 * Extends OpenAI's ResponseCreateParamsBase with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type OpenAIProviderOptions = Omit<ResponseCreateParamsBase, 'model' | 'input'> & OpenAIProps;
