import OpenAI from 'openai';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  BaseAssistantMessage,
  Context,
  ImageContent,
  Model,
  OpenAIProviderOptions,
  StopReason,
  Tool,
} from '@ank1015/llm-types';
import type {
  Tool as OpenAITool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionCallOutputItemList,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
  ResponseInputMessageContentList,
  ResponseOutputMessage,
} from 'openai/resources/responses/responses.js';

export function createClient(model: Model<'openai'>, apiKey: string) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }
  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
}

export function buildParams(
  model: Model<'openai'>,
  context: Context,
  options: OpenAIProviderOptions
) {
  const messages = buildOpenAIMessages(model, context);

  const { apiKey, signal, ...openaiOptions } = options;
  const params: ResponseCreateParamsNonStreaming = {
    ...openaiOptions,
    stream: false,
  };

  params.model = model.id;
  params.input = messages;

  const tools: OpenAITool[] = [];

  if (context.tools && model.tools.includes('function_calling')) {
    const convertedTools = convertTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }
  }

  if (openaiOptions.tools) {
    for (const optionTool of openaiOptions.tools) {
      tools.push(optionTool);
    }
  }

  params.tools = tools;
  return params;
}

function buildAssistantTextMessage(text: string): ResponseOutputMessage {
  return {
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'output_text',
        text,
      },
    ],
  } as ResponseOutputMessage;
}

function buildAssistantImageMessage(image: ImageContent): ResponseInputItem {
  return {
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${image.mimeType};base64,${image.data}`,
      },
    ],
  } as ResponseInputItem;
}

function buildImageGenerationReferenceItem(providerItemId: string): ResponseInputItem {
  return {
    type: 'image_generation_call',
    id: providerItemId,
  } as ResponseInputItem;
}

function buildFileDataUrl(data: string, mimeType: string): string {
  return `data:${mimeType};base64,${data}`;
}

export function buildOpenAIMessages(model: Model<'openai'>, context: Context): ResponseInput {
  const openAIMessages: ResponseInput = [];
  if (context.systemPrompt) {
    openAIMessages.push({
      role: 'developer',
      content: sanitizeSurrogates(context.systemPrompt),
    });
  }

  for (const message of context.messages) {
    if (message.role === 'user') {
      const contents: ResponseInputMessageContentList = [];
      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          contents.push({
            type: 'input_text',
            text: sanitizeSurrogates(contentItem.content),
          });
        } else if (contentItem.type === 'image' && model.input.includes('image')) {
          contents.push({
            type: 'input_image',
            detail: 'auto',
            image_url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
          });
        } else if (contentItem.type === 'file' && model.input.includes('file')) {
          contents.push({
            type: 'input_file',
            filename: contentItem.filename,
            file_data: buildFileDataUrl(contentItem.data, contentItem.mimeType),
          });
        }
      }
      openAIMessages.push({
        role: 'user',
        content: contents,
      });
    }

    // normalize for tool results
    if (message.role === 'toolResult') {
      const toolOutputs: ResponseFunctionCallOutputItemList = [];
      let hasText = false;
      let hasImg = false;
      let hasFile = false;
      for (const contentItem of message.content) {
        if (contentItem.type === 'text') {
          // Prefix error messages so LLM knows the tool failed
          const textContent = message.isError
            ? `[TOOL ERROR] ${contentItem.content}`
            : contentItem.content;
          toolOutputs.push({
            type: 'input_text',
            text: sanitizeSurrogates(textContent),
          });
          hasText = true;
        } else if (contentItem.type === 'image' && model.input.includes('image')) {
          toolOutputs.push({
            type: 'input_image',
            detail: 'auto',
            image_url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
          });
          hasImg = true;
        } else if (contentItem.type === 'file' && model.input.includes('file')) {
          toolOutputs.push({
            type: 'input_file',
            filename: contentItem.filename,
            file_data: buildFileDataUrl(contentItem.data, contentItem.mimeType),
          });
          hasFile = true;
        }
      }
      if (!hasText && (hasImg || hasFile)) {
        toolOutputs.unshift({
          type: 'input_text',
          text: message.isError ? '[TOOL ERROR] (see attached)' : '(see attached)',
        });
      }
      const toolResultInput: ResponseInputItem.FunctionCallOutput = {
        call_id: message.toolCallId,
        output: toolOutputs,
        type: 'function_call_output',
      };
      openAIMessages.push(toolResultInput);
    }

    // normalize for Assistant message
    if (message.role === 'assistant') {
      if (message.model.api === 'openai') {
        const baseMessage = message as BaseAssistantMessage<'openai'>;
        for (const outputPart of baseMessage.message.output) {
          if (
            outputPart.type === 'function_call' ||
            outputPart.type === 'message' ||
            outputPart.type === 'reasoning'
          ) {
            openAIMessages.push(outputPart);
          } else if (outputPart.type === 'image_generation_call') {
            openAIMessages.push(buildImageGenerationReferenceItem(outputPart.id));
          }
        }
      }
      // Convert from other providers using the normalized content field
      else {
        let textBuffer = '';
        const flushTextBuffer = () => {
          if (!textBuffer) return;
          openAIMessages.push(buildAssistantTextMessage(textBuffer));
          textBuffer = '';
        };

        for (const contentBlock of message.content) {
          if (contentBlock.type === 'thinking') {
            flushTextBuffer();
            // Wrap thinking in <thinking> tags as an assistant message
            openAIMessages.push(
              buildAssistantTextMessage(
                `<thinking>${sanitizeSurrogates(contentBlock.thinkingText)}</thinking>`
              )
            );
          } else if (contentBlock.type === 'response') {
            for (const responseItem of contentBlock.content) {
              if (responseItem.type === 'text') {
                textBuffer += sanitizeSurrogates(responseItem.content);
              } else if (responseItem.type === 'image' && model.input.includes('image')) {
                flushTextBuffer();
                const providerItemId =
                  typeof responseItem.metadata?.generationProviderItemId === 'string'
                    ? responseItem.metadata.generationProviderItemId
                    : undefined;

                if (responseItem.metadata?.generationProvider === 'openai' && providerItemId) {
                  openAIMessages.push(buildImageGenerationReferenceItem(providerItemId));
                } else {
                  openAIMessages.push(buildAssistantImageMessage(responseItem));
                }
              }
            }
          } else if (contentBlock.type === 'toolCall') {
            flushTextBuffer();
            // Convert tool call to function_call
            openAIMessages.push({
              type: 'function_call',
              call_id: contentBlock.toolCallId,
              name: contentBlock.name,
              arguments: JSON.stringify(contentBlock.arguments),
            } as ResponseFunctionToolCall);
          }
        }

        flushTextBuffer();
      }
    }
  }

  return openAIMessages;
}

export function convertTools(tools: readonly Tool[]): OpenAITool[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters, // TypeBox already generates JSON Schema
    strict: null,
  }));
}

export function mapStopReason(status: OpenAI.Responses.ResponseStatus | undefined): StopReason {
  if (!status) return 'stop';
  switch (status) {
    case 'completed':
      return 'stop';
    case 'incomplete':
      return 'length';
    case 'failed':
    case 'cancelled':
      return 'error';
    // These two are wonky ...
    case 'in_progress':
    case 'queued':
      return 'stop';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled stop reason: ${_exhaustive}`);
    }
  }
}

export function getMockOpenaiMessage(modelId: string, requestId: string): Response {
  return {
    id: `resp_${requestId}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    output_text: '',
    status: 'completed',
    incomplete_details: null,
    parallel_tool_calls: false,
    error: null,
    instructions: null,
    max_output_tokens: null,
    model: modelId,
    output: [],
    previous_response_id: null,
    temperature: 1,
    text: {},
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
      input_tokens_details: {
        cached_tokens: 0,
      },
      total_tokens: 0,
    },
    metadata: {},
  };
}
