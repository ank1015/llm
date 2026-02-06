/**
 * Shared utilities for OpenAI Chat Completions API-compatible providers.
 *
 * Used by: DeepSeek, Kimi, Z.AI
 */

import OpenAI from 'openai';

import type { Api, Model, StopReason, Tool } from '@ank1015/llm-types';
import type { ChatCompletion, ChatCompletionTool } from 'openai/resources/chat/completions.js';

/**
 * Creates an OpenAI-compatible client for Chat Completions providers.
 */
export function createChatCompletionClient<TApi extends Api>(
  model: Model<TApi>,
  apiKey: string,
  providerLabel: string
): OpenAI {
  if (!apiKey) {
    throw new Error(`${providerLabel} API key is required.`);
  }
  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
}

/**
 * Converts Tool[] to ChatCompletionTool[] for OpenAI Chat Completions API.
 */
export function convertChatTools(tools: readonly Tool[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

/**
 * Maps Chat Completions finish_reason to unified StopReason.
 * Superset mapping covering DeepSeek, Kimi, and Z.AI specific values.
 */
export function mapChatStopReason(finishReason: string | null | undefined): StopReason {
  if (!finishReason) return 'stop';

  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'toolUse';
    case 'sensitive':
    case 'content_filter':
    case 'network_error':
      return 'error';
    default:
      return 'stop';
  }
}

/**
 * Creates a mock ChatCompletion response for stream initialization.
 */
export function createMockChatCompletion(modelName: string): ChatCompletion {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: '',
          refusal: null,
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
