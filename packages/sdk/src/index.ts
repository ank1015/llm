/**
 * @ank1015/llm-sdk
 *
 * Unified SDK for LLM interactions with multiple providers.
 *
 * This package provides a unified entry point that:
 * - Uses direct provider calls when apiKey is provided
 * - Routes through the server (for usage tracking) when no apiKey is provided
 */

// Configuration
export { setServerUrl, getServerUrl } from "./config.js";

// LLM functions (our wrapped versions)
export { complete, stream } from "./llm/index.js";

// LLM Client (for dependency injection)
export { DefaultLLMClient, getMockMessage } from "./llm/llm-client.js";
export type { LLMClient } from "./llm/llm-client.js";

// Agent
export {
	Conversation,
	DefaultAgentRunner,
	buildUserMessage,
	buildToolResultMessage,
} from "./agent/index.js";
export type {
	AgentOptions,
	AgentRunner,
	AgentRunnerCallbacks,
	AgentRunnerOptions,
} from "./agent/index.js";

// Re-export everything else from core (except complete/stream which we override)
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
	// Provider-specific functions (for direct access if needed)
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
} from "@ank1015/llm-core";

export type { CompleteFunction, StreamFunction } from "@ank1015/llm-core";

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
	// Request
	MessageRequest,
	SimpleMessageRequest,
	// Errors
	LLMErrorCode,
	LLMErrorResponse,
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
} from "@ank1015/llm-types";

// Re-export runtime values from types
export { KnownApis, isValidApi } from "@ank1015/llm-types";
export {
	LLMError,
	ApiKeyNotFoundError,
	ModelNotFoundError,
	InvalidRequestError,
	ProviderError,
	RateLimitError,
	ContextOverflowError,
	StreamError,
} from "@ank1015/llm-types";
