import {
  createChatCompletionClient,
  createChatCompletionStream,
  createMockChatCompletion,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { Context, DeepSeekProviderOptions, Model } from '@ank1015/llm-types';

const config: ChatStreamConfig<'deepseek'> = {
  getMockMessage: () => createMockChatCompletion('deepseek-chat'),
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) =>
    (usage as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens || 0,
};

export const streamDeepSeek: StreamFunction<'deepseek'> = (
  model: Model<'deepseek'>,
  context: Context,
  options: DeepSeekProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey!, 'DeepSeek');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
