import type { Model } from '../types/index.js';

export const deepseekModels = {
  deepseek: {
    id: 'deepseek-reasoner',
    name: 'Deepseek V3.2',
    api: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.28,
      output: 0.42,
      cacheRead: 0.028,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'deepseek'>,
};
