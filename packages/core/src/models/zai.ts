import type { Model } from '../types/index.js';

export const zaiModels = {
  'glm-5': {
    id: 'glm-5',
    name: 'GLM-5',
    api: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 1,
      output: 3.2,
      cacheRead: 0.2,
      cacheWrite: 0,
    },
    contextWindow: 200000,
    maxTokens: 128000,
    tools: ['function_calling'],
  } satisfies Model<'zai'>,
};
