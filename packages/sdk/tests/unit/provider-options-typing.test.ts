import { describe, expect, it } from 'vitest';

import type { AgentInput, LlmInput, ProviderOptionsForModelId } from '../../src/index.js';

const anthropicOverride = {
  max_tokens: 256,
  thinking: { type: 'adaptive' as const },
};

const openAiOverride = {
  max_output_tokens: 128,
  reasoning: {
    effort: 'low' as const,
    summary: 'auto' as const,
  },
};

const _anthropicLlmInput: LlmInput<'anthropic/claude-sonnet-4-6'> = {
  modelId: 'anthropic/claude-sonnet-4-6',
  messages: [],
  overrideProviderSetting: anthropicOverride,
};

const _openAiAgentInput: AgentInput<'openai/gpt-5.4-mini'> = {
  modelId: 'openai/gpt-5.4-mini',
  inputMessages: [],
  overrideProviderSetting: openAiOverride,
};

const _googleProviderOptions: Partial<ProviderOptionsForModelId<'google/gemini-3-flash-preview'>> = {
  thinkingConfig: {
    thinkingLevel: 'LOW',
  },
};

// @ts-expect-error anthropic thinking options should not be accepted for openai model ids
const _invalidOpenAiLlmInput: LlmInput<'openai/gpt-5.4-mini'> = {
  modelId: 'openai/gpt-5.4-mini',
  messages: [],
  overrideProviderSetting: anthropicOverride,
};

// @ts-expect-error openai reasoning options should not be accepted for anthropic model ids
const _invalidAnthropicAgentInput: AgentInput<'anthropic/claude-sonnet-4-6'> = {
  modelId: 'anthropic/claude-sonnet-4-6',
  inputMessages: [],
  overrideProviderSetting: openAiOverride,
};

describe('provider option typing', () => {
  it('keeps model-specific overrideProviderSetting typing compile-safe', () => {
    expect(true).toBe(true);
  });
});
