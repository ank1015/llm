import { calculateCost } from '../../models.js';
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
  GoogleProviderOptions,
  Model,
  TextContent,
} from '@ank1015/llm-types';
import type { Content, GenerateContentResponse, Part } from '@google/genai';

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

    // Counter for generating unique tool call IDs
    let toolCallCounter = 0;

    try {
      const client = createClient(model, options.apiKey);
      const params = buildParams(model, context, options);

      const googleStream = await client.models.generateContentStream(params);

      stream.push({ type: 'start', message: { ...output, timestamp: Date.now() } });
      let currentBlock: AssistantResponseContent | AssistantThinkingContent | null = null;
      const blocks = output.content;
      const blockIndex = () => blocks.length - 1;
      const messageInputs: Content[] = [];
      const accumulatedParts: Part[] = [];

      for await (const chunk of googleStream) {
        finalResponse = chunk;
        output.message = finalResponse;
        const candidate = chunk.candidates?.[0];

        if (candidate?.content?.parts) {
          // Accumulate parts, merging consecutive parts of the same type
          for (const part of candidate.content.parts) {
            const lastPart = accumulatedParts[accumulatedParts.length - 1];

            // Check if we can merge with the last part
            const canMerge =
              lastPart &&
              part.text !== undefined &&
              lastPart.text !== undefined &&
              part.thought === lastPart.thought; // Both thinking or both regular text

            if (canMerge) {
              // Merge the text into the last part
              if (part.text) {
                lastPart.text += part.text;
              }
              // Copy over thoughtSignature if present
              if (part.thoughtSignature) {
                lastPart.thoughtSignature = part.thoughtSignature;
              }
            } else {
              // Add as a new part
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
                if (currentBlock) {
                  if (currentBlock.type === 'response') {
                    stream.push({
                      type: 'text_end',
                      contentIndex: blocks.length - 1,
                      content: currentBlock.content,
                      message: { ...output, timestamp: Date.now() },
                    });
                  } else {
                    stream.push({
                      type: 'thinking_end',
                      contentIndex: blockIndex(),
                      content: currentBlock.thinkingText,
                      message: { ...output, timestamp: Date.now() },
                    });
                  }
                }
                if (isThinking) {
                  currentBlock = { type: 'thinking', thinkingText: '' };
                  output.content.push(currentBlock);
                  stream.push({
                    type: 'thinking_start',
                    contentIndex: blockIndex(),
                    message: { ...output, timestamp: Date.now() },
                  });
                } else {
                  currentBlock = { type: 'response', content: [{ type: 'text', content: '' }] };
                  output.content.push(currentBlock);
                  stream.push({
                    type: 'text_start',
                    contentIndex: blockIndex(),
                    message: { ...output, timestamp: Date.now() },
                  });
                }
              }
              if (currentBlock.type === 'thinking') {
                currentBlock.thinkingText += part.text;
                stream.push({
                  type: 'thinking_delta',
                  contentIndex: blockIndex(),
                  delta: part.text,
                  message: { ...output, timestamp: Date.now() },
                });
              } else {
                const index = currentBlock.content.findIndex((c) => c.type === 'text');
                if (index !== -1) {
                  (currentBlock.content[index] as TextContent).content += part.text;
                }
                stream.push({
                  type: 'text_delta',
                  contentIndex: blockIndex(),
                  delta: part.text,
                  message: { ...output, timestamp: Date.now() },
                });
              }
            }

            if (part.functionCall) {
              if (currentBlock) {
                if (currentBlock.type === 'response') {
                  stream.push({
                    type: 'text_end',
                    contentIndex: blockIndex(),
                    content: currentBlock.content,
                    message: { ...output, timestamp: Date.now() },
                  });
                } else {
                  stream.push({
                    type: 'thinking_end',
                    contentIndex: blockIndex(),
                    content: currentBlock.thinkingText,
                    message: { ...output, timestamp: Date.now() },
                  });
                }
                currentBlock = null;
              }

              // Generate unique ID if not provided or if it's a duplicate
              const providedId = part.functionCall.id;
              const needsNewId =
                !providedId ||
                output.content.some((b) => b.type === 'toolCall' && b.toolCallId === providedId);
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

              // Validate tool arguments if tool definition is available
              if (context.tools) {
                const tool = context.tools.find((t) => t.name === toolCall.name);
                if (tool) {
                  toolCall.arguments = validateToolArguments(tool, toolCall) as Record<
                    string,
                    unknown
                  >;
                }
              }

              output.content.push(toolCall);
              stream.push({
                type: 'toolcall_start',
                contentIndex: blockIndex(),
                message: { ...output, timestamp: Date.now() },
              });
              stream.push({
                type: 'toolcall_delta',
                contentIndex: blockIndex(),
                delta: JSON.stringify(toolCall.arguments),
                message: { ...output, timestamp: Date.now() },
              });
              stream.push({
                type: 'toolcall_end',
                contentIndex: blockIndex(),
                toolCall,
                message: { ...output, timestamp: Date.now() },
              });
            }
          }
        }

        if (candidate?.finishReason) {
          output.stopReason = mapStopReason(candidate.finishReason);
          if (output.content.some((b) => b.type === 'toolCall')) {
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

      if (currentBlock) {
        if (currentBlock.type === 'response') {
          stream.push({
            type: 'text_end',
            contentIndex: blockIndex(),
            content: currentBlock.content,
            message: { ...output, timestamp: Date.now() },
          });
        } else {
          stream.push({
            type: 'thinking_end',
            contentIndex: blockIndex(),
            content: currentBlock.thinkingText,
            message: { ...output, timestamp: Date.now() },
          });
        }
      }

      if (options?.signal?.aborted) {
        throw new Error('Request was aborted');
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        throw new Error('An unkown error ocurred');
      }

      // Build the complete Content from accumulated parts
      if (accumulatedParts.length > 0) {
        messageInputs.push({
          role: 'model',
          parts: accumulatedParts,
        });
      }
      finalResponse.candidates = [];
      for (const messageInput of messageInputs) {
        finalResponse.candidates.push({
          content: messageInput,
        });
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
      for (const block of output.content) delete (block as any).index;
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
