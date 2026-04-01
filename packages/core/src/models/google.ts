import type { Model } from '../types/index.js';

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
  'gemini-3.1-flash-lite-preview': {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Gemini 3.1 Flash Lite Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 0.25,
      output: 1.5,
      cacheRead: 0.025,
      cacheWrite: 0,
    },
    contextWindow: 1048576,
    maxTokens: 65536,
    tools: ['function_calling'],
  } satisfies Model<'google'>,
};
