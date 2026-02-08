/**
 * Background service worker — bridges the side panel UI and native messaging host.
 *
 * Handles:
 *  - Side panel connections (chrome.runtime.onConnect)
 *  - Native host communication (chrome.runtime.connectNative)
 *  - getPageHtml requests from native host (chrome.scripting.executeScript)
 *  - Forwarding agent events to the side panel
 */

import { NATIVE_HOST_NAME } from '../shared/protocol.constants.js';

import type {
  ExtensionMessage,
  NativeOutbound,
  GetPageHtmlRequest,
} from '../shared/message.types.js';

// ── State ───────────────────────────────────────────────────────────

let nativePort: chrome.runtime.Port | null = null;
let panelPort: chrome.runtime.Port | null = null;

// ── Native host connection ──────────────────────────────────────────

function connectNative(): chrome.runtime.Port {
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

  port.onMessage.addListener((message: NativeOutbound) => {
    handleNativeMessage(message);
  });

  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    console.warn('[bg] native host disconnected', error?.message ?? '');
    nativePort = null;
  });

  nativePort = port;
  return port;
}

function sendToNative(message: ExtensionMessage | Record<string, unknown>): void {
  const port = nativePort ?? connectNative();
  port.postMessage(message);
}

// ── Handle messages from native host ────────────────────────────────

function handleNativeMessage(message: NativeOutbound): void {
  switch (message.type) {
    case 'pong':
      console.log(`[bg] pong (requestId=${message.requestId})`);
      break;

    case 'agentEvent':
      // Forward event to side panel
      panelPort?.postMessage({
        type: 'agentEvent',
        requestId: message.requestId,
        event: message.event,
      });
      break;

    case 'success':
      console.log(`[bg] success (requestId=${message.requestId})`);
      panelPort?.postMessage({
        type: 'result',
        requestId: message.requestId,
        data: message.data,
      });
      break;

    case 'error':
      console.error(`[bg] error (requestId=${message.requestId}): ${message.error}`);
      panelPort?.postMessage({
        type: 'error',
        requestId: message.requestId,
        error: message.error,
      });
      break;

    case 'getPageHtml':
      handleGetPageHtml(message);
      break;

    default:
      console.warn('[bg] unknown native message type:', (message as { type: string }).type);
  }
}

// ── getPageHtml handler ─────────────────────────────────────────────

async function handleGetPageHtml(request: GetPageHtmlRequest): Promise<void> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      func: () => document.documentElement.outerHTML,
    });

    const html = results[0]?.result;
    if (typeof html !== 'string') {
      throw new Error('Failed to extract page HTML');
    }

    sendToNative({
      type: 'pageHtml',
      requestId: request.requestId,
      html,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[bg] getPageHtml failed: ${errorMsg}`);
    sendToNative({
      type: 'pageHtmlError',
      requestId: request.requestId,
      error: errorMsg,
    });
  }
}

// ── Side panel connection ───────────────────────────────────────────

interface PanelPromptMessage {
  type: 'prompt';
  message: string;
  tabId: number;
  api: string;
  modelId: string;
  sessionId?: string;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  console.log('[bg] side panel connected');
  panelPort = port;

  port.onMessage.addListener((msg: PanelPromptMessage) => {
    if (msg.type === 'prompt') {
      handlePanelPrompt(msg);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('[bg] side panel disconnected');
    panelPort = null;
  });
});

function handlePanelPrompt(msg: PanelPromptMessage): void {
  const requestId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const executeMessage: ExtensionMessage = {
    type: 'execute',
    requestId,
    payload: {
      command: 'prompt',
      args: {
        message: msg.message,
        tabId: msg.tabId,
        api: msg.api,
        modelId: msg.modelId,
        sessionId: msg.sessionId,
      },
    },
  };

  sendToNative(executeMessage);
}

// ── Extension action ────────────────────────────────────────────────

// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ── Startup ─────────────────────────────────────────────────────────

console.log('[bg] background service worker loaded');
sendToNative({ type: 'ping', requestId: 'init-ping' });
