import type { AssistantMessageEventStream } from '../utils/event-stream.js';
import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantMessage,
  Context,
  Message,
  Model,
  OptionsForApi,
  Provider,
  QueuedMessage,
  WithOptionalKey,
} from '@ank1015/llm-types';

/**
 * Function signature for LLM completion (non-streaming).
 */
export type AgentCompleteFunction = <TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: WithOptionalKey<OptionsForApi<TApi>>,
  id: string
) => Promise<BaseAssistantMessage<TApi>>;

/**
 * Function signature for LLM streaming.
 */
export type AgentStreamFunction = <TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: WithOptionalKey<OptionsForApi<TApi>>,
  id: string
) => AssistantMessageEventStream<TApi>;

/**
 * Configuration for running the agent loop.
 * Contains all inputs needed for stateless execution.
 */
export interface AgentRunnerConfig {
  /** System prompt for the LLM */
  systemPrompt?: string;

  /** Available tools for the agent */
  tools: AgentTool[];

  /** LLM provider configuration */
  provider: Provider<Api>;

  /** Budget limits for cost and context */
  budget?: {
    costLimit?: number;
    contextLimit?: number;
    currentCost: number;
  };

  /** Callback to get queued messages between turns */
  getQueuedMessages: <T>() => Promise<QueuedMessage<T>[]>;

  /** LLM complete function (non-streaming) */
  complete: AgentCompleteFunction;

  /** LLM stream function */
  stream: AgentStreamFunction;

  /** Whether to stream assistant messages (default: true) */
  streamAssistantMessage?: boolean;
}

/**
 * Callbacks for the agent runner to interact with external state.
 * This decouples the runner from direct state mutation.
 */
export interface AgentRunnerCallbacks {
  /** Append a single message to conversation state */
  appendMessage: (message: Message) => void;

  /** Append multiple messages to conversation state */
  appendMessages: (messages: Message[]) => void;

  /** Track a pending tool call */
  addPendingToolCall: (toolCallId: string) => void;

  /** Remove a completed tool call from pending */
  removePendingToolCall: (toolCallId: string) => void;
}

/**
 * Event emitter function type for agent events.
 */
export type AgentEventEmitter = (event: AgentEvent) => void;

/**
 * Result of running the agent loop.
 */
export interface AgentRunnerResult {
  /** All new messages generated during this run */
  messages: Message[];

  /** Total cost incurred during this run */
  totalCost: number;

  /** Whether the run was aborted */
  aborted: boolean;

  /** Error message if the run failed */
  error?: string;
}
