import type { Api } from './api.js';
import type { Content } from './content.js';
import type {
  AssistantToolCall,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  ToolResultMessage,
} from './message.js';
import type { Model, Provider } from './model.js';
import type { OptionsForApi, WithOptionalKey } from './providers/index.js';
import type { Context, Tool } from './tool.js';
import type { Static, TSchema } from '@sinclair/typebox';

type MaybePromise<T> = T | Promise<T>;

/**
 * Context provided to tools during execution.
 */
export interface ToolExecutionContext {
  messages: readonly Message[];
}

/**
 * Standardized tool execution result.
 */
export interface AgentToolResult<T = unknown> {
  content: Content;
  details?: T;
}

/**
 * Attachments accepted by helper utilities.
 */
export interface Attachment {
  id: string;
  type: 'image' | 'file';
  fileName: string;
  mimeType: string;
  size?: number;
  content: string;
}

/**
 * Streaming update callback for tool execution.
 */
export type AgentToolUpdateCallback<T = unknown> = (partialResult: AgentToolResult<T>) => void;

/**
 * Object-style tool execution input.
 */
export interface AgentToolExecuteInput<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> {
  toolCallId: string;
  params: Static<TParameters>;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<TDetails>;
  context: ToolExecutionContext;
}

/**
 * Executable tool definition for the agent engine.
 */
export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends Tool<TParameters> {
  execute: (
    input: AgentToolExecuteInput<TParameters, TDetails>
  ) => Promise<AgentToolResult<TDetails>>;
}

/**
 * Optional adapter-level queued message representation.
 * The engine itself does not depend on this type.
 */
export interface QueuedMessage<TApp = Message> {
  original: TApp;
  llm?: Message;
}

/**
 * Structured agent error surface.
 */
export interface AgentError {
  phase: 'model' | 'tool' | 'limit' | 'hook';
  message: string;
  canRetry: boolean;
  attempts: number;
  cause?: unknown;
  assistantMessage?: BaseAssistantMessage<Api>;
}

/**
 * Mutable run state passed between engine calls.
 */
export interface AgentRunState {
  messages: Message[];
  totalCost: number;
  totalTokens: number;
  turns: number;
  error?: AgentError;
}

/**
 * Model invocation input for the engine.
 */
export interface AgentModelInvocation<TApi extends Api> {
  model: Model<TApi>;
  context: Context;
  options: WithOptionalKey<OptionsForApi<TApi>>;
  signal?: AbortSignal;
  onUpdate?: (event: BaseAssistantEvent<TApi>) => void;
  messageId?: string;
}

/**
 * Model invocation function used by the engine.
 */
export type AgentModelInvoker = <TApi extends Api>(
  input: AgentModelInvocation<TApi>
) => Promise<BaseAssistantMessage<TApi>>;

/**
 * Retry policy for model calls.
 */
export interface AgentRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  factor: number;
  jitterRatio: number;
  maxDelayMs: number;
}

/**
 * Limit configuration for engine runs.
 */
export interface AgentExecutionLimits {
  costLimit?: number;
  contextLimit?: number;
  maxTurns?: number;
}

export interface AgentPrepareContextHookArgs {
  context: Context;
  state: AgentRunState;
  config: AgentEngineConfig;
}

export interface AgentBeforeModelHookArgs<TApi extends Api = Api> {
  context: Context;
  state: AgentRunState;
  config: AgentEngineConfig;
  model: Model<TApi>;
  attempt: number;
}

export interface AgentAfterModelHookArgs<TApi extends Api = Api> {
  message: BaseAssistantMessage<TApi>;
  context: Context;
  state: AgentRunState;
  config: AgentEngineConfig;
}

export interface AgentPrepareToolCallHookArgs {
  assistantMessage: BaseAssistantMessage<Api>;
  toolCall: AssistantToolCall;
  tool?: AgentTool;
  state: AgentRunState;
  config: AgentEngineConfig;
}

export interface AgentFormatToolResultHookArgs {
  assistantMessage: BaseAssistantMessage<Api>;
  toolCall: AssistantToolCall;
  tool?: AgentTool;
  result: AgentToolResult<unknown>;
  isError: boolean;
  errorDetails?: ToolResultMessage['error'];
  state: AgentRunState;
  config: AgentEngineConfig;
}

export interface AgentOnModelRetryHookArgs<TApi extends Api = Api> {
  context: Context;
  state: AgentRunState;
  config: AgentEngineConfig;
  model: Model<TApi>;
  error: AgentError;
  attempt: number;
  delayMs: number;
}

export interface AgentOnErrorHookArgs {
  error: AgentError;
  state: AgentRunState;
  config: AgentEngineConfig;
}

/**
 * Explicit lifecycle hooks for the engine.
 */
export interface AgentHooks {
  prepareContext?: (args: AgentPrepareContextHookArgs) => MaybePromise<Context>;
  beforeModel?: <TApi extends Api>(args: AgentBeforeModelHookArgs<TApi>) => MaybePromise<void>;
  afterModel?: <TApi extends Api>(
    args: AgentAfterModelHookArgs<TApi>
  ) => MaybePromise<BaseAssistantMessage<TApi> | void>;
  prepareToolCall?: (args: AgentPrepareToolCallHookArgs) => MaybePromise<AssistantToolCall | void>;
  formatToolResult?: (
    args: AgentFormatToolResultHookArgs
  ) => MaybePromise<ToolResultMessage | void>;
  onModelRetry?: <TApi extends Api>(
    args: AgentOnModelRetryHookArgs<TApi>
  ) => MaybePromise<void>;
  onError?: (args: AgentOnErrorHookArgs) => MaybePromise<void>;
}

/**
 * Engine configuration.
 */
export interface AgentEngineConfig {
  systemPrompt?: string;
  tools: AgentTool[];
  provider: Provider<Api>;
  modelInvoker: AgentModelInvoker;
  hooks?: AgentHooks;
  retry?: Partial<AgentRetryPolicy>;
  limits?: AgentExecutionLimits;
}

export interface AgentStepOptions {
  signal?: AbortSignal;
  onModelUpdate?: (event: BaseAssistantEvent<Api>) => void;
  onMessage?: (message: Message) => void;
  assistantMessageId?: string;
}

export interface AgentRunOptions {
  signal?: AbortSignal;
  onModelUpdate?: (event: BaseAssistantEvent<Api>) => void;
  onMessage?: (message: Message) => void;
}

export interface AgentStepResult {
  state: AgentRunState;
  newMessages: Message[];
  continue: boolean;
  aborted: boolean;
  error?: AgentError;
}

export interface AgentRunResult {
  state: AgentRunState;
  newMessages: Message[];
  aborted: boolean;
  error?: AgentError;
}

/**
 * Engine function signatures for adapters.
 */
export type AgentStepFunction = (
  config: AgentEngineConfig,
  state: AgentRunState,
  options?: AgentStepOptions
) => Promise<AgentStepResult>;

export type AgentRunFunction = (
  config: AgentEngineConfig,
  state: AgentRunState,
  options?: AgentRunOptions
) => Promise<AgentRunResult>;

export interface AgentEngine {
  step: AgentStepFunction;
  run: AgentRunFunction;
}

/**
 * Adapter-facing event stream.
 */
export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start' }
  | {
      type: 'message_start';
      messageType: 'user' | 'assistant' | 'toolResult' | 'custom';
      messageId: string;
      message: Message;
    }
  | {
      type: 'message_update';
      messageType: 'assistant' | 'custom';
      messageId: string;
      message: Message | BaseAssistantEvent<Api>;
    }
  | {
      type: 'message_end';
      messageType: 'user' | 'assistant' | 'toolResult' | 'custom';
      messageId: string;
      message: Message;
    }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_execution_update';
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: AgentToolResult<unknown>;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      result: AgentToolResult<unknown>;
      isError: boolean;
    }
  | { type: 'turn_end' }
  | { type: 'agent_end'; agentMessages: Message[] };

export interface AgentEventAdapterOptions {
  onEvent?: (event: AgentEvent) => MaybePromise<void>;
  onStateChange?: (state: AgentRunState) => MaybePromise<void>;
  createPlaceholderAssistant?: <TApi extends Api>(
    model: Model<TApi>,
    messageId: string
  ) => BaseAssistantMessage<TApi>;
}

export interface AgentEventAdapter {
  step: AgentStepFunction;
  run: AgentRunFunction;
  getPendingToolCalls: () => ReadonlySet<string>;
}
