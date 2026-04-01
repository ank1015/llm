/**
 * Central stream function
 *
 * Dispatches to the appropriate provider via the provider registry.
 */

import { getProviderStream } from '../providers/registry.js';

import type { AssistantMessageEventStream } from '../utils/event-stream.js';
import type { Api, Context, Model, OptionsForApi } from '../types/index.js';

/**
 * Stream a chat request using the specified provider.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Provider-specific options (must include apiKey)
 * @param id - Unique request ID
 * @returns An event stream of assistant message events
 */
export function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: OptionsForApi<TApi>,
  id: string
): AssistantMessageEventStream<TApi> {
  const providerStream = getProviderStream(model.api);
  if (!providerStream) {
    throw new Error(
      `Unsupported API: ${model.api}. Use registerProvider() to add custom providers.`
    );
  }
  return providerStream(model, context, options, id) as AssistantMessageEventStream<TApi>;
}
