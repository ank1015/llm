/**
 * Central complete function
 *
 * Delegates to stream() and drains events to produce the final result.
 * This avoids duplicating provider logic across separate complete implementations.
 */

import { stream } from './stream.js';

import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Complete a chat request using the specified provider.
 *
 * Internally calls stream() and drains all events, returning the final
 * assembled message. This ensures a single code path per provider.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Provider-specific options (must include apiKey)
 * @param id - Unique request ID
 * @returns The assistant message response
 */
export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: OptionsForApi<TApi>,
  id: string
): Promise<BaseAssistantMessage<TApi>> {
  return stream(model, context, options, id).drain();
}
