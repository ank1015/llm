import {
  createChatCompletionClient,
  createChatCompletionStream,
  createMockChatCompletion,
  mapChatStopReason,
} from '../utils/index.js';

import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { ChatStreamConfig } from '../utils/index.js';
import type { Context, KimiProviderOptions, Model } from '@ank1015/llm-types';

const config: ChatStreamConfig<'kimi'> = {
  getMockMessage: () => createMockChatCompletion('kimi-k2.5'),
  mapStopReason: mapChatStopReason,
  extractCacheTokens: (usage) => (usage as { cached_tokens?: number }).cached_tokens || 0,
  // Kimi requires stream_options to include usage in stream
  streamParams: { stream_options: { include_usage: true } },
  // Kimi may report usage on either chunk.usage or choice.usage
  resolveUsage: (chunk, choice) =>
    (chunk.usage || (choice as { usage?: unknown }).usage) as Record<string, unknown> | undefined,
};

export const streamKimi: StreamFunction<'kimi'> = (
  model: Model<'kimi'>,
  context: Context,
  options: KimiProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey!, 'Kimi');
  const params = buildParams(model, context, options);
  return createChatCompletionStream(config, client, params, model, context, options?.signal, id);
};
