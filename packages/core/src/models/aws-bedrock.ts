import type { Model } from '../types/index.js';

const awsBedrockBaseUrl = '';
const awsBedrockApi = 'aws-bedrock';

export const awsBedrockModels = {
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    name: 'Claude Haiku 4.5',
    api: awsBedrockApi,
    baseUrl: awsBedrockBaseUrl,
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
  } satisfies Model<typeof awsBedrockApi>,
  'anthropic.claude-opus-4-6-v1': {
    id: 'anthropic.claude-opus-4-6-v1',
    name: 'Claude Opus 4.6',
    api: awsBedrockApi,
    baseUrl: awsBedrockBaseUrl,
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
  } satisfies Model<typeof awsBedrockApi>,
  'anthropic.claude-sonnet-4-6': {
    id: 'anthropic.claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: awsBedrockApi,
    baseUrl: awsBedrockBaseUrl,
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
  } satisfies Model<typeof awsBedrockApi>,
};
