import type { Model } from '@ank1015/llm-types';

const anthropicBaseUrl = `https://api.anthropic.com`;
const claudeCodeApi = 'claude-code' as const;

export const claudeCodeModels = {
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    api: claudeCodeApi,
    baseUrl: anthropicBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 1,
      output: 5,
      cacheRead: 0.1,
      cacheWrite: 1.25,
    },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'claude-code'>,
  'claude-opus-4-6': {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    api: claudeCodeApi,
    baseUrl: anthropicBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'claude-code'>,
  'claude-sonnet-4-6': {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    api: claudeCodeApi,
    baseUrl: anthropicBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
    },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  } satisfies Model<'claude-code'>,
};
