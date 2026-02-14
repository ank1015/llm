import type { Model } from '@ank1015/llm-types';

export const zaiModels = {
  'glm-4.7': {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    api: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4/',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.43,
      output: 1.75,
      cacheRead: 0.08,
      cacheWrite: 0,
    },
    contextWindow: 200000,
    maxTokens: 131072,
    tools: ['function_calling'],
  } satisfies Model<'zai'>,
};
