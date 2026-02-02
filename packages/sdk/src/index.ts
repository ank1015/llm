/**
 * @ank1015/llm-sdk
 *
 * Unified SDK for LLM interactions with multiple providers.
 *
 * This package provides:
 * - Adapter-based storage for API keys, usage tracking, and sessions
 * - Conversation class for stateful agent interactions
 * - Session management for conversation persistence
 */

// Adapters
export {
  // Keys adapter
  FileKeysAdapter,
  createFileKeysAdapter,
  // Usage adapter
  SqliteUsageAdapter,
  createSqliteUsageAdapter,
  // Sessions adapter
  FileSessionsAdapter,
  createFileSessionsAdapter,
} from './adapters/index.js';
export type {
  KeysAdapter,
  UsageAdapter,
  SessionsAdapter,
  UsageFilters,
  UsageStats,
  TokenBreakdown,
  CostBreakdown,
  CreateSessionInput,
  AppendMessageInput,
  AppendCustomInput,
  SessionLocation,
} from './adapters/index.js';

// LLM functions
export { complete, stream } from './llm/index.js';
export type { CompleteOptions, StreamOptions } from './llm/index.js';

// Agent
export { Conversation } from './agent/index.js';
export type { ConversationOptions } from './agent/index.js';

// Session Manager
export { SessionManager, createSessionManager } from './session/index.js';
export type {
  CreateSessionOptions,
  AppendMessageOptions,
  AppendCustomOptions,
} from './session/index.js';

// Re-export everything from core
export {
  VERSION,
  MODELS,
  getProviders,
  getModel,
  getModels,
  calculateCost,
  EventStream,
  AssistantMessageEventStream,
  parseStreamingJson,
  isContextOverflow,
  getOverflowPatterns,
  sanitizeSurrogates,
  validateToolCall,
  validateToolArguments,
  generateUUID,
  // Agent loop (from core)
  runAgentLoop,
  buildUserMessage,
  buildToolResultMessage,
  getMockMessage,
  // Provider-specific functions
  completeAnthropic,
  streamAnthropic,
  completeOpenAI,
  streamOpenAI,
  completeGoogle,
  streamGoogle,
  GoogleThinkingLevel,
  completeDeepSeek,
  streamDeepSeek,
  completeZai,
  streamZai,
  completeKimi,
  streamKimi,
} from '@ank1015/llm-core';

export type {
  CompleteFunction,
  StreamFunction,
  AgentRunnerConfig,
  AgentRunnerCallbacks,
  AgentEventEmitter,
  AgentRunnerResult,
  AgentCompleteFunction,
  AgentStreamFunction,
} from '@ank1015/llm-core';

// Re-export all types from types package
export type {
  // API
  Api,
  // Content
  TextContent,
  ImageContent,
  FileContent,
  Content,
  // Provider types
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
  // Model
  Model,
  Provider,
  // Message
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
  BaseAssistantEventMessage,
  BaseAssistantEvent,
  // Tool
  Tool,
  Context,
  // Errors
  LLMErrorCode,
  // Agent types
  ToolExecutionContext,
  AgentToolResult,
  Attachment,
  AgentToolUpdateCallback,
  AgentTool,
  QueuedMessage,
  AgentState,
  AgentLoopConfig,
  AgentEvent,
  // Session types
  BaseNode,
  SessionHeader,
  MessageNode,
  CustomNode,
  SessionNode,
  AppendableNode,
  SessionSummary,
  Session,
  BranchInfo,
  UpdateSessionNameInput,
} from '@ank1015/llm-types';

// Re-export runtime values from types
export { KnownApis, isValidApi } from '@ank1015/llm-types';
export { LLMError, ApiKeyNotFoundError } from '@ank1015/llm-types';
