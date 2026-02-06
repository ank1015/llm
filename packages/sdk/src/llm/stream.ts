/**
 * SDK stream function
 *
 * Calls core's stream function with API key from options or adapter.
 * Optionally tracks usage via UsageAdapter.
 */

import { stream as coreStream } from '@ank1015/llm-core';

import { resolveApiKey } from '../utils/resolve-key.js';

import type { KeysAdapter, UsageAdapter } from '../adapters/types.js';
import type { AssistantMessageEventStream } from '@ank1015/llm-core';
import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Options for the stream function.
 */
export interface StreamOptions<TApi extends Api> {
  /** Provider-specific options (apiKey optional if keysAdapter provided) */
  providerOptions?: Partial<OptionsForApi<TApi>>;
  /** Adapter for retrieving API keys */
  keysAdapter?: KeysAdapter;
  /** Adapter for tracking usage */
  usageAdapter?: UsageAdapter;
}

/**
 * Stream a chat request.
 *
 * API key resolution:
 * 1. If providerOptions.apiKey is provided, use it
 * 2. Else if keysAdapter is provided, get key from adapter
 * 3. Else throw ApiKeyNotFoundError
 *
 * After streaming completes, if usageAdapter is provided, tracks the usage.
 *
 * Note: This function is async because it may need to resolve the API key from an adapter.
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

  // Resolve API key
  const apiKey = await resolveApiKey(
    model.api,
    providerOptions as Record<string, unknown>,
    keysAdapter
  );

  // Build final options with resolved API key
  const finalOptions = {
    ...providerOptions,
    apiKey,
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
