/**
 * Central stream function
 *
 * Dispatches to the appropriate provider based on the API type.
 */

import type { Api, Context, Model, OptionsForApi } from '@ank1015/llm-types';
import { streamAnthropic } from '../providers/anthropic/stream.js';
import { streamDeepSeek } from '../providers/deepseek/stream.js';
import { streamGoogle } from '../providers/google/stream.js';
import { streamKimi } from '../providers/kimi/stream.js';
import { streamOpenAI } from '../providers/openai/stream.js';
import { streamZai } from '../providers/zai/stream.js';
import type { AssistantMessageEventStream } from '../utils/event-stream.js';

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
  switch (model.api) {
    case 'anthropic':
      return streamAnthropic(
        model as Model<'anthropic'>,
        context,
        options as OptionsForApi<'anthropic'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    case 'openai':
      return streamOpenAI(
        model as Model<'openai'>,
        context,
        options as OptionsForApi<'openai'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    case 'google':
      return streamGoogle(
        model as Model<'google'>,
        context,
        options as OptionsForApi<'google'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    case 'deepseek':
      return streamDeepSeek(
        model as Model<'deepseek'>,
        context,
        options as OptionsForApi<'deepseek'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    case 'zai':
      return streamZai(
        model as Model<'zai'>,
        context,
        options as OptionsForApi<'zai'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    case 'kimi':
      return streamKimi(
        model as Model<'kimi'>,
        context,
        options as OptionsForApi<'kimi'>,
        id
      ) as unknown as AssistantMessageEventStream<TApi>;

    default: {
      const _exhaustive: never = model.api;
      throw new Error(`Unsupported API: ${_exhaustive}`);
    }
  }
}
