/**
 * @ank1015/llm-types
 *
 * Type definitions for LLM SDK.
 */

// API providers
export { KnownApis, isValidApi, type Api } from './api.js';

// Content types
export type { TextContent, ImageContent, FileContent, Content } from './content.js';

// Provider types
export type {
  AnthropicNativeResponse,
  AnthropicProviderOptions,
  DeepSeekNativeResponse,
  DeepSeekProviderOptions,
  GoogleNativeResponse,
  GoogleProviderOptions,
  KimiNativeResponse,
  KimiProviderOptions,
  KimiThinkingConfig,
  OpenAINativeResponse,
  OpenAIProviderOptions,
  ZaiNativeResponse,
  ZaiProviderOptions,
  ZaiThinkingConfig,
  ApiNativeResponseMap,
  NativeResponseForApi,
  ApiOptionsMap,
  OptionsForApi,
  WithOptionalKey,
} from './providers/index.js';

// Model types
export type { Model, Provider } from './model.js';

// Message types
export type {
  StopReason,
  AssistantResponseContent,
  AssistantThinkingContent,
  AssistantToolCall,
  AssistantResponse,
  Usage,
  UserMessage,
  ToolResultMessage,
  BaseAssistantMessage,
  CustomMessage,
  Message,
  BaseAssistantEvent,
} from './message.js';

// Tool types
export type { Tool, Context } from './tool.js';

// Error types
export type { LLMErrorCode } from './errors.js';
export {
  LLMError,
  ApiKeyNotFoundError,
  CostLimitError,
  ContextLimitError,
  ConversationBusyError,
  ModelNotConfiguredError,
  SessionNotFoundError,
  InvalidParentError,
  PathTraversalError,
} from './errors.js';

export type {
  ToolExecutionContext,
  AgentToolResult,
  Attachment,
  AgentToolUpdateCallback,
  AgentTool,
  QueuedMessage,
  AgentState,
  AgentLoopConfig,
  AgentEvent,
} from './agent-types.js';

// Adapter interfaces
export type {
  KeysAdapter,
  UsageAdapter,
  SessionsAdapter,
  UsageFilters,
  UsageStats,
  TokenBreakdown,
  CostBreakdown,
} from './adapters.js';

// Session types
export type {
  BaseNode,
  SessionHeader,
  MessageNode,
  CustomNode,
  SessionNode,
  AppendableNode,
  SessionLocation,
  SessionSummary,
  Session,
  BranchInfo,
  CreateSessionInput,
  AppendMessageInput,
  AppendCustomInput,
  UpdateSessionNameInput,
} from './session.js';
