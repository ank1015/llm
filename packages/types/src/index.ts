/**
 * @ank1015/llm-types
 *
 * Type definitions for LLM SDK.
 */

// API providers
export { KnownApis, isValidApi, type Api } from "./api.js";

// Content types
export type { TextContent, ImageContent, FileContent, Content } from "./content.js";

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
} from "./providers/index.js";

// Model types
export type { Model, Provider } from "./model.js";

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
	BaseAssistantEventMessage,
	BaseAssistantEvent,
} from "./message.js";

// Tool types
export type { Tool, Context } from "./tool.js";

// Request types
export type { MessageRequest, SimpleMessageRequest } from "./request.js";

// Error types
export type { LLMErrorCode, LLMErrorResponse } from "./errors.js";
export {
	LLMError,
	ApiKeyNotFoundError,
	ModelNotFoundError,
	InvalidRequestError,
	ProviderError,
	RateLimitError,
	ContextOverflowError,
	StreamError,
} from "./errors.js";

export type {
	ToolExecutionContext,
	AgentToolResult,
	Attachment,
	AgentToolUpdateCallback,
	AgentTool,
	QueuedMessage,
	AgentState,
	AgentLoopConfig,
	AgentEvent
} from './agent-types.js'