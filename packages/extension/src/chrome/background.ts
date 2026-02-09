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
  HighlightTextRequest,
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

    case 'highlightText':
      handleHighlightText(message);
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

// ── highlightText handler ──────────────────────────────────────────

async function handleHighlightText(request: HighlightTextRequest): Promise<void> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      args: [request.text],
      func: (searchText: string) => {
        // Clear previous highlights from this tool
        const previousMarks = document.querySelectorAll('mark[data-llm-highlight]');
        for (const mark of previousMarks) {
          const parent = mark.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
            parent.normalize();
          }
        }

        // Collect all text nodes and their positions in a concatenated string
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        const textNodes: { node: Text; start: number }[] = [];
        let fullText = '';

        let current: Text | null;
        while ((current = walker.nextNode() as Text | null)) {
          textNodes.push({ node: current, start: fullText.length });
          fullText += current.textContent ?? '';
        }

        // Find match — case-sensitive first, then case-insensitive fallback
        let matchIndex = fullText.indexOf(searchText);
        if (matchIndex === -1) {
          matchIndex = fullText.toLowerCase().indexOf(searchText.toLowerCase());
        }
        if (matchIndex === -1) {
          return {
            success: false as const,
            error: `Text not found on page: "${searchText.slice(0, 100)}"`,
          };
        }

        const matchEnd = matchIndex + searchText.length;

        // Build a Range spanning the matched text (may cross DOM nodes)
        const range = document.createRange();
        let rangeStartSet = false;

        for (const tn of textNodes) {
          const nodeLength = tn.node.textContent?.length ?? 0;
          const nodeEnd = tn.start + nodeLength;

          if (!rangeStartSet && nodeEnd > matchIndex) {
            range.setStart(tn.node, matchIndex - tn.start);
            rangeStartSet = true;
          }
          if (rangeStartSet && nodeEnd >= matchEnd) {
            range.setEnd(tn.node, matchEnd - tn.start);
            break;
          }
        }

        // Wrap in a highlight <mark> element
        const mark = document.createElement('mark');
        mark.setAttribute('data-llm-highlight', 'true');
        mark.style.backgroundColor = '#FFEB3B';
        mark.style.color = '#000';
        mark.style.padding = '2px 0';
        mark.style.borderRadius = '2px';
        mark.style.boxShadow = '0 0 0 2px rgba(255, 235, 59, 0.4)';

        try {
          range.surroundContents(mark);
        } catch {
          // surroundContents fails if range crosses element boundaries —
          // fall back to extracting and re-inserting contents.
          const fragment = range.extractContents();
          mark.appendChild(fragment);
          range.insertNode(mark);
        }

        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });

        return { success: true as const, highlightedText: mark.textContent ?? searchText };
      },
    });

    const result = results[0]?.result as
      | { success: true; highlightedText: string }
      | { success: false; error: string }
      | undefined;

    if (!result) {
      throw new Error('Failed to execute highlight script');
    }

    if (!result.success) {
      sendToNative({
        type: 'highlightTextError',
        requestId: request.requestId,
        error: result.error,
      });
      return;
    }

    sendToNative({
      type: 'highlightTextResult',
      requestId: request.requestId,
      highlightedText: result.highlightedText,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[bg] highlightText failed: ${errorMsg}`);
    sendToNative({
      type: 'highlightTextError',
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
  tabUrl: string;
  sessionId?: string;
}

interface PanelLoadSessionMessage {
  type: 'loadSession';
  sessionId: string;
}

type PanelMessage = PanelPromptMessage | PanelLoadSessionMessage;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  panelPort = port;

  port.onMessage.addListener((msg: PanelMessage) => {
    switch (msg.type) {
      case 'prompt':
        handlePanelPrompt(msg);
        break;
      case 'loadSession':
        handlePanelLoadSession(msg);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    panelPort = null;
  });
});

function generateRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function handlePanelPrompt(msg: PanelPromptMessage): void {
  sendToNative({
    type: 'execute',
    requestId: generateRequestId('prompt'),
    payload: {
      command: 'prompt',
      args: {
        message: msg.message,
        tabId: msg.tabId,
        tabUrl: msg.tabUrl,
        sessionId: msg.sessionId,
      },
    },
  });
}

function handlePanelLoadSession(msg: PanelLoadSessionMessage): void {
  sendToNative({
    type: 'execute',
    requestId: generateRequestId('load'),
    payload: {
      command: 'loadSession',
      args: { sessionId: msg.sessionId },
    },
  });
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
