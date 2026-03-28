import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import { convertChatTools, createMockChatCompletion } from '../utils/index.js';

import type {
  BaseAssistantMessage,
  CerebrasProviderOptions,
  Context,
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

export function getMockCerebrasMessage(modelId: string, requestId: string): ChatCompletion {
  return createMockChatCompletion(modelId, requestId);
}

export function buildParams(
  model: Model<'cerebras'>,
  context: Context,
  options: CerebrasProviderOptions
) {
  const messages = buildCerebrasMessages(model, context);

  const {
    apiKey,
    signal,
    reasoning_format,
    reasoning_effort,
    disable_reasoning,
    ...cerebrasOptions
  } = options;

  const params: ChatCompletionCreateParamsNonStreaming & {
    reasoning_format?: string;
    reasoning_effort?: string;
    disable_reasoning?: boolean;
  } = {
    ...cerebrasOptions,
    model: model.id,
    messages,
    stream: false,
  };

  // Apply reasoning parameters for reasoning models
  if (model.reasoning) {
    // Default to 'parsed' reasoning format so we get structured reasoning tokens
    if (reasoning_format) {
      params.reasoning_format = reasoning_format;
    } else {
      params.reasoning_format = 'parsed';
    }

    // Model-specific reasoning controls
    if (reasoning_effort !== undefined) {
      params.reasoning_effort = reasoning_effort;
    }
    if (disable_reasoning !== undefined) {
      params.disable_reasoning = disable_reasoning;
    }
  }

  // Add tools if available and supported
  if (context.tools && context.tools.length > 0 && model.tools.includes('function_calling')) {
    const tools: ChatCompletionTool[] = [];
    const convertedTools = convertChatTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }

    if (cerebrasOptions.tools) {
      for (const optionTool of cerebrasOptions.tools) {
        tools.push(optionTool);
      }
    }

    params.tools = tools;
  }

  return params;
}

export function buildCerebrasMessages(
  model: Model<'cerebras'>,
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
      if (message.model.api === 'cerebras') {
        // Native Cerebras message - reconstruct from original
        const baseMessage = message as BaseAssistantMessage<'cerebras'>;
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
