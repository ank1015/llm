import OpenAI from 'openai';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  BaseAssistantMessage,
  Context,
  DeepSeekProviderOptions,
  Model,
  StopReason,
  TextContent,
  Tool,
} from '@ank1015/llm-types';
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions.js';

export function createClient(model: Model<'deepseek'>, apiKey: string) {
  if (!apiKey) {
    throw new Error('DeepSeek API key is required.');
  }
  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
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
    const convertedTools = convertTools(context.tools);
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
      // DeepSeek chat completions API supports text content
      // For images, we'd need to check if the model supports vision
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
            const text = contentBlock.content
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

export function convertTools(tools: readonly Tool[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}

export function mapStopReason(finishReason: string | null | undefined): StopReason {
  if (!finishReason) return 'stop';

  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'toolUse';
    case 'content_filter':
      return 'error';
    default:
      return 'stop';
  }
}

export function getMockDeepSeekMessage(): ChatCompletion {
  return {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'deepseek-chat',
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
