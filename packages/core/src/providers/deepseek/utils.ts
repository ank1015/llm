import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import { convertChatTools, createMockChatCompletion } from '../utils/index.js';

import type {
  BaseAssistantMessage,
  Context,
  DeepSeekProviderOptions,
  Model,
  TextContent,
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

export function getMockDeepSeekMessage(modelId: string, requestId: string): ChatCompletion {
  return createMockChatCompletion(modelId, requestId);
}

export function buildParams(
  model: Model<'deepseek'>,
  context: Context,
  options: DeepSeekProviderOptions
) {
  const messages = buildDeepSeekMessages(model, context);

  const { apiKey, signal, ...deepseekOptions } = options;
  const params: ChatCompletionCreateParamsNonStreaming = {
    ...deepseekOptions,
    model: model.id,
    messages,
    stream: false,
  };

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    const tools: ChatCompletionTool[] = [];
    const convertedTools = convertChatTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }

    if (deepseekOptions.tools) {
      for (const optionTool of deepseekOptions.tools) {
        tools.push(optionTool);
      }
    }

    params.tools = tools;
  }

  return params;
}

export function buildDeepSeekMessages(
  _model: Model<'deepseek'>,
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
      if (message.model.api === 'deepseek') {
        // Native DeepSeek message - reconstruct from original
        const baseMessage = message as BaseAssistantMessage<'deepseek'>;
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
            // Wrap thinking in tags for cross-provider context
            reasoningContent += `${sanitizeSurrogates(contentBlock.thinkingText)}`;
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
          reasoning_content: reasoningContent,
          content: textContent || null,
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        messages.push(assistantMessage);
      }
    }
  }

  return messages;
}
