import { calculateCost } from '../../models/index.js';
import { AssistantMessageEventStream } from '../../utils/event-stream.js';
import { validateToolArguments } from '../../utils/validation.js';

import { buildParams, createClient, mapStopReason } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type {
  AssistantResponseContent,
  AssistantThinkingContent,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
  GeneratedImageMetadata,
  GoogleProviderOptions,
  ImageContent,
  Model,
  TextContent,
} from '@ank1015/llm-types';
import type { GenerateContentResponse, Part } from '@google/genai';

export const streamGoogle: StreamFunction<'google'> = (
  model: Model<'google'>,
  context: Context,
  options: GoogleProviderOptions,
  id: string
) => {
  const stream = new AssistantMessageEventStream<'google'>();

  (async () => {
    const startTimestamp = Date.now();
    let finalResponse: GenerateContentResponse = {
      text: '',
      data: '',
      functionCalls: [],
      executableCode: '',
      codeExecutionResult: '',
    };

    const output: BaseAssistantMessage<'google'> = {
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

    let toolCallCounter = 0;

    try {
      const client = createClient(model, options.apiKey);
      const params = buildParams(model, context, options);
      const googleStream = await client.models.generateContentStream(params);

      stream.push({ type: 'start', message: { ...output, timestamp: Date.now() } });

      let currentBlock: AssistantResponseContent | AssistantThinkingContent | null = null;
      const blocks = output.content;
      const blockIndex = () => blocks.length - 1;
      const accumulatedParts: Part[] = [];

      const closeCurrentBlock = () => {
        if (!currentBlock) return;

        if (currentBlock.type === 'response') {
          stream.push({
            type: 'text_end',
            contentIndex: blockIndex(),
            content: currentBlock.content,
            message: output,
          });
        } else {
          stream.push({
            type: 'thinking_end',
            contentIndex: blockIndex(),
            content: currentBlock.thinkingText,
            message: output,
          });
        }

        currentBlock = null;
      };

      const appendImageBlock = (image: ImageContent, metadata: GeneratedImageMetadata) => {
        const imageBlock: AssistantResponseContent = {
          type: 'response',
          content: [image],
        };

        output.content.push(imageBlock);
        const imageContentIndex = blockIndex();

        stream.push({
          type: 'image_start',
          contentIndex: imageContentIndex,
          metadata,
          message: output,
        });
        stream.push({
          type: 'image_frame',
          contentIndex: imageContentIndex,
          image,
          message: output,
        });
        stream.push({
          type: 'image_end',
          contentIndex: imageContentIndex,
          image,
          message: output,
        });
      };

      for await (const chunk of googleStream) {
        finalResponse = chunk;
        output.message = finalResponse;
        const candidate = chunk.candidates?.[0];

        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            const lastPart = accumulatedParts[accumulatedParts.length - 1];
            const canMergeText =
              lastPart &&
              part.text !== undefined &&
              lastPart.text !== undefined &&
              part.inlineData === undefined &&
              lastPart.inlineData === undefined &&
              part.functionCall === undefined &&
              lastPart.functionCall === undefined &&
              part.thought === lastPart.thought;

            if (canMergeText) {
              if (part.text) {
                lastPart.text += part.text;
              }
              if (part.thoughtSignature) {
                lastPart.thoughtSignature = part.thoughtSignature;
              }
            } else {
              accumulatedParts.push({ ...part });
            }
          }

          for (const part of candidate.content.parts) {
            if (part.text !== undefined) {
              const isThinking = part.thought === true;
              if (
                !currentBlock ||
                (isThinking && currentBlock.type !== 'thinking') ||
                (!isThinking && currentBlock.type !== 'response')
              ) {
                closeCurrentBlock();

                if (isThinking) {
                  currentBlock = { type: 'thinking', thinkingText: '' };
                  output.content.push(currentBlock);
                  stream.push({
                    type: 'thinking_start',
                    contentIndex: blockIndex(),
                    message: output,
                  });
                } else {
                  currentBlock = { type: 'response', content: [{ type: 'text', content: '' }] };
                  output.content.push(currentBlock);
                  stream.push({
                    type: 'text_start',
                    contentIndex: blockIndex(),
                    message: output,
                  });
                }
              }

              if (currentBlock.type === 'thinking') {
                currentBlock.thinkingText += part.text;
                stream.push({
                  type: 'thinking_delta',
                  contentIndex: blockIndex(),
                  delta: part.text,
                  message: output,
                });
              } else {
                const textIndex = currentBlock.content.findIndex(
                  (content) => content.type === 'text'
                );
                if (textIndex !== -1) {
                  (currentBlock.content[textIndex] as TextContent).content += part.text;
                }
                stream.push({
                  type: 'text_delta',
                  contentIndex: blockIndex(),
                  delta: part.text,
                  message: output,
                });
              }
            }

            if (part.inlineData?.data && part.inlineData.mimeType) {
              closeCurrentBlock();

              const metadata: GeneratedImageMetadata = {
                generationStage: part.thought === true ? 'thought' : 'final',
                generationProvider: 'google',
              };
              const image: ImageContent = {
                type: 'image',
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
                metadata,
              };

              appendImageBlock(image, metadata);
            }

            if (part.functionCall) {
              closeCurrentBlock();

              const providedId = part.functionCall.id;
              const needsNewId =
                !providedId ||
                output.content.some(
                  (block) => block.type === 'toolCall' && block.toolCallId === providedId
                );
              const toolCallId = needsNewId
                ? `${part.functionCall.name}_${Date.now()}_${++toolCallCounter}`
                : providedId;

              const toolCall: AssistantToolCall = {
                type: 'toolCall',
                toolCallId: toolCallId,
                name: part.functionCall.name || '',
                arguments: part.functionCall.args as Record<string, unknown>,
                ...(part.thoughtSignature && { thoughtSignature: part.thoughtSignature }),
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

              output.content.push(toolCall);
              stream.push({
                type: 'toolcall_start',
                contentIndex: blockIndex(),
                message: output,
              });
              stream.push({
                type: 'toolcall_delta',
                contentIndex: blockIndex(),
                delta: JSON.stringify(toolCall.arguments),
                message: output,
              });
              stream.push({
                type: 'toolcall_end',
                contentIndex: blockIndex(),
                toolCall,
                message: output,
              });
            }
          }
        }

        if (candidate?.finishReason) {
          output.stopReason = mapStopReason(candidate.finishReason);
          if (output.content.some((block) => block.type === 'toolCall')) {
            output.stopReason = 'toolUse';
          }
        }

        if (chunk.usageMetadata) {
          output.usage = {
            input:
              (chunk.usageMetadata.promptTokenCount || 0) -
              (chunk.usageMetadata.cachedContentTokenCount || 0),
            output:
              (chunk.usageMetadata.candidatesTokenCount || 0) +
              (chunk.usageMetadata.thoughtsTokenCount || 0),
            cacheRead: chunk.usageMetadata.cachedContentTokenCount || 0,
            cacheWrite: 0,
            totalTokens: chunk.usageMetadata.totalTokenCount || 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          };
          output.usage.cost = calculateCost(model, output.usage);
        }
      }

      closeCurrentBlock();

      if (options?.signal?.aborted) {
        throw new Error('Request was aborted');
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        const finishReason = finalResponse.candidates?.[0]?.finishReason ?? 'unknown';
        throw new Error(`Google stream ended with finish reason: ${finishReason}`);
      }

      if (accumulatedParts.length > 0) {
        finalResponse.candidates = finalResponse.candidates || [];
        finalResponse.candidates[0] = finalResponse.candidates[0] || {};
        finalResponse.candidates[0].content = finalResponse.candidates[0].content || {
          role: 'model',
          parts: [],
        };
        finalResponse.candidates[0].content.role =
          finalResponse.candidates[0].content.role || 'model';
        finalResponse.candidates[0].content.parts = accumulatedParts;
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
      for (const block of output.content) delete (block as { index?: number }).index;
      output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
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
