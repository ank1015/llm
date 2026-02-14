/**
 * SDK stream function
 *
 * Calls core's stream function with provider credentials from options or adapter.
 * Optionally tracks usage via UsageAdapter.
 */

import { stream as coreStream } from '@ank1015/llm-core';

import { resolveProviderCredentials } from '../utils/resolve-key.js';

import type { KeysAdapter, UsageAdapter } from '../adapters/index.js';
import type { AssistantMessageEventStream } from '@ank1015/llm-core';
import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Options for the stream function.
 */
export interface StreamOptions<TApi extends Api> {
  /** Provider-specific options (credential fields optional if keysAdapter provided) */
  providerOptions?: Partial<OptionsForApi<TApi>>;
  /** Adapter for retrieving provider credentials */
  keysAdapter?: KeysAdapter;
  /** Adapter for tracking usage */
  usageAdapter?: UsageAdapter;
}

/**
 * Stream a chat request.
 *
 * Credential resolution:
 * 1. Use explicit credential fields from providerOptions
 * 2. Fill missing fields from keysAdapter
 * 3. Throw if required fields are still missing
 *
 * After streaming completes, if usageAdapter is provided, tracks the usage.
 *
 * Note: This function is async because it may need to resolve credentials from an adapter.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Stream options including adapters
 * @param id - Unique request ID
 * @returns An event stream of assistant message events
 */
export async function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: StreamOptions<TApi> = {},
  id?: string
): Promise<AssistantMessageEventStream<TApi>> {
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

  // Call core's stream
  const eventStream = coreStream(model, context, finalOptions, requestId);

  // If usage adapter is provided, track usage when stream completes
  if (usageAdapter) {
    // Wrap the result promise to track usage
    const originalResult = eventStream.result.bind(eventStream);
    eventStream.result = async (): Promise<BaseAssistantMessage<TApi>> => {
      const message = await originalResult();
      await usageAdapter.track(message);
      return message;
    };
  }

  return eventStream;
}
