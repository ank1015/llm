import { streamOpenAIResponses } from '../openai/responses-stream.js';

import { buildParams, createClient, getMockAzureOpenAIMessage } from './utils.js';

import type { AzureOpenAIProviderOptions, Context, Model } from '../../types/index.js';
import type { StreamFunction } from '../../utils/types.js';

export const streamAzureOpenAI: StreamFunction<'azure-openai'> = (
  model: Model<'azure-openai'>,
  context: Context,
  options: AzureOpenAIProviderOptions,
  id: string
) => {
  return streamOpenAIResponses({
    model,
    context,
    options,
    id,
    providerName: 'Azure OpenAI',
    createClient,
    buildParams,
    getMockNativeMessage: getMockAzureOpenAIMessage,
  });
};
