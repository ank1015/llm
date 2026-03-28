import Anthropic from '@anthropic-ai/sdk';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import {
  buildAnthropicMessages,
  getMockAnthropicMessage,
  mapStopReason,
} from '../anthropic/utils.js';

import type { ClaudeCodeProviderOptions, Context, Model, Tool } from '../../types/index.js';
import type {
  Message as AnthropicMessage,
  MessageCreateParamsBase,
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages.js';

export function createClient(model: Model<'claude-code'>, options: ClaudeCodeProviderOptions) {
  if (!options.oauthToken) {
    throw new Error('Claude Code oauthToken is required.');
  }
  if (!options.betaFlag) {
    throw new Error('Claude Code betaFlag is required.');
  }

  const defaultHeaders = {
    authorization: `Bearer ${options.oauthToken}`,
    'x-api-key': '',
    'anthropic-beta': options.betaFlag,
    ...(model.headers || {}),
  };

  return new Anthropic({
    apiKey: 'dummy',
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders,
  });
}

export function buildParams(
  model: Model<'claude-code'>,
  context: Context,
  options: ClaudeCodeProviderOptions
): MessageCreateParamsBase {
  if (!options.billingHeader) {
    throw new Error('Claude Code billingHeader is required.');
  }

  const messages = buildClaudeCodeMessages(model, context);
  const { oauthToken, betaFlag, billingHeader, signal, ...claudeCodeOptions } = options;

  const params: MessageCreateParamsBase = {
    ...claudeCodeOptions,
    model: model.id,
    messages,
    max_tokens: claudeCodeOptions.max_tokens || model.maxTokens,
    stream: false,
  };

  const system: TextBlockParam[] = [
    {
      type: 'text',
      text: sanitizeSurrogates(billingHeader),
    },
  ];

  if (context.systemPrompt) {
    system.push({
      type: 'text',
      text: sanitizeSurrogates(context.systemPrompt),
    });
  }

  params.system = system;

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    const tools = convertTools(context.tools);
    params.tools = tools;
  }

  return params;
}

export function buildClaudeCodeMessages(
  model: Model<'claude-code'>,
  context: Context
): MessageParam[] {
  return buildAnthropicMessages(model as unknown as Model<'anthropic'>, context);
}

function convertTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  if (!tools) return [];

  return tools.map((tool) => {
    const jsonSchema = tool.parameters as any; // TypeBox already generates JSON Schema

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: jsonSchema.properties || {},
        required: jsonSchema.required || [],
      },
    };
  });
}

export { mapStopReason };

export function getMockClaudeCodeMessage(modelId: string, requestId: string): AnthropicMessage {
  return getMockAnthropicMessage(modelId, requestId);
}
