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
  DEFAULT_PORT,
} from './protocol/constants.js';

// SDK
export { ChromeClient, createChromeClient, connect, Window } from './sdk/index.js';
export type {
  ChromeClientOptions,
  ConnectOptions,
  WindowOpenOptions,
  WindowTab,
} from './sdk/index.js';

// Server
export { ChromeServer } from './native/server.js';
export type { ChromeServerOptions } from './native/server.js';

// Native host stdio utilities
export { readMessage, writeMessage } from './native/stdio.js';
