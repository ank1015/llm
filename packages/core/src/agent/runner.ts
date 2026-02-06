import { generateUUID } from '../utils/uuid.js';
import { validateToolArguments } from '../utils/validation.js';

import { getMockMessage } from './mock.js';
import { buildToolResultMessage } from './utils.js';

import type {
  AgentEventEmitter,
  AgentRunnerCallbacks,
  AgentRunnerConfig,
  AgentRunnerResult,
} from './types.js';
import type {
  AgentTool,
  AgentToolResult,
  Api,
  AssistantResponse,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
  Message,
  OptionsForApi,
  QueuedMessage,
  ToolExecutionContext,
  ToolResultMessage,
  WithOptionalKey,
} from '@ank1015/llm-types';

/**
 * Runs the agent loop: calling LLM, processing responses, executing tools.
 * This is a stateless function that takes all required inputs.
 *
 * @param config - Configuration including LLM functions, tools, and budget
 * @param initialMessages - Starting conversation messages
 * @param emit - Event emitter for real-time updates
 * @param signal - AbortSignal for cancellation
 * @param callbacks - Callbacks for state management
 * @returns Result containing new messages and metadata
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function runAgentLoop(
  config: AgentRunnerConfig,
  initialMessages: Message[],
  emit: AgentEventEmitter,
  signal: AbortSignal,
  callbacks: AgentRunnerCallbacks
): Promise<AgentRunnerResult> {
  const newMessages: Message[] = [];
  const updatedMessages = [...initialMessages];
  const providerOptions = { ...config.provider.providerOptions, signal };
  const streamAssistantMessage = config.streamAssistantMessage ?? true;

  let hasMoreToolCalls = true;
  let inTurn = false;
  let queuedMessages: QueuedMessage<unknown>[] = (await config.getQueuedMessages()) || [];

  // Track accumulated cost within this run execution if budget is provided
  let currentRunCost = 0;

  try {
    emit({ type: 'agent_start' });

    while (hasMoreToolCalls || queuedMessages.length > 0) {
      if (signal.aborted) {
        emit({ type: 'agent_end', agentMessages: newMessages });
        return {
          messages: newMessages,
          totalCost: currentRunCost,
          aborted: true,
        };
      }

      emit({ type: 'turn_start' });
      inTurn = true;

      // Process queued messages first (inject before next assistant response)
      if (queuedMessages.length > 0) {
        for (const { llm } of queuedMessages) {
          if (llm) {
            emit({ type: 'message_start', messageId: llm.id, messageType: llm.role, message: llm });
            emit({ type: 'message_end', messageId: llm.id, messageType: llm.role, message: llm });
            updatedMessages.push(llm);
            newMessages.push(llm);
            callbacks.appendMessage(llm);
          }
        }
        queuedMessages = [];
      }

      const assistantMessage = await callAssistant(
        config,
        updatedMessages,
        providerOptions,
        signal,
        emit,
        streamAssistantMessage
      );
      newMessages.push(assistantMessage);
      callbacks.appendMessage(assistantMessage);
      updatedMessages.push(assistantMessage);

      // Track cost
      currentRunCost += assistantMessage.usage.cost.total;

      // Check budget limits
      if (config.budget) {
        const totalCost = config.budget.currentCost + currentRunCost;
        const isCostLimitExceeded = config.budget.costLimit && totalCost >= config.budget.costLimit;
        const isContextLimitExceeded =
          config.budget.contextLimit && assistantMessage.usage.input >= config.budget.contextLimit;

        if (isCostLimitExceeded || isContextLimitExceeded) {
          const toolCalls = assistantMessage.content.filter((c) => c.type === 'toolCall');
          const hasMoreActions = toolCalls.length > 0 || queuedMessages.length > 0;

          if (hasMoreActions) {
            if (isCostLimitExceeded) {
              throw new Error(`Cost limit exceeded: ${totalCost} >= ${config.budget.costLimit}`);
            }
            if (isContextLimitExceeded) {
              throw new Error(
                `Context limit exceeded: ${assistantMessage.usage.input} >= ${config.budget.contextLimit}`
              );
            }
          }
        }
      }

      const stopReason = assistantMessage.stopReason;
      if (stopReason === 'aborted' || stopReason === 'error') {
        emit({ type: 'turn_end' });
        emit({ type: 'agent_end', agentMessages: newMessages });
        const result: AgentRunnerResult = {
          messages: newMessages,
          totalCost: currentRunCost,
          aborted: stopReason === 'aborted',
        };
        if (stopReason === 'error' && assistantMessage.errorMessage) {
          result.error = assistantMessage.errorMessage;
        }
        return result;
      }

      const assistantMessageContent = assistantMessage.content;

      // Check for tool calls
      const toolCalls = assistantMessageContent.filter((c) => c.type === 'toolCall');
      hasMoreToolCalls = toolCalls.length > 0;

      if (hasMoreToolCalls) {
        const toolResults = await executeToolCalls(
          config.tools,
          assistantMessageContent,
          updatedMessages,
          signal,
          emit,
          callbacks
        );
        updatedMessages.push(...toolResults);
        newMessages.push(...toolResults);
        callbacks.appendMessages(toolResults);
      }

      emit({ type: 'turn_end' });
      inTurn = false;

      // Get queued messages after turn completes
      queuedMessages = (await config.getQueuedMessages()) || [];
    }

    emit({ type: 'agent_end', agentMessages: newMessages });
    return {
      messages: newMessages,
      totalCost: currentRunCost,
      aborted: false,
    };
  } catch (error) {
    if (inTurn) {
      emit({ type: 'turn_end' });
    }
    emit({ type: 'agent_end', agentMessages: newMessages });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      messages: newMessages,
      totalCost: currentRunCost,
      aborted: false,
      error: errorMessage,
    };
  }
}

/**
 * Calls the LLM and emits message events.
 */
async function callAssistant<TApi extends Api>(
  config: AgentRunnerConfig,
  messages: Message[],
  providerOptions: WithOptionalKey<OptionsForApi<TApi>>,
  signal: AbortSignal,
  emit: AgentEventEmitter,
  streamAssistantMessage: boolean
): Promise<BaseAssistantMessage<TApi>> {
  const assistantMessageId = generateUUID();
  const initialMessage = getMockMessage(config.provider.model);

  emit({
    type: 'message_start',
    messageId: assistantMessageId,
    messageType: 'assistant',
    message: initialMessage,
  });

  const context: Context = { messages, tools: config.tools };
  if (config.systemPrompt !== undefined) {
    context.systemPrompt = config.systemPrompt;
  }

  // Type assertion is safe: the bound functions (AgentStreamFunction/AgentCompleteFunction)
  // handle apiKey injection, and exactOptionalPropertyTypes prevents direct generic assignment.
  const opts = providerOptions as WithOptionalKey<OptionsForApi<Api>>;

  if (streamAssistantMessage) {
    const assistantStream = config.stream(config.provider.model, context, opts, assistantMessageId);

    for await (const ev of assistantStream) {
      emit({
        type: 'message_update',
        messageId: assistantMessageId,
        messageType: 'assistant',
        message: ev,
      });
    }

    const assistantMessage = await assistantStream.result();

    emit({
      type: 'message_end',
      messageId: assistantMessageId,
      messageType: 'assistant',
      message: assistantMessage,
    });
    return assistantMessage as BaseAssistantMessage<TApi>;
  } else {
    const assistantMessage = await config.complete(
      config.provider.model,
      context,
      opts,
      assistantMessageId
    );
    emit({
      type: 'message_end',
      messageId: assistantMessageId,
      messageType: 'assistant',
      message: assistantMessage,
    });
    return assistantMessage as BaseAssistantMessage<TApi>;
  }
}

/**
 * Executes all tool calls from an assistant response.
 */
async function executeToolCalls(
  tools: AgentTool[],
  assistantMessageContent: AssistantResponse,
  messages: Message[],
  signal: AbortSignal,
  emit: AgentEventEmitter,
  callbacks: AgentRunnerCallbacks
): Promise<ToolResultMessage[]> {
  const toolCalls = assistantMessageContent.filter(
    (c): c is AssistantToolCall => c.type === 'toolCall'
  );
  const results: ToolResultMessage[] = [];

  // Create execution context with current messages (read-only)
  const context: ToolExecutionContext = {
    messages: Object.freeze([...messages]),
  };

  for (const toolCall of toolCalls) {
    if (signal.aborted) break;

    const tool = tools.find((t) => t.name === toolCall.name);

    // Track pending and emit start
    callbacks.addPendingToolCall(toolCall.toolCallId);
    emit({
      type: 'tool_execution_start',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });

    // Execute the tool
    const { result, isError, errorDetails } = await executeSingleTool(
      tool,
      toolCall,
      signal,
      (partialResult) =>
        emit({
          type: 'tool_execution_update',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.name,
          args: toolCall.arguments,
          partialResult,
        }),
      context
    );

    // Cleanup and emit end
    callbacks.removePendingToolCall(toolCall.toolCallId);
    emit({
      type: 'tool_execution_end',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.name,
      result,
      isError,
    });

    // Build and emit message
    const toolResultMessage = buildToolResultMessage(toolCall, result, isError, errorDetails);
    results.push(toolResultMessage);

    emit({
      type: 'message_start',
      messageId: toolResultMessage.id,
      messageType: 'toolResult',
      message: toolResultMessage,
    });
    emit({
      type: 'message_end',
      messageId: toolResultMessage.id,
      messageType: 'toolResult',
      message: toolResultMessage,
    });
  }

  return results;
}

/**
 * Executes a single tool and returns the result.
 */
async function executeSingleTool(
  tool: AgentTool | undefined,
  toolCall: AssistantToolCall,
  signal: AbortSignal,
  onUpdate: (partialResult: AgentToolResult<unknown>) => void,
  context: ToolExecutionContext
): Promise<{
  result: AgentToolResult<unknown>;
  isError: boolean;
  errorDetails?: ToolResultMessage['error'];
}> {
  if (!tool) {
    return {
      result: {
        content: [{ type: 'text', content: `Tool ${toolCall.name} not found` }],
        details: {},
      },
      isError: true,
      errorDetails: {
        message: `Tool ${toolCall.name} not found`,
        name: 'ToolNotFoundError',
      },
    };
  }

  try {
    const validatedArgs = validateToolArguments(tool, toolCall);
    const result = await tool.execute(
      toolCall.toolCallId,
      validatedArgs,
      signal,
      onUpdate,
      context
    );
    return { result, isError: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const errorDetails: ToolResultMessage['error'] =
      e instanceof Error ? { message: e.message, name: e.name } : { message };
    if (e instanceof Error && e.stack) {
      errorDetails.stack = e.stack;
    }
    return {
      result: {
        content: [{ type: 'text', content: message }],
        details: {},
      },
      isError: true,
      errorDetails,
    };
  }
}
