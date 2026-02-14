import type { Model } from '@ank1015/llm-types';

const codexBaseUrl = `https://chatgpt.com/backend-api/codex`;

export const codexModels = {
  'gpt-5.3-codex': {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    api: 'codex',
    baseUrl: codexBaseUrl,
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: {
      input: 1.75,
      output: 14,
      cacheRead: 0.175,
      cacheWrite: 0,
    },
    contextWindow: 400000,
    maxTokens: 128000,
    tools: ['function_calling'],
    excludeSettings: ['temperature', 'top_p', 'truncation', 'max_output_tokens'],
  } satisfies Model<'codex'>,
};
