import type { Model } from '../types/index.js';

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
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.3,
      output: 1.2,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
  'MiniMax-M2.7-highspeed': {
    id: 'MiniMax-M2.7-highspeed',
    name: 'MiniMax M2.7 Highspeed',
    api: 'minimax',
    baseUrl: minimaxBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    contextWindow: 204800,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'minimax'>,
};
