import type { ImageModel } from '../../types/index.js';

const openaiBaseUrl = 'https://api.openai.com/v1';

export const openaiImageModels = {
  'gpt-image-1.5': {
    id: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    api: 'openai',
    baseUrl: openaiBaseUrl,
    input: ['text', 'image'],
    output: ['image'],
    cost: {
      inputText: 5,
      inputImage: 8,
      outputText: 10,
      outputImage: 32,
      reasoning: 10,
    },
  } satisfies ImageModel<'openai'>,
};
