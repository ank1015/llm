import Anthropic from '@anthropic-ai/sdk';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  AnthropicProviderOptions,
  BaseAssistantMessage,
  Context,
  Model,
  StopReason,
  TextContent,
  Tool,
} from '@ank1015/llm-types';
import type {
  DocumentBlockParam,
  Message as AnthropicMessage,
  ContentBlock,
  ImageBlockParam,
  MessageCreateParamsBase,
  MessageParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/messages.js';

type AnthropicInputBlockParam = TextBlockParam | ImageBlockParam | DocumentBlockParam;

function buildAnthropicDocumentBlock(
  filename: string,
  mimeType: string,
  data: string
): DocumentBlockParam | null {
  if (mimeType !== 'application/pdf') {
    return null;
  }

  return {
    type: 'document',
    title: sanitizeSurrogates(filename),
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data,
    },
  };
}

export function createClient(
  model: Model<'anthropic'>,
  apiKey: string,
  interleavedThinking?: boolean
): { client: Anthropic; isOAuthToken: boolean } {
  if (!apiKey) {
    throw new Error('Anthropic API key is required.');
  }
  const betaFeatures = ['fine-grained-tool-streaming-2025-05-14'];
  if (interleavedThinking) {
    betaFeatures.push('interleaved-thinking-2025-05-14');
  }

  if (apiKey.includes('sk-ant-oat')) {
    const defaultHeaders = {
      accept: 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': `oauth-2025-04-20,${betaFeatures.join(',')}`,
      ...(model.headers || {}),
    };

    const client = new Anthropic({
      apiKey: null,
      authToken: apiKey,
      baseURL: model.baseUrl,
      defaultHeaders,
      dangerouslyAllowBrowser: true,
    });

    return { client, isOAuthToken: true };
  } else {
    const defaultHeaders = {
      accept: 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': betaFeatures.join(','),
      ...(model.headers || {}),
    };

    const client = new Anthropic({
      apiKey,
      baseURL: model.baseUrl,
      dangerouslyAllowBrowser: true,
      defaultHeaders,
    });

    return { client, isOAuthToken: false };
  }
}

export function buildParams(
  model: Model<'anthropic'>,
  context: Context,
  options: AnthropicProviderOptions,
  isOAuthToken: boolean
): MessageCreateParamsBase {
  const messages = buildAnthropicMessages(model, context);

  const { apiKey, signal, ...anthropicOptions } = options;
  const params: MessageCreateParamsBase = {
    ...anthropicOptions,
    model: model.id,
    messages,
    max_tokens: anthropicOptions.max_tokens || model.maxTokens,
    stream: false,
  };

  // For OAuth tokens, we MUST include Claude Code identity
  if (isOAuthToken) {
    params.system = [
      {
        type: 'text',
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
        cache_control: {
          type: 'ephemeral',
        },
      },
    ];
    if (context.systemPrompt) {
      params.system.push({
        type: 'text',
        text: sanitizeSurrogates(context.systemPrompt),
        cache_control: {
          type: 'ephemeral',
        },
      });
    }
  } else if (context.systemPrompt) {
    // Add cache control to system prompt for non-OAuth tokens
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
    const tools = convertTools(context.tools);
    params.tools = tools;
  }

  return params;
}

export function buildAnthropicMessages(
  model: Model<'anthropic'>,
  context: Context
): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const message of context.messages) {
    // Handle user messages
    if (message.role === 'user') {
      const content: AnthropicInputBlockParam[] = [];

      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          content.push({
            type: 'text',
            text: sanitizeSurrogates(contentItem.content),
          });
        }
        if (contentItem.type === 'image' && model.input.includes('image')) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentItem.mimeType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: contentItem.data,
            },
          });
        }
        if (contentItem.type === 'file' && model.input.includes('file')) {
          const documentBlock = buildAnthropicDocumentBlock(
            contentItem.filename,
            contentItem.mimeType,
            contentItem.data
          );
          if (documentBlock) {
            content.push(documentBlock);
          }
        }
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
      const toolResultContentBlocks: AnthropicInputBlockParam[] = [];
      let hasText = false;

      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          toolResultContentBlocks.push({
            type: 'text',
            text: sanitizeSurrogates(
              message.isError ? `[TOOL ERROR] ${contentItem.content}` : contentItem.content
            ),
          });
          hasText = true;
        } else if (contentItem.type === 'image' && model.input.includes('image')) {
          toolResultContentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentItem.mimeType as
                | 'image/jpeg'
                | 'image/png'
                | 'image/gif'
                | 'image/webp',
              data: contentItem.data,
            },
          });
        } else if (contentItem.type === 'file' && model.input.includes('file')) {
          const documentBlock = buildAnthropicDocumentBlock(
            contentItem.filename,
            contentItem.mimeType,
            contentItem.data
          );
          if (documentBlock) {
            toolResultContentBlocks.push(documentBlock);
          }
        }
      }

      if (message.isError && !hasText && toolResultContentBlocks.length > 0) {
        toolResultContentBlocks.unshift({
          type: 'text',
          text: '[TOOL ERROR]',
        });
      }

      const textOnlyToolResultContent =
        toolResultContentBlocks.length > 0 &&
        toolResultContentBlocks.every((block) => block.type === 'text')
          ? toolResultContentBlocks.map((block) => (block as TextBlockParam).text).join('\n')
          : null;

      const toolResultContent: ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content:
          textOnlyToolResultContent ??
          (toolResultContentBlocks.length > 0
            ? toolResultContentBlocks
            : sanitizeSurrogates(message.isError ? '[TOOL ERROR]' : '')),
        is_error: message.isError,
      };

      messages.push({
        role: 'user',
        content: [toolResultContent],
      });
    }

    // Handle assistant messages
    if (message.role === 'assistant') {
      if (message.model.api === 'anthropic') {
        // Native Anthropic message - use original content
        const baseMessage = message as BaseAssistantMessage<'anthropic'>;
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

export function mapStopReason(reason: Anthropic.Messages.StopReason): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'toolUse';
    case 'refusal':
      return 'error';
    case 'pause_turn': // Stop is good enough -> resubmit
      return 'stop';
    case 'stop_sequence':
      return 'stop'; // We don't supply stop sequences, so this should never happen
    default: {
      const _exhaustive: never = reason;
      throw new Error(`Unhandled stop reason: ${_exhaustive}`);
    }
  }
}

export function getMockAnthropicMessage(modelId: string, requestId: string): AnthropicMessage {
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
