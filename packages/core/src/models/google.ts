import type { Model } from '@ank1015/llm-types';

const googleBaseUrl = `https://generativelanguage.googleapis.com/v1beta`;

export const googleModels = {
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 2,
      output: 12,
      cacheRead: 0.2,
      cacheWrite: 0,
    },
    contextWindow: 1048576,
    maxTokens: 65536,
    tools: ['function_calling'],
  } satisfies Model<'google'>,
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 0.5,
      output: 3,
      cacheRead: 0.05,
      cacheWrite: 0,
    },
    contextWindow: 1048576,
    maxTokens: 65536,
    tools: ['function_calling'],
  } satisfies Model<'google'>,
  'gemini-3-pro-image-preview': {
    id: 'gemini-3-pro-image-preview',
    name: 'Nano Banana',
    api: 'google',
    baseUrl: googleBaseUrl,
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 2,
      output: 12,
      cacheRead: 2,
      cacheWrite: 0,
    },
    contextWindow: 65536,
    maxTokens: 32768,
    tools: [],
  } satisfies Model<'google'>,
};
