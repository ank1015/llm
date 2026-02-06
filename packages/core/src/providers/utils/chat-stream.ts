/**
 * Shared Chat Completions streaming engine.
 *
 * Handles the full streaming lifecycle for OpenAI Chat Completions API-compatible providers.
 * Provider-specific differences are injected via ChatStreamConfig.
 *
 * Used by: DeepSeek, Kimi, Z.AI
 */

import { calculateCost } from '../../models.js';
import { AssistantMessageEventStream } from '../../utils/event-stream.js';
import { parseStreamingJson } from '../../utils/json-parse.js';
import { validateToolArguments } from '../../utils/validation.js';

import { createMockChatCompletion } from './chat-completion-utils.js';

import type {
  Api,
  AssistantResponseContent,
  AssistantThinkingContent,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
  Model,
  StopReason,
  TextContent,
  Tool,
} from '@ank1015/llm-types';
import type OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions.js';

/** Delta type extension for providers that include reasoning_content */
interface ReasoningChunkDelta {
  reasoning_content?: string | null;
}

/**
 * Provider-specific configuration for the shared chat stream.
 */
export interface ChatStreamConfig<_TApi extends Api> {
  /** Maps provider's finish_reason to unified StopReason */
  mapStopReason: (finishReason: string | null | undefined) => StopReason;
  /**
   * Extracts cache hit tokens from a usage object.
   * The usage object is passed as Record<string, unknown> since each provider
   * uses different field paths for cache tokens.
   */
  extractCacheTokens: (usage: Record<string, unknown>) => number;
  /**
   * Optional: resolves the usage data from a chunk/choice.
   * Default behavior uses chunk.usage. Kimi overrides this to also check choice.usage.
   */
  resolveUsage?: (
    chunk: { usage?: unknown },
    choice: Record<string, unknown>
  ) => Record<string, unknown> | undefined;
  /**
   * Optional: extra params merged into the stream create call.
   * Kimi uses this for stream_options: { include_usage: true }.
   */
  streamParams?: Record<string, unknown>;
}

/**
 * Creates a Chat Completions stream with the shared streaming engine.
 *
 * @param config - Provider-specific hooks
 * @param client - OpenAI-compatible client
 * @param params - Chat completion params (stream: false, will be overridden)
 * @param model - The model configuration
 * @param context - Conversation context (for tool validation)
 * @param signal - AbortSignal for cancellation
 * @param id - Unique request ID
 */
export function createChatCompletionStream<
  TApi extends Api,
  TParams extends ChatCompletionCreateParamsNonStreaming = ChatCompletionCreateParamsNonStreaming,
>(
  config: ChatStreamConfig<TApi>,
  client: OpenAI,
  params: TParams,
  model: Model<TApi>,
  context: Context,
  signal: AbortSignal | undefined,
  id: string
): AssistantMessageEventStream<TApi> {
  const stream = new AssistantMessageEventStream<TApi>();

  (async () => {
    const startTimestamp = Date.now();
    let finalResponse: ChatCompletion = createMockChatCompletion(model.id, id);

    const output: BaseAssistantMessage<TApi> = {
      role: 'assistant',
      api: model.api,
      model: model,
      id,
      message: finalResponse as BaseAssistantMessage<TApi>['message'],
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
    let accumulatedContent = '';
    let accumulatedReasoningContent = '';
    const accumulatedToolCalls: Map<
      number,
      { id: string; type: 'function'; function: { name: string; arguments: string } }
    > = new Map();

    try {
      const streamingParams: ChatCompletionCreateParamsStreaming = {
        ...params,
        stream: true,
        ...config.streamParams,
      };

      const providerStream = await client.chat.completions.create(streamingParams, { signal });

      stream.push({ type: 'start', message: { ...output, timestamp: Date.now() } });

      let currentBlock:
        | AssistantThinkingContent
        | AssistantResponseContent
        | (AssistantToolCall & { partialJson: string })
        | null = null;
      const blocks = output.content;
      const blockIndex = () => blocks.length - 1;

      const toolCallBlocks: Map<number, AssistantToolCall & { partialJson: string }> = new Map();

      for await (const chunk of providerStream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta as typeof choice.delta & ReasoningChunkDelta;

        // Handle reasoning/thinking content
        if (delta.reasoning_content) {
          accumulatedReasoningContent += delta.reasoning_content;

          if (!currentBlock || currentBlock.type !== 'thinking') {
            if (currentBlock) {
              if (currentBlock.type === 'response') {
                stream.push({
                  type: 'text_end',
                  contentIndex: blockIndex(),
                  content: currentBlock.content,
                  message: output,
                });
              }
            }
            currentBlock = { type: 'thinking', thinkingText: '' };
            output.content.push(currentBlock);
            stream.push({
              type: 'thinking_start',
              contentIndex: blockIndex(),
              message: output,
            });
          }

          if (currentBlock.type === 'thinking') {
            currentBlock.thinkingText += delta.reasoning_content;
            stream.push({
              type: 'thinking_delta',
              contentIndex: blockIndex(),
              delta: delta.reasoning_content,
              message: output,
            });
          }
        }

        // Handle text content
        if (delta.content) {
          accumulatedContent += delta.content;

          if (!currentBlock || currentBlock.type === 'thinking') {
            if (currentBlock && currentBlock.type === 'thinking') {
              stream.push({
                type: 'thinking_end',
                contentIndex: blockIndex(),
                content: currentBlock.thinkingText,
                message: output,
              });
            }
            currentBlock = { type: 'response', content: [{ type: 'text', content: '' }] };
            output.content.push(currentBlock);
            stream.push({
              type: 'text_start',
              contentIndex: blockIndex(),
              message: output,
            });
          }

          if (currentBlock.type === 'response') {
            const index = currentBlock.content.findIndex((c) => c.type === 'text');
            if (index !== -1) {
              (currentBlock.content[index] as TextContent).content += delta.content;
            }
            stream.push({
              type: 'text_delta',
              contentIndex: blockIndex(),
              delta: delta.content,
              message: output,
            });
          }
        }

        // Handle tool calls
        if (delta.tool_calls) {
          if (currentBlock && currentBlock.type !== 'toolCall') {
            if (currentBlock.type === 'response') {
              stream.push({
                type: 'text_end',
                contentIndex: blockIndex(),
                content: currentBlock.content,
                message: output,
              });
            } else if (currentBlock.type === 'thinking') {
              stream.push({
                type: 'thinking_end',
                contentIndex: blockIndex(),
                content: currentBlock.thinkingText,
                message: output,
              });
            }
            currentBlock = null;
          }

          for (const toolCallDelta of delta.tool_calls) {
            const toolIndex = toolCallDelta.index;

            if (!accumulatedToolCalls.has(toolIndex)) {
              accumulatedToolCalls.set(toolIndex, {
                id: toolCallDelta.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }
            const accumulated = accumulatedToolCalls.get(toolIndex)!;

            if (toolCallDelta.id) {
              accumulated.id = toolCallDelta.id;
            }
            if (toolCallDelta.function?.name) {
              accumulated.function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              accumulated.function.arguments += toolCallDelta.function.arguments;
            }

            if (!toolCallBlocks.has(toolIndex)) {
              const toolBlock: AssistantToolCall & { partialJson: string } = {
                type: 'toolCall',
                toolCallId: accumulated.id,
                name: accumulated.function.name,
                arguments: {},
                partialJson: '',
              };
              toolCallBlocks.set(toolIndex, toolBlock);
              output.content.push(toolBlock);
              currentBlock = toolBlock;
              stream.push({
                type: 'toolcall_start',
                contentIndex: blockIndex(),
                message: output,
              });
            }

            const toolBlock = toolCallBlocks.get(toolIndex)!;

            if (toolCallDelta.id) {
              toolBlock.toolCallId = accumulated.id;
            }
            if (toolCallDelta.function?.name) {
              toolBlock.name = accumulated.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              toolBlock.partialJson += toolCallDelta.function.arguments;
              toolBlock.arguments = parseStreamingJson(toolBlock.partialJson);
              stream.push({
                type: 'toolcall_delta',
                contentIndex: blocks.indexOf(toolBlock),
                delta: toolCallDelta.function.arguments,
                message: output,
              });
            }
          }
        }

        // Handle finish reason
        if (choice.finish_reason) {
          output.stopReason = config.mapStopReason(choice.finish_reason);
        }

        // Handle usage (typically in the last chunk)
        const usageData = config.resolveUsage
          ? config.resolveUsage(chunk, choice as unknown as Record<string, unknown>)
          : (chunk.usage as Record<string, unknown> | undefined);

        if (usageData) {
          const cacheHitTokens = config.extractCacheTokens(usageData);
          output.usage = {
            input: ((usageData.prompt_tokens as number | undefined) || 0) - cacheHitTokens,
            output: (usageData.completion_tokens as number | undefined) || 0,
            cacheRead: cacheHitTokens,
            cacheWrite: 0,
            totalTokens: (usageData.total_tokens as number | undefined) || 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          };
          output.usage.cost = calculateCost(model, output.usage);
        }
      }

      // End any remaining blocks
      if (currentBlock) {
        if (currentBlock.type === 'response') {
          stream.push({
            type: 'text_end',
            contentIndex: blockIndex(),
            content: currentBlock.content,
            message: output,
          });
        } else if (currentBlock.type === 'thinking') {
          stream.push({
            type: 'thinking_end',
            contentIndex: blockIndex(),
            content: currentBlock.thinkingText,
            message: output,
          });
        }
      }

      // End tool call blocks and validate arguments
      for (const [, toolBlock] of toolCallBlocks) {
        try {
          toolBlock.arguments = JSON.parse(toolBlock.partialJson || '{}');
        } catch {
          // Keep the parsed streaming result
        }

        if (context.tools) {
          const tool = (context.tools as readonly Tool[]).find((t) => t.name === toolBlock.name);
          if (tool) {
            try {
              toolBlock.arguments = validateToolArguments(tool, toolBlock) as Record<
                string,
                unknown
              >;
            } catch {
              // Keep the parsed arguments — validation errors are handled
              // downstream by the agent runner, which sends them back to the LLM
            }
          }
        }

        const { partialJson: _, ...cleanToolCall } = toolBlock;
        stream.push({
          type: 'toolcall_end',
          contentIndex: blocks.indexOf(toolBlock),
          toolCall: cleanToolCall,
          message: output,
        });
      }

      // Clean up partialJson from output content
      for (const block of output.content) {
        if ('partialJson' in block) {
          delete (block as { partialJson?: string }).partialJson;
        }
      }

      // Ensure stopReason is toolUse if we have tool calls
      if (output.content.some((b) => b.type === 'toolCall') && output.stopReason === 'stop') {
        output.stopReason = 'toolUse';
      }

      if (signal?.aborted) {
        throw new Error('Request was aborted');
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        throw new Error(
          `Stream ended with status: ${output.stopReason}${output.errorMessage ? ` - ${output.errorMessage}` : ''}`
        );
      }

      // Build final ChatCompletion response
      finalResponse = {
        id: `chatcmpl-${id}`,
        object: 'chat.completion',
        created: Math.floor(startTimestamp / 1000),
        model: model.id,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: accumulatedContent || null,
              refusal: null,
              ...(accumulatedToolCalls.size > 0 && {
                tool_calls: Array.from(accumulatedToolCalls.values()),
              }),
            },
            finish_reason: output.stopReason === 'toolUse' ? 'tool_calls' : 'stop',
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: output.usage.input + output.usage.cacheRead,
          completion_tokens: output.usage.output,
          total_tokens: output.usage.totalTokens,
        },
      };
      output.message = finalResponse as BaseAssistantMessage<TApi>['message'];

      // Add reasoning_content to the message if present
      if (accumulatedReasoningContent) {
        const firstChoice = finalResponse.choices[0];
        if (firstChoice) {
          (
            firstChoice.message as typeof firstChoice.message & { reasoning_content?: string }
          ).reasoning_content = accumulatedReasoningContent;
        }
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
      for (const block of output.content) {
        delete (block as { partialJson?: string }).partialJson;
      }
      output.stopReason = signal?.aborted ? 'aborted' : 'error';
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
}
