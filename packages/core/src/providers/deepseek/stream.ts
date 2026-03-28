import {
  createChatCompletionClient,
  createChatCompletionStream,
  getDeepSeekErrorDetails,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { Context, DeepSeekProviderOptions, Model } from '../../types/index.js';

const config: ChatStreamConfig<'deepseek'> = {
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) =>
    (usage as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens || 0,
  getErrorDetails: getDeepSeekErrorDetails,
};

export const streamDeepSeek: StreamFunction<'deepseek'> = (
  model: Model<'deepseek'>,
  context: Context,
  options: DeepSeekProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey, 'DeepSeek');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
