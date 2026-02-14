import {
  createChatCompletionClient,
  createChatCompletionStream,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { Context, OpenRouterProviderOptions, Model } from '@ank1015/llm-types';

const config: ChatStreamConfig<'openrouter'> = {
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) =>
    (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details
      ?.cached_tokens || 0,
};

export const streamOpenRouter: StreamFunction<'openrouter'> = (
  model: Model<'openrouter'>,
  context: Context,
  options: OpenRouterProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey, 'OpenRouter');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
