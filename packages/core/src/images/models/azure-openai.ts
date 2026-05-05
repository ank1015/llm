import type { ImageModel } from '../../types/index.js';

const azureOpenAIBaseUrl = '';
const azureOpenAIApi = 'azure-openai';

export const azureOpenAIImageModels = {
  'gpt-image-2': {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    api: azureOpenAIApi,
    baseUrl: azureOpenAIBaseUrl,
    input: ['text', 'image'],
    output: ['image'],
    cost: {
      inputText: 5,
      inputImage: 8,
      outputText: 10,
      outputImage: 32,
      reasoning: 10,
    },
  } satisfies ImageModel<typeof azureOpenAIApi>,
};
