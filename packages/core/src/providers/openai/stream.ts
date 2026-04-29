import { streamOpenAIResponses } from './responses-stream.js';
import { buildParams, createClient, getMockOpenaiMessage } from './utils.js';

import type { Context, Model, OpenAIProviderOptions } from '../../types/index.js';
import type { StreamFunction } from '../../utils/types.js';

export const streamOpenAI: StreamFunction<'openai'> = (
  model: Model<'openai'>,
  context: Context,
  options: OpenAIProviderOptions,
  id: string
) => {
  return streamOpenAIResponses({
    model,
    context,
    options,
    id,
    providerName: 'OpenAI',
    createClient: (clientModel, clientOptions) => createClient(clientModel, clientOptions.apiKey),
    buildParams,
    getMockNativeMessage: getMockOpenaiMessage,
  });
};
