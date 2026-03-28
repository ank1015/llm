import {
  createChatCompletionClient,
  createChatCompletionStream,
  getCerebrasErrorDetails,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { CerebrasProviderOptions, Context, Model } from '../../types/index.js';

const config: ChatStreamConfig<'cerebras'> = {
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) =>
    (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details
      ?.cached_tokens || 0,
  // Cerebras requires stream_options to include usage in stream
  streamParams: { stream_options: { include_usage: true } },
  getErrorDetails: getCerebrasErrorDetails,
};

export const streamCerebras: StreamFunction<'cerebras'> = (
  model: Model<'cerebras'>,
  context: Context,
  options: CerebrasProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey, 'Cerebras');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
