import type { Model } from '../types/index.js';

const cerebrasBaseUrl = `https://api.cerebras.ai/v1`;

export const cerebrasModels = {
  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B',
    api: 'cerebras',
    baseUrl: cerebrasBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.35,
      output: 0.75,
      cacheRead: 0.35,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 16384,
    tools: ['function_calling'],
  } satisfies Model<'cerebras'>,
  'zai-glm-4.7': {
    id: 'zai-glm-4.7',
    name: 'Z.AI GLM 4.7',
    api: 'cerebras',
    baseUrl: cerebrasBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 2.25,
      output: 2.75,
      cacheRead: 2.25,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 16384,
    tools: ['function_calling'],
  } satisfies Model<'cerebras'>,
};
