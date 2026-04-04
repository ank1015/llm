import type { ImageModel } from '../../types/index.js';

const googleBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';

export const googleImageModels = {
  'gemini-3.1-flash-image-preview': {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image'],
    output: ['text', 'image'],
    cost: {
      inputText: 0.5,
      inputImage: 0.5,
      outputText: 3,
      outputImage: 60,
      reasoning: 3,
    },
  } satisfies ImageModel<'google'>,
  'gemini-3-pro-image-preview': {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image'],
    output: ['text', 'image'],
    cost: {
      inputText: 2,
      inputImage: 2,
      outputText: 12,
      outputImage: 120,
      reasoning: 12,
    },
  } satisfies ImageModel<'google'>,
};
