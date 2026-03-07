import Anthropic from '@anthropic-ai/sdk';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  BaseAssistantMessage,
  Context,
  MiniMaxProviderOptions,
  Model,
  StopReason,
  TextContent,
  Tool,
} from '@ank1015/llm-types';
import type {
  Message as AnthropicMessage,
  ContentBlock,
  MessageCreateParamsBase,
  MessageParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/messages.js';

export function createClient(model: Model<'minimax'>, apiKey: string): Anthropic {
  if (!apiKey) {
    throw new Error('MiniMax API key is required.');
  }

  const defaultHeaders = {
    accept: 'application/json',
    ...(model.headers || {}),
  };

  return new Anthropic({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders,
  });
}

export function buildParams(
  model: Model<'minimax'>,
  context: Context,
  options: MiniMaxProviderOptions
): MessageCreateParamsBase {
  const messages = buildMinimaxMessages(model, context);

  const { apiKey, signal, ...minimaxOptions } = options;
  const params: MessageCreateParamsBase = {
    ...minimaxOptions,
    model: model.id,
    messages,
    max_tokens: minimaxOptions.max_tokens || model.maxTokens,
    stream: false,
  };

  if (context.systemPrompt) {
    params.system = [
      {
        type: 'text',
        text: sanitizeSurrogates(context.systemPrompt),
        cache_control: {
          type: 'ephemeral',
        },
      },
    ];
  }

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    params.tools = convertTools(context.tools);
  }

  return params;
}

export function buildMinimaxMessages(model: Model<'minimax'>, context: Context): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const message of context.messages) {
    // Handle user messages
    if (message.role === 'user') {
      const content: TextBlockParam[] = [];

      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          content.push({
            type: 'text',
            text: sanitizeSurrogates(contentItem.content),
          });
        }
        // MiniMax does not support image or document input
      }

      if (content.length > 0) {
        messages.push({
          role: 'user',
          content,
        });
      }
    }

    // Handle tool results
    if (message.role === 'toolResult') {
      const textContent = message.content
        .filter((c) => c.type === 'text')
        .map((c) => {
          const text = (c as TextContent).content;
          return message.isError ? `[TOOL ERROR] ${text}` : text;
        })
        .join('\n');

      const toolResultContent: ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: sanitizeSurrogates(textContent || (message.isError ? '[TOOL ERROR]' : '')),
        is_error: message.isError,
      };

      messages.push({
        role: 'user',
        content: [toolResultContent],
      });
    }

    // Handle assistant messages
    if (message.role === 'assistant') {
      if (message.model.api === 'minimax') {
        // Native MiniMax message - use original content (Anthropic format)
        const baseMessage = message as BaseAssistantMessage<'minimax'>;
        if (baseMessage.message.content && baseMessage.message.content.length > 0) {
          messages.push({
            role: 'assistant',
            content: baseMessage.message.content as ContentBlock[],
          });
        }
      } else {
        // Convert from other providers using normalized content
        const content: (TextBlockParam | ToolUseBlockParam)[] = [];

        for (const contentBlock of message.content) {
          if (contentBlock.type === 'thinking') {
            // Wrap thinking in tags for cross-provider context
            content.push({
              type: 'text',
              text: `<thinking>${sanitizeSurrogates(contentBlock.thinkingText)}</thinking>`,
            });
          } else if (contentBlock.type === 'response') {
            const textContent = contentBlock.content
              .filter((c) => c.type === 'text')
              .map((c) => sanitizeSurrogates((c as TextContent).content))
              .join('');

            if (textContent) {
              content.push({
                type: 'text',
                text: textContent,
              });
            }
          } else if (contentBlock.type === 'toolCall') {
            content.push({
              type: 'tool_use',
              id: contentBlock.toolCallId,
              name: contentBlock.name,
              input: contentBlock.arguments,
            });
          }
        }

        if (content.length > 0) {
          messages.push({
            role: 'assistant',
            content,
          });
        }
      }
    }
  }

  return messages;
}

function convertTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  if (!tools) return [];

  return tools.map((tool) => {
    const jsonSchema = tool.parameters as any;

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

export function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'toolUse';
    case 'refusal':
      return 'error';
    case 'pause_turn':
      return 'stop';
    case 'stop_sequence':
      return 'stop';
    default:
      return 'stop';
  }
}

export function getMockMinimaxMessage(modelId: string, requestId: string): AnthropicMessage {
  return {
    id: `msg_${requestId}`,
    type: 'message',
    role: 'assistant',
    container: null,
    content: [],
    model: modelId,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
    },
  };
}
