/**
 * Model types
 *
 * Defines the model configuration and provider types.
 */

import type { Api } from './api.js';
import type { OptionsForApi, WithOptionalKey } from './providers/index.js';

/**
 * Model definition with provider-specific configuration.
 *
 * @template TApi - The API provider type
 */
export interface Model<TApi extends Api> {
  /** Model identifier (e.g., "claude-sonnet-4-20250514") */
  id: string;
  /** Human-readable model name */
  name: string;
  /** API provider */
  api: TApi;
  /** Base URL for API requests */
  baseUrl: string;
  /** Whether the model supports reasoning/thinking */
  reasoning: boolean;
  /** Supported input types */
  input: ('text' | 'image' | 'file')[];
  /** Cost per million tokens */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  /** Maximum context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Custom headers for API requests */
  headers?: Record<string, string>;
  /** Supported tool types */
  tools: string[];
  /** Settings to exclude for this model */
  excludeSettings?: string[];
}

/**
 * Provider configuration combining model and options.
 *
 * @template TApi - The API provider type
 */
export interface Provider<TApi extends Api> {
  model: Model<TApi>;
  providerOptions?: WithOptionalKey<OptionsForApi<TApi>>;
}
