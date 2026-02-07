/**
 * SDK complete function
 *
 * Calls core's complete function with provider credentials from options or adapter.
 * Optionally tracks usage via UsageAdapter.
 */

import { complete as coreComplete } from '@ank1015/llm-core';

import { resolveProviderCredentials } from '../utils/resolve-key.js';

import type { KeysAdapter, UsageAdapter } from '../adapters/index.js';
import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Options for the complete function.
 */
export interface CompleteOptions<TApi extends Api> {
  /** Provider-specific options (credential fields optional if keysAdapter provided) */
  providerOptions?: Partial<OptionsForApi<TApi>>;
  /** Adapter for retrieving provider credentials */
  keysAdapter?: KeysAdapter;
  /** Adapter for tracking usage */
  usageAdapter?: UsageAdapter;
}

/**
 * Complete a chat request.
 *
 * Credential resolution:
 * 1. Use explicit credential fields from providerOptions
 * 2. Fill missing fields from keysAdapter
 * 3. Throw if required fields are still missing
 *
 * After completion, if usageAdapter is provided, tracks the usage.
 *
 * @deprecated Use {@link LLMClient.complete} instead for auto-wired adapter support.
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

  // Resolve provider credential fields
  const credentialOptions = await resolveProviderCredentials(
    model.api,
    providerOptions as Record<string, unknown>,
    keysAdapter
  );

  // Build final options with resolved credentials
  const finalOptions = {
    ...providerOptions,
    ...credentialOptions,
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
