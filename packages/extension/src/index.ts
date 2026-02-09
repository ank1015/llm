// Shared types
export type {
  // Extension → Native (requests)
  ExtensionMessage,
  PingMessage,
  ExecuteMessage,
  // Native → Extension (responses)
  NativeResponse,
  PongResponse,
  SuccessResponse,
  ErrorResponse,
  // Native → Extension (streaming events)
  AgentEventMessage,
  // Native → Extension (requests)
  NativeRequest,
  GetPageHtmlRequest,
  HighlightTextRequest,
  // Extension → Native (responses to native requests)
  ExtensionResponse,
  PageHtmlResponse,
  PageHtmlErrorResponse,
  HighlightTextResponse,
  HighlightTextErrorResponse,
  // Aggregate types
  NativeInbound,
  NativeOutbound,
} from './shared/message.types.js';

export {
  NATIVE_HOST_NAME,
  MAX_MESSAGE_SIZE_BYTES,
  LENGTH_PREFIX_BYTES,
} from './shared/protocol.constants.js';

// Native host stdio utilities
export { readMessage, writeMessage } from './native/stdio.js';

// Message dispatcher
export { MessageDispatcher } from './native/dispatcher.js';
export type { DispatcherOptions } from './native/dispatcher.js';

// Agent tools
export {
  createAgentTools,
  createExtractPageMarkdownTool,
  createHighlightTextTool,
} from './native/tools/index.js';

export type { CreateAgentToolsConfig, GetPageHtml, HighlightText } from './native/tools/index.js';
