/**
 * Codex provider types
 */

import type { Response, ResponseCreateParamsBase } from 'openai/resources/responses/responses.js';

/**
 * Codex native response type
 */
export type CodexNativeResponse = Response;

/**
 * Additional properties for Codex provider
 */
interface CodexProps {
  apiKey: string;
  'chatgpt-account-id': string;
  instructions: string;
  signal?: AbortSignal;
}

interface UnsupportedCodexParams {
  stream?: never;
  store?: never;
  max_output_tokens?: never;
  temperature?: never;
  top_p?: never;
  truncation?: never;
}

/**
 * Codex provider options
 *
 * Extends OpenAI's ResponseCreateParamsBase with Codex credentials,
 * omitting fields managed by the provider implementation.
 */
export type CodexProviderOptions = Omit<ResponseCreateParamsBase, 'model' | 'input'> &
  CodexProps &
  UnsupportedCodexParams;
