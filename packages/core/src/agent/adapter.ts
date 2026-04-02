import { generateUUID } from '../utils/uuid.js';

import { getMockMessage } from './mock.js';

import type {
  AgentEngine,
  AgentEngineConfig,
  AgentError,
  AgentEventAdapter,
  AgentEventAdapterOptions,
  AgentRunOptions,
  AgentRunResult,
  AgentRunState,
  AgentStepOptions,
  AgentStepResult,
  AgentTool,
  AgentToolExecuteInput,
  Api,
  BaseAssistantMessage,
  Message,
} from '../types/index.js';

export function createEventAdapter(
  engine: AgentEngine,
  adapterOptions: AgentEventAdapterOptions = {}
): AgentEventAdapter {
  const pendingToolCalls = new Set<string>();

  async function step(
    config: AgentEngineConfig,
    state: AgentRunState,
    options: AgentStepOptions = {}
  ): Promise<AgentStepResult> {
    await safelyObserve(async () => {
      await adapterOptions.onEvent?.({ type: 'turn_start' });
    });

    const assistantMessageId = options.assistantMessageId ?? generateUUID();
    const placeholderAssistant = (adapterOptions.createPlaceholderAssistant ?? getMockMessage)(
      config.provider.model,
      assistantMessageId
    );

    await safelyObserve(async () => {
      await adapterOptions.onEvent?.({
        type: 'message_start',
        messageType: 'assistant',
        messageId: assistantMessageId,
        message: placeholderAssistant,
      });
    });

    const adaptedConfig = adaptConfig(config, pendingToolCalls, adapterOptions);
    let assistantEnded = false;
    let stepResult: AgentStepResult | undefined;

    try {
      stepResult = await engine.step(adaptedConfig, state, {
        ...options,
        assistantMessageId,
        onModelUpdate: async (event) => {
          await safelyObserve(async () => {
            await adapterOptions.onEvent?.({
              type: 'message_update',
              messageType: 'assistant',
              messageId: assistantMessageId,
              message: event,
            });
          });
          await safelyObserve(async () => {
            await options.onModelUpdate?.(event);
          });
        },
        onMessage: async (message) => {
          if (message.role === 'assistant') {
            assistantEnded = true;
            await safelyObserve(async () => {
              await adapterOptions.onEvent?.({
                type: 'message_end',
                messageType: 'assistant',
                messageId: assistantMessageId,
                message,
              });
            });
          } else if (message.role === 'toolResult') {
            pendingToolCalls.delete(message.toolCallId);
            await safelyObserve(async () => {
              await adapterOptions.onEvent?.({
                type: 'tool_execution_end',
                toolCallId: message.toolCallId,
                toolName: message.toolName,
                result: {
                  content: message.content,
                  details: message.details,
                },
                isError: message.isError,
              });
            });
            await safelyObserve(async () => {
              await adapterOptions.onEvent?.({
                type: 'message_start',
                messageType: 'toolResult',
                messageId: message.id,
                message,
              });
            });
            await safelyObserve(async () => {
              await adapterOptions.onEvent?.({
                type: 'message_end',
                messageType: 'toolResult',
                messageId: message.id,
                message,
              });
            });
          }

          await safelyObserve(async () => {
            await options.onMessage?.(message);
          });
        },
      });

      if (!assistantEnded && (stepResult.aborted || stepResult.error)) {
        const synthesizedAssistant = synthesizeAssistantMessage(
          placeholderAssistant,
          stepResult.error,
          stepResult.aborted
        );

        await safelyObserve(async () => {
          await adapterOptions.onEvent?.({
            type: 'message_end',
            messageType: 'assistant',
            messageId: assistantMessageId,
            message: synthesizedAssistant,
          });
        });
      }

      if (stepResult.aborted || stepResult.error) {
        pendingToolCalls.clear();
      }

      return stepResult;
    } finally {
      await safelyObserve(async () => {
        await adapterOptions.onEvent?.({ type: 'turn_end' });
      });

      if (stepResult) {
        const completedStepResult = stepResult;
        await safelyObserve(async () => {
          await adapterOptions.onStateChange?.(completedStepResult.state);
        });
      }
    }
  }

  async function run(
    config: AgentEngineConfig,
    initialState: AgentRunState,
    options: AgentRunOptions = {}
  ): Promise<AgentRunResult> {
    await safelyObserve(async () => {
      await adapterOptions.onEvent?.({ type: 'agent_start' });
    });

    let state = { ...initialState, messages: [...initialState.messages] };
    const newMessages: Message[] = [];

    try {
      while (true) {
        const stepResult = await step(config, state, options);
        state = stepResult.state;
        newMessages.push(...stepResult.newMessages);

        if (stepResult.aborted || stepResult.error || !stepResult.continue) {
          const result: AgentRunResult = {
            state,
            newMessages,
            aborted: stepResult.aborted,
            ...(stepResult.error ? { error: stepResult.error } : {}),
          };

          await safelyObserve(async () => {
            await adapterOptions.onEvent?.({
              type: 'agent_end',
              agentMessages: newMessages,
            });
          });
          await safelyObserve(async () => {
            await adapterOptions.onStateChange?.(state);
          });

          return result;
        }
      }
    } catch (error) {
      pendingToolCalls.clear();
      throw error;
    }
  }

  return {
    step,
    run,
    getPendingToolCalls: () => pendingToolCalls,
  };
}

function adaptConfig(
  config: AgentEngineConfig,
  pendingToolCalls: Set<string>,
  adapterOptions: AgentEventAdapterOptions
): AgentEngineConfig {
  return {
    ...config,
    tools: config.tools.map((tool) => wrapTool(tool, adapterOptions)),
    hooks: {
      ...config.hooks,
      prepareToolCall: async (args) => {
        const preparedToolCall = config.hooks?.prepareToolCall
          ? await config.hooks.prepareToolCall(args)
          : undefined;
        const toolCall = preparedToolCall ?? args.toolCall;

        pendingToolCalls.add(toolCall.toolCallId);
        await safelyObserve(async () => {
          await adapterOptions.onEvent?.({
            type: 'tool_execution_start',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.name,
            args: toolCall.arguments,
          });
        });

        return toolCall;
      },
    },
  };
}

function wrapTool(tool: AgentTool, adapterOptions: AgentEventAdapterOptions): AgentTool {
  return {
    ...tool,
    execute: async (input) => {
      return tool.execute({
        ...input,
        onUpdate: async (partialResult) => {
          await safelyObserve(async () => {
            await adapterOptions.onEvent?.({
              type: 'tool_execution_update',
              toolCallId: input.toolCallId,
              toolName: tool.name,
              args: input.params,
              partialResult,
            });
          });

          if (input.onUpdate) {
            await input.onUpdate(partialResult);
          }
        },
      } as AgentToolExecuteInput);
    },
  };
}

function synthesizeAssistantMessage(
  placeholder: BaseAssistantMessage<Api>,
  error: AgentError | undefined,
  aborted: boolean
): BaseAssistantMessage<Api> {
  return {
    ...placeholder,
    stopReason: aborted ? 'aborted' : 'error',
    ...(error
      ? {
          error: {
            message: error.message,
            canRetry: error.canRetry,
          },
          errorMessage: error.message,
        }
      : {}),
  };
}

async function safelyObserve(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Adapter observers should never interrupt agent execution.
  }
}
