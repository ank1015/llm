import type { Model } from '@ank1015/llm-types';

const minimaxBaseUrl = `https://api.minimax.io/anthropic`;

export const minimaxModels = {
  'MiniMax-M2.5': {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.03,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
  'MiniMax-M2.5-highspeed': {
    id: 'MiniMax-M2.5-highspeed',
    name: 'MiniMax M2.5 Highspeed',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.3,
      output: 2.4,
      cacheRead: 0.03,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
  'MiniMax-M2.1': {
    id: 'MiniMax-M2.1',
    name: 'MiniMax M2.1',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.03,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
  'MiniMax-M2.1-highspeed': {
    id: 'MiniMax-M2.1-highspeed',
    name: 'MiniMax M2.1 Highspeed',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.3,
      output: 2.4,
      cacheRead: 0.03,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
};
