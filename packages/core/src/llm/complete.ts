/**
 * Central complete function
 *
 * Dispatches to the appropriate provider based on the API type.
 */

import { completeAnthropic } from '../providers/anthropic/complete.js';
import { completeDeepSeek } from '../providers/deepseek/complete.js';
import { completeGoogle } from '../providers/google/complete.js';
import { completeKimi } from '../providers/kimi/complete.js';
import { completeOpenAI } from '../providers/openai/complete.js';
import { completeZai } from '../providers/zai/complete.js';

import type { Api, BaseAssistantMessage, Context, Model, OptionsForApi } from '@ank1015/llm-types';

/**
 * Complete a chat request using the specified provider.
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
  switch (model.api) {
    case 'anthropic':
      return completeAnthropic(
        model as Model<'anthropic'>,
        context,
        options as OptionsForApi<'anthropic'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    case 'openai':
      return completeOpenAI(
        model as Model<'openai'>,
        context,
        options as OptionsForApi<'openai'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    case 'google':
      return completeGoogle(
        model as Model<'google'>,
        context,
        options as OptionsForApi<'google'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    case 'deepseek':
      return completeDeepSeek(
        model as Model<'deepseek'>,
        context,
        options as OptionsForApi<'deepseek'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    case 'zai':
      return completeZai(
        model as Model<'zai'>,
        context,
        options as OptionsForApi<'zai'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    case 'kimi':
      return completeKimi(
        model as Model<'kimi'>,
        context,
        options as OptionsForApi<'kimi'>,
        id
      ) as Promise<BaseAssistantMessage<TApi>>;

    default: {
      const _exhaustive: never = model.api;
      throw new Error(`Unsupported API: ${_exhaustive}`);
    }
  }
}
