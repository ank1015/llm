// Shared types
export type {
  ExtensionMessage,
  PingMessage,
  ExecuteMessage,
  NativeResponse,
  PongResponse,
  SuccessResponse,
  ErrorResponse,
} from './shared/message.types.js';

export {
  NATIVE_HOST_NAME,
  MAX_MESSAGE_SIZE_BYTES,
  LENGTH_PREFIX_BYTES,
} from './shared/protocol.constants.js';

// Native host stdio utilities
export { readMessage, writeMessage } from './native/stdio.js';
