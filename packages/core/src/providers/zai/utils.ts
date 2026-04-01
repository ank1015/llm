import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import { convertChatTools, createMockChatCompletion } from '../utils/index.js';

import type {
  BaseAssistantMessage,
  Context,
  Model,
  TextContent,
  ZaiProviderOptions,
} from '../../types/index.js';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletion,
} from 'openai/resources/chat/completions.js';

// Re-export shared utils under provider-specific names for backwards compatibility
export {
  createChatCompletionClient as createClient,
  mapChatStopReason as mapStopReason,
  convertChatTools as convertTools,
} from '../utils/index.js';

export function getMockZaiMessage(modelId: string, requestId: string): ChatCompletion {
  return createMockChatCompletion(modelId, requestId);
}

export function buildParams(model: Model<'zai'>, context: Context, options: ZaiProviderOptions) {
  const messages = buildZaiMessages(model, context);

  const { apiKey, signal, thinking, ...zaiOptions } = options;
  const params: ChatCompletionCreateParamsNonStreaming & {
    thinking?: { type: string; clear_thinking?: boolean };
  } = {
    ...zaiOptions,
    model: model.id,
    messages,
    stream: false,
  };

  // Add thinking configuration if provided, default to enabled for reasoning models
  if (thinking) {
    params.thinking = thinking;
  } else if (model.reasoning) {
    // Default to enabled for reasoning models
    params.thinking = { type: 'enabled' };
  }

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    const tools: ChatCompletionTool[] = [];
    const convertedTools = convertChatTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }

    if (zaiOptions.tools) {
      for (const optionTool of zaiOptions.tools) {
        tools.push(optionTool);
      }
    }

    params.tools = tools;
  }

  return params;
}

export function buildZaiMessages(
  _model: Model<'zai'>,
  context: Context
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  // Add system prompt
  if (context.systemPrompt) {
    messages.push({
      role: 'system',
      content: sanitizeSurrogates(context.systemPrompt),
    });
  }

  for (const message of context.messages) {
    // Handle user messages
    if (message.role === 'user') {
      const textContents = message.content
        .filter((c) => c.type === 'text')
        .map((c) => sanitizeSurrogates((c as TextContent).content))
        .join('\n');

      if (textContents) {
        messages.push({
          role: 'user',
          content: textContents,
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

      const toolMessage: ChatCompletionToolMessageParam = {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: sanitizeSurrogates(textContent || (message.isError ? '[TOOL ERROR]' : '')),
      };
      messages.push(toolMessage);
    }

    // Handle assistant messages
    if (message.role === 'assistant') {
      if (message.model.api === 'zai') {
        // Native Z.AI message - reconstruct from original
        const baseMessage = message as BaseAssistantMessage<'zai'>;
        const originalMessage = baseMessage.message.choices[0]?.message;

        if (originalMessage) {
          const assistantMessage: ChatCompletionAssistantMessageParam = originalMessage;
          messages.push(assistantMessage);
        }
      } else {
        // Convert from other providers using normalized content
        let textContent = '';
        const toolCalls: ChatCompletionAssistantMessageParam['tool_calls'] = [];
        let reasoningContent = '';

        for (const contentBlock of message.content) {
          if (contentBlock.type === 'thinking') {
            reasoningContent += sanitizeSurrogates(contentBlock.thinkingText);
          } else if (contentBlock.type === 'response') {
            const text = contentBlock.response
              .filter((c) => c.type === 'text')
              .map((c) => sanitizeSurrogates((c as TextContent).content))
              .join('');
            textContent += text;
          } else if (contentBlock.type === 'toolCall') {
            toolCalls.push({
              id: contentBlock.toolCallId,
              type: 'function',
              function: {
                name: contentBlock.name,
                arguments: JSON.stringify(contentBlock.arguments),
              },
            });
          }
        }

        const assistantMessage: ChatCompletionAssistantMessageParam & {
          reasoning_content?: string;
        } = {
          role: 'assistant',
          content: textContent || null,
        };

        if (reasoningContent) {
          assistantMessage.reasoning_content = reasoningContent;
        }

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        messages.push(assistantMessage);
      }
    }
  }

  return messages;
}
