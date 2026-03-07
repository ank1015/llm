import {
  GoogleThinkingLevel,
  type Api,
  type ClaudeCodeProviderOptions,
  type CodexProviderOptions,
  type GoogleProviderOptions,
} from '@ank1015/llm-sdk';

import type { ReasoningLevel } from './types.js';

function createCodexProviderOptions(reasoningLevel: ReasoningLevel): CodexProviderOptions {
  return {
    reasoning: {
      effort: reasoningLevel,
      summary: 'detailed',
    },
  } as CodexProviderOptions;
}

function createClaudeCodeProviderOptions(
  reasoningLevel: ReasoningLevel
): ClaudeCodeProviderOptions {
  return {
    output_config: {
      effort: reasoningLevel === 'xhigh' ? 'max' : reasoningLevel,
    },
  } as ClaudeCodeProviderOptions;
}

function createGoogleProviderOptions(reasoningLevel: ReasoningLevel): GoogleProviderOptions {
  const thinkingLevelMap: Record<ReasoningLevel, GoogleThinkingLevel> = {
    low: GoogleThinkingLevel.LOW,
    medium: GoogleThinkingLevel.MEDIUM,
    high: GoogleThinkingLevel.HIGH,
    xhigh: GoogleThinkingLevel.HIGH,
  };

  return {
    thinkingConfig: {
      thinkingLevel: thinkingLevelMap[reasoningLevel],
      includeThoughts: true,
    },
  } as GoogleProviderOptions;
}

export function createProviderOptions(
  api: Api,
  reasoningLevel: ReasoningLevel
): Record<string, unknown> {
  switch (api) {
    case 'codex':
      return createCodexProviderOptions(reasoningLevel) as unknown as Record<string, unknown>;
    case 'claude-code':
      return createClaudeCodeProviderOptions(reasoningLevel) as unknown as Record<string, unknown>;
    case 'google':
      return createGoogleProviderOptions(reasoningLevel) as unknown as Record<string, unknown>;
    default:
      return {};
  }
}
