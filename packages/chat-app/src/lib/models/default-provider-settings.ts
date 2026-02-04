import type { Api } from '@ank1015/llm-sdk';

const defaultOpenaiProviderOptions = {
  reasoning: {
    effort: 'xhigh',
    summary: 'detailed',
  },
};

const defaultGoogleProviderOptions = {
  thinkingConfig: {
    thinkingLevel: 'HIGH',
    includeThoughts: true,
  },
};

const defaultAnthropicProviderOptions = {
  thinking: {
    type: 'enabled',
    budget_tokens: 8000,
  },
};

const defaultDeepseekProviderOptions = {};

const defaultZAIProviderOptions = {
  thinking: {
    type: 'enabled',
    clear_thinking: false,
  },
};

const defaultKimiProviderOptions = {
  thinking: {
    type: 'enabled',
  },
};

export function getDefaultProviderSettingsForApi(api: Api): Record<string, unknown> {
  switch (api) {
    case 'anthropic':
      return defaultAnthropicProviderOptions;
    case 'deepseek':
      return defaultDeepseekProviderOptions;
    case 'google':
      return defaultGoogleProviderOptions;
    case 'kimi':
      return defaultKimiProviderOptions;
    case 'openai':
      return defaultOpenaiProviderOptions;
    case 'zai':
      return defaultZAIProviderOptions;
  }
}
