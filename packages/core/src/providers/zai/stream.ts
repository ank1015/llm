import {
  createChatCompletionClient,
  createChatCompletionStream,
  createMockChatCompletion,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { Context, Model, ZaiProviderOptions } from '@ank1015/llm-types';

const config: ChatStreamConfig<'zai'> = {
  getMockMessage: () => createMockChatCompletion('glm-4.7'),
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) =>
    (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details
      ?.cached_tokens || 0,
};

export const streamZai: StreamFunction<'zai'> = (
  model: Model<'zai'>,
  context: Context,
  options: ZaiProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey, 'Z.AI');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
