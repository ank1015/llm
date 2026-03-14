import { calculateCost } from '../../models/index.js';
import { AssistantMessageEventStream } from '../../utils/event-stream.js';
import { parseStreamingJson } from '../../utils/json-parse.js';
import { validateToolArguments } from '../../utils/validation.js';

import { buildParams, createClient, getMockOpenaiMessage, mapStopReason } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type {
  AssistantResponseContent,
  AssistantThinkingContent,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
  GeneratedImageMetadata,
  ImageContent,
  Model,
  OpenAIProviderOptions,
  TextContent,
} from '@ank1015/llm-types';
import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseReasoningItem,
} from 'openai/resources/responses/responses.js';

function getStringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getMimeTypeFromOutputFormat(outputFormat?: string): string {
  switch (outputFormat) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

export const streamOpenAI: StreamFunction<'openai'> = (
  model: Model<'openai'>,
  context: Context,
  options: OpenAIProviderOptions,
  id: string
) => {
  const stream = new AssistantMessageEventStream<'openai'>();

  (async () => {
    const startTimestamp = Date.now();
    let finalResponse: Response = getMockOpenaiMessage(model.id, id);

    const output: BaseAssistantMessage<'openai'> = {
      role: 'assistant',
      api: model.api,
      model: model,
      id,
      message: finalResponse,
      content: [],
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: startTimestamp,
      duration: 0,
    };

    const blocks = output.content;
    const blockIndex = () => blocks.length - 1;
    const previewBlockIndices = new Set<number>();
    const imageBlockIndicesByItemId = new Map<string, number>();
    const configuredImageTool = options.tools?.find((tool) => tool.type === 'image_generation');

    const prunePreviewBlocks = () => {
      if (previewBlockIndices.size === 0) return;

      const keptBlocks = blocks.filter((_, index) => !previewBlockIndices.has(index));
      blocks.length = 0;
      blocks.push(...keptBlocks);
      previewBlockIndices.clear();
      imageBlockIndicesByItemId.clear();
    };

    try {
      const client = createClient(model, options.apiKey);
      const params = buildParams(model, context, options);

      const paramsStreaming: ResponseCreateParamsStreaming = {
        ...params,
        stream: true,
      };

      const openaiStream = await client.responses.create(paramsStreaming, {
        signal: options?.signal,
      });

      stream.push({ type: 'start', message: { ...output, timestamp: Date.now() } });

      let currentItem:
        | ResponseReasoningItem
        | ResponseOutputMessage
        | ResponseFunctionToolCall
        | null = null;
      let currentBlock:
        | AssistantThinkingContent
        | AssistantResponseContent
        | (AssistantToolCall & { partialJson: string })
        | null = null;
      let currentBlockIndex: number | null = null;

      const closeNonToolBlock = () => {
        if (!currentBlock || currentBlock.type === 'toolCall' || currentBlockIndex === null) return;

        if (currentBlock.type === 'thinking') {
          stream.push({
            type: 'thinking_end',
            contentIndex: currentBlockIndex,
            content: currentBlock.thinkingText,
            message: output,
          });
        } else {
          stream.push({
            type: 'text_end',
            contentIndex: currentBlockIndex,
            content: currentBlock.content,
            message: output,
          });
        }

        currentBlock = null;
        currentBlockIndex = null;
      };

      const buildImageMetadata = (
        stage: GeneratedImageMetadata['generationStage'],
        providerItemId: string,
        raw: Record<string, unknown> = {},
        partialImageIndex?: number
      ): GeneratedImageMetadata => {
        const metadata: GeneratedImageMetadata = {
          generationStage: stage,
          generationProvider: 'openai',
          generationProviderItemId: providerItemId,
        };

        const action = getStringField(raw.action) ?? configuredImageTool?.action;
        const revisedPrompt = getStringField(raw.revised_prompt);
        const size = getStringField(raw.size) ?? configuredImageTool?.size;
        const quality = getStringField(raw.quality) ?? configuredImageTool?.quality;
        const background = getStringField(raw.background) ?? configuredImageTool?.background;
        const outputFormat =
          getStringField(raw.output_format) ?? configuredImageTool?.output_format;

        if (action) metadata.generationAction = action;
        if (revisedPrompt) metadata.generationRevisedPrompt = revisedPrompt;
        if (size) metadata.generationOutputSize = size;
        if (quality) metadata.generationOutputQuality = quality;
        if (background) metadata.generationOutputBackground = background;
        if (outputFormat) metadata.generationOutputFormat = outputFormat;
        if (partialImageIndex !== undefined) {
          metadata.generationPartialImageIndex = partialImageIndex;
        }

        return metadata;
      };

      const createImageContent = (
        data: string,
        metadata: GeneratedImageMetadata
      ): ImageContent => ({
        type: 'image',
        data,
        mimeType: getMimeTypeFromOutputFormat(metadata.generationOutputFormat),
        metadata,
      });

      const ensureImageBlock = (itemId: string, metadata: GeneratedImageMetadata): number => {
        const existingIndex = imageBlockIndicesByItemId.get(itemId);
        if (existingIndex !== undefined) {
          return existingIndex;
        }

        const image: ImageContent = createImageContent('', metadata);
        const imageBlock: AssistantResponseContent = {
          type: 'response',
          content: [image],
        };

        output.content.push(imageBlock);
        const imageContentIndex = blockIndex();
        imageBlockIndicesByItemId.set(itemId, imageContentIndex);
        previewBlockIndices.add(imageContentIndex);

        stream.push({
          type: 'image_start',
          contentIndex: imageContentIndex,
          metadata,
          message: output,
        });

        return imageContentIndex;
      };

      const updateImageBlock = (
        itemId: string,
        image: ImageContent,
        metadata: GeneratedImageMetadata,
        markFinal: boolean
      ) => {
        let imageContentIndex = imageBlockIndicesByItemId.get(itemId);
        if (imageContentIndex === undefined) {
          const imageBlock: AssistantResponseContent = {
            type: 'response',
            content: [image],
          };

          output.content.push(imageBlock);
          imageContentIndex = blockIndex();
          imageBlockIndicesByItemId.set(itemId, imageContentIndex);

          stream.push({
            type: 'image_start',
            contentIndex: imageContentIndex,
            metadata,
            message: output,
          });
        } else {
          const imageBlock = output.content[imageContentIndex];
          if (imageBlock?.type === 'response') {
            imageBlock.content = [image];
          }
        }

        if (markFinal) {
          previewBlockIndices.delete(imageContentIndex);
        }

        stream.push({
          type: 'image_frame',
          contentIndex: imageContentIndex,
          image,
          message: output,
        });

        if (markFinal) {
          stream.push({
            type: 'image_end',
            contentIndex: imageContentIndex,
            image,
            message: output,
          });
        }
      };

      for await (const event of openaiStream) {
        if (event.type === 'response.output_item.added') {
          const item = event.item;
          if (item.type === 'reasoning') {
            currentItem = item;
            currentBlock = { type: 'thinking', thinkingText: '' };
            blocks.push(currentBlock);
            currentBlockIndex = blockIndex();
            stream.push({
              type: 'thinking_start',
              contentIndex: currentBlockIndex,
              message: output,
            });
          } else if (item.type === 'message') {
            currentItem = item;
            currentBlock = { type: 'response', content: [{ type: 'text', content: '' }] };
            blocks.push(currentBlock);
            currentBlockIndex = blockIndex();
            stream.push({
              type: 'text_start',
              contentIndex: currentBlockIndex,
              message: output,
            });
          } else if (item.type === 'function_call') {
            currentItem = item;
            currentBlock = {
              type: 'toolCall',
              toolCallId: item.call_id,
              name: item.name,
              arguments: {},
              partialJson: item.arguments || '',
            };
            blocks.push(currentBlock);
            currentBlockIndex = blockIndex();
            stream.push({
              type: 'toolcall_start',
              contentIndex: currentBlockIndex,
              message: output,
            });
          } else if (item.type === 'image_generation_call') {
            const metadata = buildImageMetadata(
              'partial',
              item.id,
              item as unknown as Record<string, unknown>
            );
            ensureImageBlock(item.id, metadata);
          }
        } else if (event.type === 'response.reasoning_summary_part.added') {
          if (currentItem && currentItem.type === 'reasoning') {
            currentItem.summary = currentItem.summary || [];
            currentItem.summary.push(event.part);
          }
        } else if (event.type === 'response.reasoning_summary_text.delta') {
          if (
            currentItem &&
            currentItem.type === 'reasoning' &&
            currentBlock &&
            currentBlock.type === 'thinking' &&
            currentBlockIndex !== null
          ) {
            currentItem.summary = currentItem.summary || [];
            const lastPart = currentItem.summary[currentItem.summary.length - 1];
            if (lastPart) {
              currentBlock.thinkingText += event.delta;
              lastPart.text += event.delta;
              stream.push({
                type: 'thinking_delta',
                contentIndex: currentBlockIndex,
                delta: event.delta,
                message: output,
              });
            }
          }
        } else if (event.type === 'response.reasoning_summary_part.done') {
          if (
            currentItem &&
            currentItem.type === 'reasoning' &&
            currentBlock &&
            currentBlock.type === 'thinking' &&
            currentBlockIndex !== null
          ) {
            currentItem.summary = currentItem.summary || [];
            const lastPart = currentItem.summary[currentItem.summary.length - 1];
            if (lastPart) {
              currentBlock.thinkingText += '\n\n';
              lastPart.text += '\n\n';
              stream.push({
                type: 'thinking_delta',
                contentIndex: currentBlockIndex,
                delta: '\n\n',
                message: output,
              });
            }
          }
        } else if (event.type === 'response.content_part.added') {
          if (currentItem && currentItem.type === 'message') {
            currentItem.content = currentItem.content || [];
            currentItem.content.push(event.part as ResponseOutputMessage['content'][number]);
          }
        } else if (event.type === 'response.output_text.delta') {
          if (
            currentItem &&
            currentItem.type === 'message' &&
            currentBlock &&
            currentBlock.type === 'response' &&
            currentBlockIndex !== null
          ) {
            const lastPart = currentItem.content[currentItem.content.length - 1];
            if (lastPart && lastPart.type === 'output_text') {
              const textIndex = currentBlock.content.findIndex(
                (content) => content.type === 'text'
              );
              if (textIndex !== -1) {
                (currentBlock.content[textIndex] as TextContent).content += event.delta;
              }
              lastPart.text += event.delta;
              stream.push({
                type: 'text_delta',
                contentIndex: currentBlockIndex,
                delta: event.delta,
                message: output,
              });
            }
          }
        } else if (event.type === 'response.refusal.delta') {
          if (
            currentItem &&
            currentItem.type === 'message' &&
            currentBlock &&
            currentBlock.type === 'response' &&
            currentBlockIndex !== null
          ) {
            const lastPart = currentItem.content[currentItem.content.length - 1];
            if (lastPart && lastPart.type === 'refusal') {
              const textIndex = currentBlock.content.findIndex(
                (content) => content.type === 'text'
              );
              if (textIndex !== -1) {
                (currentBlock.content[textIndex] as TextContent).content += event.delta;
              }
              lastPart.refusal += event.delta;
              stream.push({
                type: 'text_delta',
                contentIndex: currentBlockIndex,
                delta: event.delta,
                message: output,
              });
            }
          }
        } else if (event.type === 'response.function_call_arguments.delta') {
          if (
            currentItem &&
            currentItem.type === 'function_call' &&
            currentBlock &&
            currentBlock.type === 'toolCall' &&
            currentBlockIndex !== null
          ) {
            currentBlock.partialJson += event.delta;
            currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
            stream.push({
              type: 'toolcall_delta',
              contentIndex: currentBlockIndex,
              delta: event.delta,
              message: output,
            });
          }
        } else if (event.type === 'response.image_generation_call.in_progress') {
          const metadata = buildImageMetadata('partial', event.item_id);
          ensureImageBlock(event.item_id, metadata);
        } else if (event.type === 'response.image_generation_call.generating') {
          const metadata = buildImageMetadata('partial', event.item_id);
          ensureImageBlock(event.item_id, metadata);
        } else if (event.type === 'response.image_generation_call.partial_image') {
          const metadata = buildImageMetadata(
            'partial',
            event.item_id,
            {},
            event.partial_image_index
          );
          ensureImageBlock(event.item_id, metadata);
          const image = createImageContent(event.partial_image_b64, metadata);
          updateImageBlock(event.item_id, image, metadata, false);
        } else if (event.type === 'response.output_item.done') {
          const item = event.item;

          if (
            item.type === 'reasoning' &&
            currentBlock &&
            currentBlock.type === 'thinking' &&
            currentBlockIndex !== null
          ) {
            currentBlock.thinkingText =
              item.summary?.map((summary) => summary.text).join('\n\n') || '';
            stream.push({
              type: 'thinking_end',
              contentIndex: currentBlockIndex,
              content: currentBlock.thinkingText,
              message: output,
            });
            currentBlock = null;
            currentBlockIndex = null;
            currentItem = null;
          } else if (
            item.type === 'message' &&
            currentBlock &&
            currentBlock.type === 'response' &&
            currentBlockIndex !== null
          ) {
            const textIndex = currentBlock.content.findIndex((content) => content.type === 'text');
            if (textIndex !== -1) {
              (currentBlock.content[textIndex] as TextContent).content = item.content
                .map((content) => (content.type === 'output_text' ? content.text : content.refusal))
                .join('');
            }
            stream.push({
              type: 'text_end',
              contentIndex: currentBlockIndex,
              content: currentBlock.content,
              message: output,
            });
            currentBlock = null;
            currentBlockIndex = null;
            currentItem = null;
          } else if (item.type === 'function_call' && currentBlockIndex !== null) {
            const toolCall: AssistantToolCall = {
              type: 'toolCall',
              toolCallId: item.call_id,
              name: item.name,
              arguments: parseStreamingJson(item.arguments),
            };

            if (context.tools) {
              const tool = context.tools.find(
                (registeredTool) => registeredTool.name === toolCall.name
              );
              if (tool) {
                try {
                  toolCall.arguments = validateToolArguments(tool, toolCall) as Record<
                    string,
                    unknown
                  >;
                } catch {
                  // Keep the parsed arguments. Validation errors are handled downstream.
                }
              }
            }

            if (currentBlockIndex !== null) {
              blocks[currentBlockIndex] = toolCall;
            }
            stream.push({
              type: 'toolcall_end',
              contentIndex: currentBlockIndex,
              toolCall,
              message: output,
            });
            currentBlock = null;
            currentBlockIndex = null;
            currentItem = null;
          } else if (item.type === 'image_generation_call') {
            const itemRecord = item as unknown as Record<string, unknown>;

            if (typeof item.result === 'string' && item.result) {
              const metadata = buildImageMetadata('final', item.id, itemRecord);
              const image = createImageContent(item.result, metadata);
              updateImageBlock(item.id, image, metadata, true);
            } else {
              const previewIndex = imageBlockIndicesByItemId.get(item.id);
              if (previewIndex !== undefined) {
                const previewBlock = output.content[previewIndex];
                if (previewBlock?.type === 'response') {
                  const previewImage = previewBlock.content.find(
                    (content): content is ImageContent => content.type === 'image'
                  );
                  if (previewImage?.data) {
                    stream.push({
                      type: 'image_end',
                      contentIndex: previewIndex,
                      image: previewImage,
                      message: output,
                    });
                  }
                }
              }
            }
          }
        } else if (event.type === 'response.completed') {
          finalResponse = event.response;
          output.message = finalResponse;
          if (finalResponse.usage) {
            const cachedTokens = finalResponse.usage.input_tokens_details?.cached_tokens || 0;
            output.usage = {
              input: (finalResponse.usage.input_tokens || 0) - cachedTokens,
              output: finalResponse.usage.output_tokens || 0,
              cacheRead: cachedTokens,
              cacheWrite: 0,
              totalTokens: finalResponse.usage.total_tokens || 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };
          }
          output.usage.cost = calculateCost(model, output.usage);
          output.stopReason = mapStopReason(finalResponse.status);
          if (
            output.content.some((block) => block.type === 'toolCall') &&
            output.stopReason === 'stop'
          ) {
            output.stopReason = 'toolUse';
          }
        } else if (event.type === 'error') {
          throw new Error(`OpenAI API Error (${event.code}): ${event.message}`);
        } else if (event.type === 'response.failed') {
          throw new Error('OpenAI response failed without error details');
        }
      }

      closeNonToolBlock();
      prunePreviewBlocks();

      if (options?.signal?.aborted) {
        throw new Error('Request was aborted');
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        throw new Error(
          `Stream ended with status: ${output.stopReason}${output.errorMessage ? ` - ${output.errorMessage}` : ''}`
        );
      }

      output.timestamp = Date.now();
      output.duration = Date.now() - startTimestamp;
      stream.push({
        type: 'done',
        reason: output.stopReason,
        message: output,
      });
      stream.end(output);
    } catch (error) {
      prunePreviewBlocks();
      for (const block of output.content) delete (block as { index?: number }).index;
      output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      finalResponse.status = options?.signal?.aborted ? 'cancelled' : 'failed';
      output.timestamp = Date.now();
      output.duration = Date.now() - startTimestamp;
      stream.push({
        type: 'error',
        reason: output.stopReason,
        message: output,
      });
      stream.end(output);
    }
  })();

  return stream;
};
