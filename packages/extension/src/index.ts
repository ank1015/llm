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
  // Native → Extension (requests)
  NativeRequest,
  GetPageHtmlRequest,
  // Extension → Native (responses to native requests)
  ExtensionResponse,
  PageHtmlResponse,
  PageHtmlErrorResponse,
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

// Agent tools
export { createAgentTools, createExtractPageMarkdownTool } from './native/tools/index.js';

export type { CreateAgentToolsConfig, GetPageHtml } from './native/tools/index.js';
