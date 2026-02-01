/**
 * Google (Gemini) provider types
 */

import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';

/**
 * Google native response type
 */
export type GoogleNativeResponse = GenerateContentResponse;

/**
 * Additional properties for Google provider
 */
interface GoogleProps {
  apiKey?: string;
  signal?: AbortSignal;
}

/**
 * Google provider options
 *
 * Extends Google's GenerateContentConfig with custom properties,
 * omitting fields that are managed by the gateway.
 */
export type GoogleProviderOptions = Omit<GenerateContentConfig, 'abortSignal' | 'systemPrompt'> &
  GoogleProps;
