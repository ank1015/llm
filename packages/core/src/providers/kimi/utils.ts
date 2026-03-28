import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import { convertChatTools, createMockChatCompletion } from '../utils/index.js';

import type {
  BaseAssistantMessage,
  Context,
  ImageContent,
  KimiProviderOptions,
  Model,
  TextContent,
} from '../../types/index.js';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart,
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

export function getMockKimiMessage(modelId: string, requestId: string): ChatCompletion {
  return createMockChatCompletion(modelId, requestId);
}

export function buildParams(model: Model<'kimi'>, context: Context, options: KimiProviderOptions) {
  const messages = buildKimiMessages(model, context);

  const { apiKey, signal, thinking, ...kimiOptions } = options;
  const params: ChatCompletionCreateParamsNonStreaming & { thinking?: { type: string } } = {
    ...kimiOptions,
    model: model.id,
    messages,
    stream: false,
  };

  // Determine thinking configuration
  let thinkingEnabled = false;
  if (thinking) {
    params.thinking = thinking;
    thinkingEnabled = thinking.type === 'enabled';
  } else if (model.reasoning) {
    // Default to enabled for reasoning models
    params.thinking = { type: 'enabled' };
    thinkingEnabled = true;
  }

  // Set temperature if not provided - Kimi has strict requirements:
  // - kimi-k2.5 with thinking: must be 1.0
  // - kimi-k2.5 without thinking: must be 0.6
  // - other models: default 0.6
  if (params.temperature === undefined) {
    if (model.id === 'kimi-k2.5') {
      params.temperature = thinkingEnabled ? 1.0 : 0.6;
    } else {
      params.temperature = 0.6;
    }
  }

  // Set max_tokens if not provided - Kimi thinking models require >= 16000
  // to ensure reasoning_content and content can be fully returned
  if (params.max_tokens === undefined && thinkingEnabled) {
    params.max_tokens = 16000;
  }

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    const tools: ChatCompletionTool[] = [];
    const convertedTools = convertChatTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }

    if (kimiOptions.tools) {
      for (const optionTool of kimiOptions.tools) {
        tools.push(optionTool);
      }
    }

    params.tools = tools;
  }

  return params;
}

export function buildKimiMessages(
  model: Model<'kimi'>,
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
      // Kimi supports text and image content
      const supportsImages = model.input.includes('image');

      if (supportsImages && message.content.some((c) => c.type === 'image')) {
        // Build multimodal content
        const contentParts: ChatCompletionContentPart[] = [];

        for (const c of message.content) {
          if (c.type === 'text') {
            contentParts.push({
              type: 'text',
              text: sanitizeSurrogates((c as TextContent).content),
            });
          } else if (c.type === 'image') {
            const imageContent = c as ImageContent;
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${imageContent.mimeType};base64,${imageContent.data}`,
              },
            });
          }
        }

        if (contentParts.length > 0) {
          messages.push({
            role: 'user',
            content: contentParts,
          });
        }
      } else {
        // Text-only content
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
      if (message.model.api === 'kimi') {
        // Native Kimi message - reconstruct from original
        const baseMessage = message as BaseAssistantMessage<'kimi'>;
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
