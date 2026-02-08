import { NATIVE_HOST_NAME } from '../shared/protocol.constants.js';

import type { ExtensionMessage, NativeResponse } from '../shared/message.types.js';

let port: chrome.runtime.Port | null = null;

/** Connect to the native host, setting up disconnect handling. */
function connect(): chrome.runtime.Port {
  const newPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

  newPort.onMessage.addListener((response: NativeResponse) => {
    switch (response.type) {
      case 'pong':
        console.log(`[extension] pong received (requestId=${response.requestId})`);
        break;
      case 'success':
        console.log(`[extension] success (requestId=${response.requestId})`, response.data);
        break;
      case 'error':
        console.error(`[extension] error (requestId=${response.requestId}): ${response.error}`);
        break;
      default: {
        const exhaustive: never = response;
        console.error('[extension] unknown response type:', (exhaustive as NativeResponse).type);
      }
    }
  });

  newPort.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    console.warn('[extension] native host disconnected', error?.message ?? '');
    port = null;
  });

  port = newPort;
  return newPort;
}

/** Send a message to the native host, lazily connecting if needed. */
function sendMessage(message: ExtensionMessage): void {
  const activePort = port ?? connect();
  activePort.postMessage(message);
}

// Send an initial ping on service worker load
console.log('[extension] background service worker loaded');
sendMessage({ type: 'ping', requestId: 'init-ping' });
