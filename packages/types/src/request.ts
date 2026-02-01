/**
 * Request types for LLM API endpoints
 */

import type { Api } from './api.js';
import type { OptionsForApi } from './providers/index.js';
import type { Content } from './content.js';
import type { Message } from './message.js';
import type { Tool } from './tool.js';

/**
 * Request body for /messages/complete and /messages/stream endpoints.
 *
 * @template TApi - The API provider type
 */
export interface MessageRequest<TApi extends Api = Api> {
  /** API provider to use */
  api: TApi;
  /** Model ID to use */
  modelId: string;
  /** Conversation messages */
  messages: Message[];
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Available tools for the model */
  tools?: Tool[];
  /** Provider-specific options (excluding apiKey which is managed by server) */
  providerOptions?: Omit<OptionsForApi<TApi>, 'apiKey' | 'signal'>;
}

/**
 * Simplified request with just content (for single-turn requests).
 */
export interface SimpleMessageRequest<TApi extends Api = Api> {
  /** API provider to use */
  api: TApi;
  /** Model ID to use */
  modelId: string;
  /** User message content */
  content: Content;
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Available tools for the model */
  tools?: Tool[];
  /** Provider-specific options */
  providerOptions?: Omit<OptionsForApi<TApi>, 'apiKey' | 'signal'>;
}
