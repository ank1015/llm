/**
 * SDK complete function
 *
 * Calls core's complete function with API key from options or adapter.
 * Optionally tracks usage via UsageAdapter.
 */

import { complete as coreComplete } from '@ank1015/llm-core';
import { ApiKeyNotFoundError } from '@ank1015/llm-types';

import type { KeysAdapter, UsageAdapter } from '../adapters/types.js';
import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Options for the complete function.
 */
export interface CompleteOptions<TApi extends Api> {
  /** Provider-specific options (apiKey optional if keysAdapter provided) */
  providerOptions?: Partial<OptionsForApi<TApi>>;
  /** Adapter for retrieving API keys */
  keysAdapter?: KeysAdapter;
  /** Adapter for tracking usage */
  usageAdapter?: UsageAdapter;
}

/**
 * Complete a chat request.
 *
 * API key resolution:
 * 1. If providerOptions.apiKey is provided, use it
 * 2. Else if keysAdapter is provided, get key from adapter
 * 3. Else throw ApiKeyNotFoundError
 *
 * After completion, if usageAdapter is provided, tracks the usage.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Complete options including adapters
 * @param id - Unique request ID
 * @returns The assistant message response
 */
export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: CompleteOptions<TApi> = {},
  id?: string
): Promise<BaseAssistantMessage<TApi>> {
  const { providerOptions = {}, keysAdapter, usageAdapter } = options;

  // Resolve API key
  let apiKey: string | undefined;
  if ('apiKey' in providerOptions && providerOptions.apiKey) {
    apiKey = providerOptions.apiKey as string;
  } else if (keysAdapter) {
    apiKey = await keysAdapter.get(model.api);
  }

  if (!apiKey) {
    throw new ApiKeyNotFoundError(model.api);
  }

  // Build final options with resolved API key
  const finalOptions = {
    ...providerOptions,
    apiKey,
  } as OptionsForApi<TApi>;

  // Generate request ID
  const requestId = id ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  // Call core's complete
  const message = await coreComplete(model, context, finalOptions, requestId);

  // Track usage if adapter provided
  if (usageAdapter) {
    await usageAdapter.track(message);
  }

  return message;
}
