// Protocol types and constants
export type {
  CallMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  HostMessage,
  ResultMessage,
  ErrorMessage,
  EventMessage,
  ChromeMessage,
} from './protocol/types.js';

export {
  NATIVE_HOST_NAME,
  MAX_MESSAGE_SIZE_BYTES,
  LENGTH_PREFIX_BYTES,
} from './protocol/constants.js';

// SDK
export { ChromeClient, createChromeClient } from './sdk/index.js';
export type { ChromeClientOptions } from './sdk/index.js';

// Native host stdio utilities
export { readMessage, writeMessage } from './native/stdio.js';
