import type { Model } from '../types/index.js';

export const kimiModels = {
  'kimi-k2.5': {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    api: 'kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 0.6,
      output: 3.0,
      cacheRead: 0.1,
      cacheWrite: 0,
    },
    contextWindow: 262144,
    maxTokens: 32768,
    tools: ['function_calling'],
  } satisfies Model<'kimi'>,
};
