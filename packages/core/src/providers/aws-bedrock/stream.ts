import {
  ConversationRole,
  ConverseStreamCommand,
  StopReason as BedrockStopReason,
} from '@aws-sdk/client-bedrock-runtime';

import { calculateCost } from '../../models/index.js';
import { AssistantMessageEventStream } from '../../utils/event-stream.js';
import { parseStreamingJson } from '../../utils/json-parse.js';
import { validateToolArguments } from '../../utils/validation.js';

import { getAwsBedrockErrorDetails } from './errors.js';
import {
  buildCommandInput,
  createClient,
  getMockAwsBedrockMessage,
  mapStopReason,
} from './utils.js';

import type {
  AssistantResponseContent,
  AssistantThinkingContent,
  AssistantToolCall,
  AwsBedrockNativeResponse,
  AwsBedrockProviderOptions,
  BaseAssistantMessage,
  Context,
  Model,
  TextContent,
} from '../../types/index.js';
import type { StreamFunction } from '../../utils/types.js';
import type {
  ContentBlock,
  ContentBlockDeltaEvent,
  ContentBlockStartEvent,
  ContentBlockStopEvent,
  ConverseStreamMetadataEvent,
  ConverseStreamOutput,
  MessageStopEvent,
} from '@aws-sdk/client-bedrock-runtime';

type Block = (
  | AssistantThinkingContent
  | AssistantResponseContent
  | (AssistantToolCall & { partialJson?: string })
) & { index?: number };

type NativeBlock = ContentBlock & {
  index?: number;
  partialJson?: string;
};

export const streamAwsBedrock: StreamFunction<'aws-bedrock'> = (
  model: Model<'aws-bedrock'>,
  context: Context,
  options: AwsBedrockProviderOptions,
  id: string
) => {
  const stream = new AssistantMessageEventStream<'aws-bedrock'>();

  (async (): Promise<void> => {
    const startTimestamp = Date.now();
    const finalResponse = getMockAwsBedrockMessage(model.id, id);
    const output: BaseAssistantMessage<'aws-bedrock'> = {
      role: 'assistant',
      api: model.api,
      model,
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

    const blocks = output.content as Block[];
    const nativeBlocks = finalResponse.content as NativeBlock[];

    try {
      const client = createClient(options);
      const commandInput = buildCommandInput(model, context, options);
      const response = await client.send(
        new ConverseStreamCommand(commandInput),
        options.signal ? { abortSignal: options.signal } : undefined
      );
      finalResponse.$metadata = response.$metadata;

      if (!response.stream) {
        throw new Error('AWS Bedrock response stream was empty.');
      }

      for await (const event of response.stream) {
        handleStreamEvent(event, blocks, nativeBlocks, output, finalResponse, stream, context);
      }

      if (options.signal?.aborted) {
        throw new Error('Request was aborted');
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        throw new Error('AWS Bedrock stream ended with an error.');
      }

      cleanupNativeBlocks(nativeBlocks);
      output.timestamp = Date.now();
      output.duration = output.timestamp - startTimestamp;
      stream.push({ type: 'done', reason: output.stopReason, message: output });
      stream.end(output);
    } catch (error) {
      for (const block of blocks) {
        delete block.index;
        if (block.type === 'toolCall') {
          delete (block as AssistantToolCall & { partialJson?: string }).partialJson;
        }
      }
      cleanupNativeBlocks(nativeBlocks);
      output.stopReason = options.signal?.aborted ? 'aborted' : 'error';
      output.error = getAwsBedrockErrorDetails(error);
      output.errorMessage = output.error.message;
      output.timestamp = Date.now();
      output.duration = output.timestamp - startTimestamp;
      stream.push({ type: 'error', reason: output.stopReason, message: output });
      stream.end(output);
    }
  })();

  return stream;
};

function handleStreamEvent(
  event: ConverseStreamOutput,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  finalResponse: AwsBedrockNativeResponse,
  stream: AssistantMessageEventStream<'aws-bedrock'>,
  context: Context
): void {
  if (event.messageStart) {
    if (event.messageStart.role !== ConversationRole.ASSISTANT) {
      throw new Error('Unexpected AWS Bedrock message role.');
    }
    stream.push({ type: 'start', message: { ...output, timestamp: Date.now() } });
  } else if (event.contentBlockStart) {
    handleContentBlockStart(event.contentBlockStart, blocks, nativeBlocks, output, stream);
  } else if (event.contentBlockDelta) {
    handleContentBlockDelta(event.contentBlockDelta, blocks, nativeBlocks, output, stream);
  } else if (event.contentBlockStop) {
    handleContentBlockStop(event.contentBlockStop, blocks, nativeBlocks, output, stream, context);
  } else if (event.messageStop) {
    handleMessageStop(event.messageStop, output, finalResponse);
  } else if (event.metadata) {
    handleMetadata(event.metadata, output, finalResponse);
  } else if (event.internalServerException) {
    throw event.internalServerException;
  } else if (event.modelStreamErrorException) {
    throw event.modelStreamErrorException;
  } else if (event.validationException) {
    throw event.validationException;
  } else if (event.throttlingException) {
    throw event.throttlingException;
  } else if (event.serviceUnavailableException) {
    throw event.serviceUnavailableException;
  }
}

function handleContentBlockStart(
  event: ContentBlockStartEvent,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>
): void {
  const index = event.contentBlockIndex;
  if (index === undefined) return;

  if (event.start?.toolUse) {
    const toolUse = event.start.toolUse;
    const block: Block = {
      type: 'toolCall',
      toolCallId: toolUse.toolUseId || '',
      name: toolUse.name || '',
      arguments: {},
      partialJson: '',
      index,
    };
    const nativeBlock: NativeBlock = {
      toolUse: {
        toolUseId: toolUse.toolUseId || '',
        name: toolUse.name || '',
        input: {},
        type: toolUse.type,
      },
      partialJson: '',
      index,
    };
    output.content.push(block);
    nativeBlocks.push(nativeBlock);
    stream.push({ type: 'toolcall_start', contentIndex: blocks.length - 1, message: output });
  }
}

function handleContentBlockDelta(
  event: ContentBlockDeltaEvent,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>
): void {
  const contentBlockIndex = event.contentBlockIndex;
  if (contentBlockIndex === undefined || !event.delta) return;

  if (event.delta.text !== undefined) {
    handleTextDelta(contentBlockIndex, event.delta.text, blocks, nativeBlocks, output, stream);
  } else if (event.delta.toolUse?.input !== undefined) {
    handleToolDelta(
      contentBlockIndex,
      event.delta.toolUse.input,
      blocks,
      nativeBlocks,
      output,
      stream
    );
  } else if (event.delta.reasoningContent) {
    const delta = event.delta.reasoningContent;
    if (delta.text !== undefined) {
      handleThinkingDelta(contentBlockIndex, delta.text, blocks, nativeBlocks, output, stream);
    }
    if (delta.signature !== undefined) {
      const nativeBlock = findNativeBlock(nativeBlocks, contentBlockIndex);
      if (nativeBlock?.reasoningContent?.reasoningText) {
        nativeBlock.reasoningContent.reasoningText.signature =
          (nativeBlock.reasoningContent.reasoningText.signature || '') + delta.signature;
      }
    }
  }
}

function handleTextDelta(
  contentBlockIndex: number,
  delta: string,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>
): void {
  let index = blocks.findIndex((block) => block.index === contentBlockIndex);
  let block = blocks[index];

  if (!block) {
    block = {
      type: 'response',
      response: [{ type: 'text', content: '' }],
      index: contentBlockIndex,
    };
    output.content.push(block);
    nativeBlocks.push({ text: '', index: contentBlockIndex });
    index = blocks.length - 1;
    stream.push({ type: 'text_start', contentIndex: index, message: output });
  }

  if (block.type === 'response') {
    const textBlock = block.response.find(
      (content): content is TextContent => content.type === 'text'
    );
    if (textBlock) {
      textBlock.content += delta;
      stream.push({ type: 'text_delta', contentIndex: index, delta, message: output });
    }
  }

  const nativeBlock = findNativeBlock(nativeBlocks, contentBlockIndex);
  if (nativeBlock?.text !== undefined) {
    nativeBlock.text += delta;
  }
}

function handleThinkingDelta(
  contentBlockIndex: number,
  delta: string,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>
): void {
  let index = blocks.findIndex((block) => block.index === contentBlockIndex);
  let block = blocks[index];

  if (!block) {
    block = {
      type: 'thinking',
      thinkingText: '',
      index: contentBlockIndex,
    };
    output.content.push(block);
    nativeBlocks.push({
      reasoningContent: { reasoningText: { text: '' } },
      index: contentBlockIndex,
    });
    index = blocks.length - 1;
    stream.push({ type: 'thinking_start', contentIndex: index, message: output });
  }

  if (block.type === 'thinking') {
    block.thinkingText += delta;
    stream.push({ type: 'thinking_delta', contentIndex: index, delta, message: output });
  }

  const nativeBlock = findNativeBlock(nativeBlocks, contentBlockIndex);
  if (nativeBlock?.reasoningContent?.reasoningText) {
    nativeBlock.reasoningContent.reasoningText.text =
      (nativeBlock.reasoningContent.reasoningText.text || '') + delta;
  }
}

function handleToolDelta(
  contentBlockIndex: number,
  delta: string,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>
): void {
  const index = blocks.findIndex((block) => block.index === contentBlockIndex);
  const block = blocks[index];
  if (block?.type === 'toolCall') {
    block.partialJson = (block.partialJson || '') + delta;
    block.arguments = parseStreamingJson(block.partialJson || '');
    stream.push({ type: 'toolcall_delta', contentIndex: index, delta, message: output });
  }

  const nativeBlock = findNativeBlock(nativeBlocks, contentBlockIndex);
  if (nativeBlock?.toolUse) {
    nativeBlock.partialJson = (nativeBlock.partialJson || '') + delta;
    nativeBlock.toolUse.input = parseStreamingJson(nativeBlock.partialJson || '');
  }
}

function handleContentBlockStop(
  event: ContentBlockStopEvent,
  blocks: Block[],
  nativeBlocks: NativeBlock[],
  output: BaseAssistantMessage<'aws-bedrock'>,
  stream: AssistantMessageEventStream<'aws-bedrock'>,
  context: Context
): void {
  const contentBlockIndex = event.contentBlockIndex;
  if (contentBlockIndex === undefined) return;

  const index = blocks.findIndex((block) => block.index === contentBlockIndex);
  const block = blocks[index];
  const nativeBlock = findNativeBlock(nativeBlocks, contentBlockIndex);

  if (nativeBlock) {
    if (nativeBlock.toolUse) {
      nativeBlock.toolUse.input = parseStreamingJson(nativeBlock.partialJson || '');
    }
    delete nativeBlock.index;
    delete nativeBlock.partialJson;
  }

  if (!block) return;
  delete block.index;

  if (block.type === 'response') {
    stream.push({
      type: 'text_end',
      contentIndex: index,
      content: block.response,
      message: output,
    });
  } else if (block.type === 'thinking') {
    stream.push({
      type: 'thinking_end',
      contentIndex: index,
      content: block.thinkingText,
      message: output,
    });
  } else if (block.type === 'toolCall') {
    block.arguments = parseStreamingJson(block.partialJson || '');
    const tool = context.tools?.find((candidate) => candidate.name === block.name);
    if (tool) {
      block.arguments = validateToolArguments(tool, block);
    }
    delete block.partialJson;
    stream.push({ type: 'toolcall_end', contentIndex: index, toolCall: block, message: output });
  }
}

function handleMessageStop(
  event: MessageStopEvent,
  output: BaseAssistantMessage<'aws-bedrock'>,
  finalResponse: AwsBedrockNativeResponse
): void {
  finalResponse.stopReason = event.stopReason;
  output.stopReason = mapStopReason(event.stopReason);

  if (
    event.stopReason === BedrockStopReason.MALFORMED_MODEL_OUTPUT ||
    event.stopReason === BedrockStopReason.MALFORMED_TOOL_USE ||
    event.stopReason === BedrockStopReason.GUARDRAIL_INTERVENED ||
    event.stopReason === BedrockStopReason.CONTENT_FILTERED
  ) {
    output.stopReason = 'error';
  }
}

function handleMetadata(
  event: ConverseStreamMetadataEvent,
  output: BaseAssistantMessage<'aws-bedrock'>,
  finalResponse: AwsBedrockNativeResponse
): void {
  finalResponse.usage = event.usage;
  finalResponse.metrics = event.metrics;

  if (!event.usage) return;

  output.usage.input = event.usage.inputTokens || 0;
  output.usage.output = event.usage.outputTokens || 0;
  output.usage.cacheRead = event.usage.cacheReadInputTokens || 0;
  output.usage.cacheWrite = event.usage.cacheWriteInputTokens || 0;
  output.usage.totalTokens =
    event.usage.totalTokens ||
    output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
  output.usage.cost = calculateCost(output.model, output.usage);
}

function findNativeBlock(
  blocks: NativeBlock[],
  contentBlockIndex: number
): NativeBlock | undefined {
  return blocks.find((block) => block.index === contentBlockIndex);
}

function cleanupNativeBlocks(blocks: NativeBlock[]): void {
  for (const block of blocks) {
    delete block.index;
    delete block.partialJson;
  }
}
