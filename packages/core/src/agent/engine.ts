import { generateUUID } from '../utils/uuid.js';
import { validateToolArguments } from '../utils/validation.js';

import { buildToolResultMessage } from './utils.js';

import type {
  AgentEngine,
  AgentEngineConfig,
  AgentError,
  AgentRetryPolicy,
  AgentRunOptions,
  AgentRunResult,
  AgentRunState,
  AgentStepOptions,
  AgentStepResult,
  AgentTool,
  AgentToolResult,
  Api,
  AssistantToolCall,
  BaseAssistantMessage,
  Context,
  Message,
  ToolExecutionContext,
  ToolResultMessage,
} from '../types/index.js';

export const DEFAULT_AGENT_RETRY_POLICY: AgentRetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 200,
  factor: 2,
  jitterRatio: 0.1,
  maxDelayMs: 5000,
};

type ModelInvocationResult =
  | {
      assistantMessage: BaseAssistantMessage<Api>;
      attempts: number;
    }
  | {
      error: AgentError;
      attempts: number;
    }
  | {
      aborted: true;
      attempts: number;
    };

type ToolExecutionResult =
  | {
      aborted: true;
    }
  | {
      result: AgentToolResult<unknown>;
      isError: boolean;
      errorDetails?: ToolResultMessage['error'];
    };

export async function stepAgent(
  config: AgentEngineConfig,
  state: AgentRunState,
  options: AgentStepOptions = {}
): Promise<AgentStepResult> {
  if (options.signal?.aborted) {
    return {
      state: { ...state },
      newMessages: [],
      continue: false,
      aborted: true,
    };
  }

  const maxTurns = config.limits?.maxTurns;
  if (typeof maxTurns === 'number' && state.turns >= maxTurns) {
    return finalizeError(
      config,
      state,
      [],
      {
        phase: 'limit',
        message: `Max turns exceeded: ${state.turns} >= ${maxTurns}`,
        canRetry: false,
        attempts: 1,
      }
    );
  }

  let context: Context = {
    messages: [...state.messages],
    tools: config.tools,
  };
  if (config.systemPrompt !== undefined) {
    context.systemPrompt = config.systemPrompt;
  }

  if (config.hooks?.prepareContext) {
    try {
      const preparedContext = await config.hooks.prepareContext({ context, state, config });
      context = preparedContext;
    } catch (cause) {
      return finalizeError(
        config,
        state,
        [],
        {
          phase: 'hook',
          message: getErrorMessage(cause),
          canRetry: false,
          attempts: 1,
          cause,
        }
      );
    }
  }

  const modelOutcome = await invokeModelWithRetry(
    config,
    state,
    context,
    options.signal,
    options.onModelUpdate,
    options.assistantMessageId ?? generateUUID()
  );

  if ('aborted' in modelOutcome) {
    return {
      state: { ...state },
      newMessages: [],
      continue: false,
      aborted: true,
    };
  }

  if ('error' in modelOutcome) {
    return finalizeError(config, state, [], modelOutcome.error);
  }

  let assistantMessage = modelOutcome.assistantMessage;

  if (config.hooks?.afterModel) {
    try {
      const transformedMessage = await config.hooks.afterModel({
        message: assistantMessage,
        context,
        state,
        config,
      });
      if (transformedMessage) {
        assistantMessage = transformedMessage as BaseAssistantMessage<Api>;
      }
    } catch (cause) {
      return finalizeError(
        config,
        state,
        [],
        {
          phase: 'hook',
          message: getErrorMessage(cause),
          canRetry: false,
          attempts: 1,
          cause,
        }
      );
    }
  }

  const newMessages: Message[] = [assistantMessage];
  let nextState = appendAgentMessage(state, assistantMessage);
  await safelyNotifyMessage(options.onMessage, assistantMessage);

  const limitError = getLimitError(config, nextState, assistantMessage);
  if (limitError) {
    return finalizeError(config, nextState, newMessages, limitError);
  }

  if (assistantMessage.stopReason === 'aborted') {
    return {
      state: nextState,
      newMessages,
      continue: false,
      aborted: true,
    };
  }

  if (assistantMessage.stopReason === 'error') {
    return finalizeError(
      config,
      nextState,
      newMessages,
      createModelErrorFromAssistant(assistantMessage, modelOutcome.attempts)
    );
  }

  const toolCalls = assistantMessage.content.filter(
    (content): content is AssistantToolCall => content.type === 'toolCall'
  );

  if (toolCalls.length === 0) {
    return {
      state: nextState,
      newMessages,
      continue: false,
      aborted: false,
    };
  }

  for (const rawToolCall of toolCalls) {
    if (options.signal?.aborted) {
      return {
        state: nextState,
        newMessages,
        continue: false,
        aborted: true,
      };
    }

    let toolCall = rawToolCall;
    let originalTool = config.tools.find((candidate) => candidate.name === rawToolCall.name);

  if (config.hooks?.prepareToolCall) {
      try {
        const preparedToolCall = await config.hooks.prepareToolCall({
          assistantMessage,
          toolCall,
          state: nextState,
          config,
          ...(originalTool ? { tool: originalTool } : {}),
        });
        if (preparedToolCall) {
          toolCall = preparedToolCall;
        }
      } catch (cause) {
        return finalizeError(
          config,
          nextState,
          newMessages,
          {
            phase: 'hook',
            message: getErrorMessage(cause),
            canRetry: false,
            attempts: 1,
            cause,
          }
        );
      }
    }

    const tool = config.tools.find((candidate) => candidate.name === toolCall.name);
    const executionResult = await executeToolCall(tool, toolCall, nextState.messages, options.signal);

    if ('aborted' in executionResult) {
      return {
        state: nextState,
        newMessages,
        continue: false,
        aborted: true,
      };
    }

    let toolResultMessage: ToolResultMessage | undefined;

    if (config.hooks?.formatToolResult) {
      try {
        const formattedToolResult = await config.hooks.formatToolResult({
          assistantMessage,
          toolCall,
          result: executionResult.result,
          isError: executionResult.isError,
          state: nextState,
          config,
          ...(tool ? { tool } : {}),
          ...(executionResult.errorDetails ? { errorDetails: executionResult.errorDetails } : {}),
        });
        if (formattedToolResult) {
          toolResultMessage = formattedToolResult;
        }
      } catch (cause) {
        return finalizeError(
          config,
          nextState,
          newMessages,
          {
            phase: 'hook',
            message: getErrorMessage(cause),
            canRetry: false,
            attempts: 1,
            cause,
          }
        );
      }
    }

    if (!toolResultMessage) {
      toolResultMessage = buildToolResultMessage(
        toolCall,
        executionResult.result,
        executionResult.isError,
        executionResult.errorDetails
      );
    }

    newMessages.push(toolResultMessage);
    nextState = appendGenericMessage(nextState, toolResultMessage);
    await safelyNotifyMessage(options.onMessage, toolResultMessage);
  }

  return {
    state: nextState,
    newMessages,
    continue: true,
    aborted: false,
  };
}

export async function runAgent(
  config: AgentEngineConfig,
  initialState: AgentRunState,
  options: AgentRunOptions = {}
): Promise<AgentRunResult> {
  let state = { ...initialState, messages: [...initialState.messages] };
  const newMessages: Message[] = [];

  while (true) {
    const stepResult = await stepAgent(config, state, options);
    state = stepResult.state;
    newMessages.push(...stepResult.newMessages);

    if (stepResult.aborted || stepResult.error || !stepResult.continue) {
      return {
        state,
        newMessages,
        aborted: stepResult.aborted,
        ...(stepResult.error ? { error: stepResult.error } : {}),
      };
    }
  }
}

function appendAgentMessage(
  state: AgentRunState,
  message: BaseAssistantMessage<Api>
): AgentRunState {
  return {
    messages: [...state.messages, message],
    totalCost: state.totalCost + message.usage.cost.total,
    totalTokens: state.totalTokens + message.usage.totalTokens,
    turns: state.turns + 1,
  };
}

function appendGenericMessage(state: AgentRunState, message: Message): AgentRunState {
  return {
    ...state,
    messages: [...state.messages, message],
  };
}

async function invokeModelWithRetry(
  config: AgentEngineConfig,
  state: AgentRunState,
  context: Context,
  signal: AbortSignal | undefined,
  onModelUpdate: AgentStepOptions['onModelUpdate'],
  messageId: string
): Promise<ModelInvocationResult> {
  const retryPolicy = resolveRetryPolicy(config.retry);

  for (let attempt = 1; ; attempt += 1) {
    if (signal?.aborted) {
      return { aborted: true, attempts: attempt };
    }

    await safelyObserve(async () => {
      await config.hooks?.beforeModel?.({
        context,
        state,
        config,
        model: config.provider.model,
        attempt,
      });
    });

    try {
      const assistantMessage = await config.modelInvoker({
        model: config.provider.model,
        context,
        options: config.provider.providerOptions ?? {},
        ...(signal ? { signal } : {}),
        ...(onModelUpdate ? { onUpdate: onModelUpdate } : {}),
        messageId,
      });

      if (
        assistantMessage.stopReason === 'error' &&
        assistantMessage.error?.canRetry === true &&
        attempt <= retryPolicy.maxRetries
      ) {
        const error = createModelErrorFromAssistant(assistantMessage, attempt);
        const delayMs = getRetryDelayMs(retryPolicy, attempt);
        await safelyObserve(async () => {
          await config.hooks?.onModelRetry?.({
            context,
            state,
            config,
            model: config.provider.model,
            error,
            attempt,
            delayMs,
          });
        });
        const sleepStatus = await sleepWithAbort(delayMs, signal);
        if (sleepStatus === 'aborted') {
          return { aborted: true, attempts: attempt };
        }
        continue;
      }

      return {
        assistantMessage: assistantMessage as BaseAssistantMessage<Api>,
        attempts: attempt,
      };
    } catch (cause) {
      const normalizedFailure = normalizeModelFailure(cause, attempt);
      if ('aborted' in normalizedFailure) {
        return { aborted: true, attempts: attempt };
      }

      if ('canRetry' in normalizedFailure && normalizedFailure.canRetry && attempt <= retryPolicy.maxRetries) {
        const delayMs = getRetryDelayMs(retryPolicy, attempt);
        await safelyObserve(async () => {
          await config.hooks?.onModelRetry?.({
            context,
            state,
            config,
            model: config.provider.model,
            error: normalizedFailure.error,
            attempt,
            delayMs,
          });
        });
        const sleepStatus = await sleepWithAbort(delayMs, signal);
        if (sleepStatus === 'aborted') {
          return { aborted: true, attempts: attempt };
        }
        continue;
      }

      if ('assistantMessage' in normalizedFailure) {
        return {
          assistantMessage: normalizedFailure.assistantMessage,
          attempts: attempt,
        };
      }

      return {
        error: normalizedFailure.error,
        attempts: attempt,
      };
    }
  }
}

async function executeToolCall(
  tool: AgentTool | undefined,
  toolCall: AssistantToolCall,
  messages: Message[],
  signal?: AbortSignal
): Promise<ToolExecutionResult> {
  if (!tool) {
    return {
      result: {
        content: [{ type: 'text', content: `Tool ${toolCall.name} not found` }],
      },
      isError: true,
      errorDetails: {
        message: `Tool ${toolCall.name} not found`,
        name: 'ToolNotFoundError',
      },
    };
  }

  let validatedArgs: unknown;
  try {
    validatedArgs = validateToolArguments(tool, toolCall);
  } catch (cause) {
    const message = getErrorMessage(cause);
    const errorDetails = buildToolErrorDetails(cause, message);
    return {
      result: {
        content: [{ type: 'text', content: message }],
      },
      isError: true,
      errorDetails,
    };
  }

  try {
    const context: ToolExecutionContext = {
      messages: Object.freeze([...messages]),
    };

    const result = await tool.execute({
      toolCallId: toolCall.toolCallId,
      params: validatedArgs as never,
      context,
      ...(signal ? { signal } : {}),
    });

    return { result, isError: false };
  } catch (cause) {
    if (isAbortLike(cause, signal)) {
      return { aborted: true };
    }

    const message = getErrorMessage(cause);
    const errorDetails = buildToolErrorDetails(cause, message);
    return {
      result: {
        content: [{ type: 'text', content: message }],
      },
      isError: true,
      errorDetails,
    };
  }
}

function getLimitError(
  config: AgentEngineConfig,
  state: AgentRunState,
  assistantMessage: BaseAssistantMessage<Api>
): AgentError | undefined {
  const costLimit = config.limits?.costLimit;
  if (typeof costLimit === 'number' && state.totalCost >= costLimit) {
    return {
      phase: 'limit',
      message: `Cost limit exceeded: ${state.totalCost} >= ${costLimit}`,
      canRetry: false,
      attempts: 1,
      assistantMessage,
    };
  }

  const contextLimit = config.limits?.contextLimit;
  if (typeof contextLimit === 'number' && assistantMessage.usage.input >= contextLimit) {
    return {
      phase: 'limit',
      message: `Context limit exceeded: ${assistantMessage.usage.input} >= ${contextLimit}`,
      canRetry: false,
      attempts: 1,
      assistantMessage,
    };
  }

  return undefined;
}

async function finalizeError(
  config: AgentEngineConfig,
  state: AgentRunState,
  newMessages: Message[],
  error: AgentError
): Promise<AgentStepResult> {
  const nextState: AgentRunState = {
    ...state,
    error,
  };

  await safelyObserve(async () => {
    await config.hooks?.onError?.({
      error,
      state: nextState,
      config,
    });
  });

  return {
    state: nextState,
    newMessages,
    continue: false,
    aborted: false,
    error,
  };
}

function createModelErrorFromAssistant(
  assistantMessage: BaseAssistantMessage<Api>,
  attempts: number
): AgentError {
  return {
    phase: 'model',
    message:
      assistantMessage.error?.message ||
      assistantMessage.errorMessage ||
      (assistantMessage.stopReason === 'aborted'
        ? 'Model call was aborted'
        : 'Model call failed'),
    canRetry: assistantMessage.error?.canRetry ?? false,
    attempts,
    assistantMessage,
  };
}

function normalizeModelFailure(
  cause: unknown,
  attempts: number
):
  | {
      assistantMessage: BaseAssistantMessage<Api>;
      canRetry: boolean;
      error: AgentError;
    }
  | {
      aborted: true;
    }
  | {
      error: AgentError;
      canRetry: boolean;
    } {
  if (isAbortLike(cause)) {
    return { aborted: true };
  }

  const assistantMessage =
    isObject(cause) && isAssistantMessage(cause.assistantMessage)
      ? (cause.assistantMessage as BaseAssistantMessage<Api>)
      : undefined;
  const canRetry =
    (isObject(cause) && typeof cause.canRetry === 'boolean' ? cause.canRetry : undefined) ??
    assistantMessage?.error?.canRetry ??
    false;

  const error: AgentError = {
    phase: 'model',
    message:
      assistantMessage?.error?.message ||
      assistantMessage?.errorMessage ||
      getErrorMessage(cause),
    canRetry,
    attempts,
    cause,
    ...(assistantMessage ? { assistantMessage } : {}),
  };

  if (assistantMessage) {
    return {
      assistantMessage,
      canRetry,
      error,
    };
  }

  return {
    error,
    canRetry,
  };
}

function resolveRetryPolicy(
  policy: Partial<AgentRetryPolicy> | undefined
): AgentRetryPolicy {
  return {
    ...DEFAULT_AGENT_RETRY_POLICY,
    ...policy,
  };
}

function getRetryDelayMs(policy: AgentRetryPolicy, attempt: number): number {
  const rawDelay = Math.min(
    policy.baseDelayMs * policy.factor ** Math.max(0, attempt - 1),
    policy.maxDelayMs
  );
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * policy.jitterRatio;
  return Math.max(0, Math.round(rawDelay * jitterMultiplier));
}

async function sleepWithAbort(
  delayMs: number,
  signal?: AbortSignal
): Promise<'completed' | 'aborted'> {
  if (delayMs <= 0) return signal?.aborted ? 'aborted' : 'completed';
  if (signal?.aborted) return 'aborted';

  return new Promise<'completed' | 'aborted'>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve('completed');
    }, delayMs);

    const onAbort = () => {
      cleanup();
      resolve('aborted');
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function safelyObserve(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Observation callbacks must not affect execution.
  }
}

async function safelyNotifyMessage(
  notify: AgentStepOptions['onMessage'],
  message: Message
): Promise<void> {
  if (!notify) return;
  try {
    await notify(message);
  } catch {
    // Observation callbacks must not affect execution.
  }
}

function buildToolErrorDetails(
  cause: unknown,
  message: string
): ToolResultMessage['error'] {
  const errorDetails: ToolResultMessage['error'] =
    cause instanceof Error ? { message: cause.message, name: cause.name } : { message };
  if (cause instanceof Error && cause.stack) {
    errorDetails.stack = cause.stack;
  }
  return errorDetails;
}

function isAbortLike(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;

  if (!(error instanceof Error)) return false;

  return error.name === 'AbortError' || error.name === 'APIUserAbortError';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAssistantMessage(value: unknown): value is BaseAssistantMessage<Api> {
  return (
    isObject(value) &&
    value.role === 'assistant' &&
    typeof value.id === 'string' &&
    Array.isArray(value.content)
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export const agentEngine: AgentEngine = {
  step: stepAgent,
  run: runAgent,
};
