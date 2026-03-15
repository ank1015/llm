/**
 * Message types
 *
 * Defines all message types used in conversations:
 * user messages, assistant messages, tool results, and custom messages.
 */

import type { Api } from './api.js';
import type { Content, GeneratedImageMetadata, ImageContent } from './content.js';
import type { Model } from './model.js';
import type { NativeResponseForApi } from './providers/index.js';

// ################################################################
//  Stop Reason
// ################################################################

/**
 * Reason why the assistant stopped generating.
 */
export type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

// ################################################################
//  Assistant Response Content Types
// ################################################################

/**
 * Text/content response from the assistant.
 */
export interface AssistantResponseContent {
  type: 'response';
  content: Content;
}

/**
 * Thinking/reasoning content from the assistant.
 */
export interface AssistantThinkingContent {
  type: 'thinking';
  thinkingText: string;
}

/**
 * Tool call made by the assistant.
 */
export interface AssistantToolCall {
  type: 'toolCall';
  name: string;
  arguments: Record<string, unknown>;
  toolCallId: string;
}

/**
 * Array of assistant response content blocks.
 * Can include text responses, thinking, and tool calls.
 */
export type AssistantResponse = (
  | AssistantResponseContent
  | AssistantThinkingContent
  | AssistantToolCall
)[];

// ################################################################
//  Usage Tracking
// ################################################################

/**
 * Token usage and cost tracking for a response.
 */
export interface Usage {
  /** Non-cached input tokens */
  input: number;
  /** Output tokens */
  output: number;
  /** Tokens read from cache */
  cacheRead: number;
  /** Tokens written to cache */
  cacheWrite: number;
  /** Total tokens (input + output + cache) */
  totalTokens: number;
  /** Cost breakdown in USD */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

// ################################################################
//  Message Types
// ################################################################

/**
 * User message containing text, images, or files.
 */
export interface UserMessage {
  role: 'user';
  id: string;
  timestamp?: number;
  /** Content supports text, images, and files */
  content: Content;
}

/**
 * Tool execution result message.
 */
export interface ToolResultMessage<TDetails = unknown> {
  role: 'toolResult';
  id: string;
  toolName: string;
  toolCallId: string;
  /** Content supports text, images, and files */
  content: Content;
  /** Extra information not sent to model */
  details?: TDetails;
  isError: boolean;
  /** Full error details if isError is true */
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Assistant message with native provider response preserved.
 *
 * @template TApi - The API provider type
 */
export interface BaseAssistantMessage<TApi extends Api> {
  role: 'assistant';
  /** Native provider response (preserved for provider-specific access) */
  message: NativeResponseForApi<TApi>;
  api: TApi;
  id: string;
  model: Model<TApi>;
  errorMessage?: string;
  timestamp: number;
  /** Response duration in milliseconds */
  duration: number;
  stopReason: StopReason;
  /** Normalized content (unified format across providers) */
  content: AssistantResponse;
  usage: Usage;
}

/**
 * Custom message for application-specific metadata.
 */
export interface CustomMessage {
  role: 'custom';
  id: string;
  /** Any custom data structure */
  content: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Union of all message types.
 */
export type Message = UserMessage | ToolResultMessage | BaseAssistantMessage<Api> | CustomMessage;

// ################################################################
//  Streaming Types
// ################################################################

/**
 * Streaming events emitted during assistant response generation.
 */
export type BaseAssistantEvent<TApi extends Api> =
  | { type: 'start'; message: BaseAssistantMessage<TApi> }
  | { type: 'text_start'; contentIndex: number; message: BaseAssistantMessage<TApi> }
  | {
      type: 'text_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'text_end';
      contentIndex: number;
      content: Content;
      message: BaseAssistantMessage<TApi>;
    }
  | { type: 'thinking_start'; contentIndex: number; message: BaseAssistantMessage<TApi> }
  | {
      type: 'thinking_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'thinking_end';
      contentIndex: number;
      content: string;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'image_start';
      contentIndex: number;
      metadata?: GeneratedImageMetadata;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'image_frame';
      contentIndex: number;
      image: ImageContent;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'image_end';
      contentIndex: number;
      image: ImageContent;
      message: BaseAssistantMessage<TApi>;
    }
  | { type: 'toolcall_start'; contentIndex: number; message: BaseAssistantMessage<TApi> }
  | {
      type: 'toolcall_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'toolcall_end';
      contentIndex: number;
      toolCall: AssistantToolCall;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'done';
      reason: Extract<StopReason, 'stop' | 'length' | 'toolUse'>;
      message: BaseAssistantMessage<TApi>;
    }
  | {
      type: 'error';
      reason: Extract<StopReason, 'aborted' | 'error'>;
      message: BaseAssistantMessage<TApi>;
    };
