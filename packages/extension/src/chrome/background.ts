/**
 * Background service worker — thin RPC proxy for native messaging.
 *
 * Receives call/subscribe/unsubscribe messages from the native host,
 * executes the corresponding Chrome API, and sends back results/errors/events.
 */

import { NATIVE_HOST_NAME } from '../protocol/constants.js';

import type {
  HostMessage,
  CallMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  ChromeMessage,
} from '../protocol/types.js';

// ── State ───────────────────────────────────────────────────────────

let nativePort: chrome.runtime.Port | null = null;

interface ActiveSubscription {
  target: chrome.events.Event<(...args: unknown[]) => void>;
  listener: (...args: unknown[]) => void;
}

const subscriptions = new Map<string, ActiveSubscription>();

// ── Native host connection ──────────────────────────────────────────

function connectNative(): chrome.runtime.Port {
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

  port.onMessage.addListener((message: HostMessage) => {
    handleHostMessage(message);
  });

  port.onDisconnect.addListener(() => {
    console.warn('[bg] native host disconnected', chrome.runtime.lastError?.message ?? '');
    nativePort = null;
    subscriptions.clear();
  });

  nativePort = port;
  return port;
}

function sendToHost(message: ChromeMessage): void {
  nativePort?.postMessage(message);
}

// ── Message routing ─────────────────────────────────────────────────

function handleHostMessage(message: HostMessage): void {
  switch (message.type) {
    case 'call':
      handleCall(message);
      break;
    case 'subscribe':
      handleSubscribe(message);
      break;
    case 'unsubscribe':
      handleUnsubscribe(message);
      break;
    default:
      console.warn('[bg] unknown message type:', (message as { type: string }).type);
  }
}

// ── Call handler ────────────────────────────────────────────────────

async function handleCall(message: CallMessage): Promise<void> {
  try {
    let result: unknown;

    if (message.method === 'debugger.evaluate') {
      result = await debuggerEvaluate(message.args);
    } else if (message.method === 'scripting.executeScript' && hasCodeArg(message.args)) {
      result = await executeScriptWithCode(message.args);
    } else {
      const fn = resolveMethod(message.method);
      result = await fn(...message.args);
    }

    sendToHost({ id: message.id, type: 'result', data: result });
  } catch (error) {
    sendToHost({
      id: message.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── scripting.executeScript special case ────────────────────────────

/**
 * Handles executeScript calls where the host passes a `code` string
 * instead of a function reference (which can't be serialized over JSON).
 *
 * The code runs in the page's MAIN world by default, where new Function()
 * is available on most pages.
 */

function hasCodeArg(args: unknown[]): boolean {
  return (
    args.length > 0 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    'code' in (args[0] as Record<string, unknown>)
  );
}

async function executeScriptWithCode(args: unknown[]): Promise<unknown> {
  const { code, target, world, ...rest } = args[0] as {
    code: string;
    target: chrome.scripting.InjectionTarget;
    world?: string;
    [key: string]: unknown;
  };

  return chrome.scripting.executeScript({
    ...rest,
    target,
    world: (world as chrome.scripting.ExecutionWorld) ?? 'MAIN',
    // func is serialized by Chrome and executed in the TAB context (not the service worker).
    // eval is allowed in MAIN world under the page's CSP.

    func: (codeStr: string) => eval(codeStr),
    args: [code],
  });
}

// ── debugger.evaluate — CSP-bypassing code execution ────────────────

/**
 * Evaluates arbitrary JS in a tab via Chrome DevTools Protocol.
 *
 * Uses chrome.debugger to attach, run Runtime.evaluate, and detach.
 * This bypasses page CSP because the debugger protocol operates at the
 * browser level, not within the page's JS context.
 *
 * Tradeoff: shows a brief yellow "debugging" banner in the tab.
 */
async function debuggerEvaluate(args: unknown[]): Promise<unknown> {
  const {
    tabId,
    code,
    returnByValue = true,
  } = args[0] as {
    tabId: number;
    code: string;
    returnByValue?: boolean;
  };

  if (typeof tabId !== 'number') {
    throw new Error('debugger.evaluate requires a numeric tabId');
  }
  if (typeof code !== 'string' || !code) {
    throw new Error('debugger.evaluate requires a non-empty code string');
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (error) {
    throw new Error(
      `Failed to attach debugger to tab ${tabId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const response = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: code,
      returnByValue,
    })) as {
      result?: { value?: unknown; type?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };

    if (response.exceptionDetails) {
      const detail =
        response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text ??
        'Unknown evaluation error';
      throw new Error(detail);
    }

    return { result: response.result?.value, type: response.result?.type };
  } finally {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // Tab may have closed — safe to ignore
    }
  }
}

// ── Method resolver ─────────────────────────────────────────────────

function resolveMethod(method: string): (...args: unknown[]) => unknown {
  const parts = method.split('.');
  let target: unknown = chrome;
  let parent: unknown = chrome;

  for (const part of parts) {
    parent = target;
    target = (target as Record<string, unknown>)[part];
    if (target === undefined) {
      throw new Error(`chrome.${method} is not available`);
    }
  }

  if (typeof target !== 'function') {
    throw new Error(`chrome.${method} is not a function`);
  }

  return (target as (...args: unknown[]) => unknown).bind(parent);
}

// ── Subscribe handler ───────────────────────────────────────────────

function handleSubscribe(message: SubscribeMessage): void {
  try {
    const parts = message.event.split('.');
    let target: unknown = chrome;

    for (const part of parts) {
      target = (target as Record<string, unknown>)[part];
      if (target === undefined) {
        throw new Error(`chrome.${message.event} is not available`);
      }
    }

    const eventTarget = target as chrome.events.Event<(...args: unknown[]) => void>;

    if (typeof eventTarget.addListener !== 'function') {
      throw new Error(`chrome.${message.event} is not an event`);
    }

    const listener = (...args: unknown[]): void => {
      sendToHost({ id: message.id, type: 'event', data: args });
    };

    eventTarget.addListener(listener);
    subscriptions.set(message.id, { target: eventTarget, listener });
  } catch (error) {
    sendToHost({
      id: message.id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Unsubscribe handler ─────────────────────────────────────────────

function handleUnsubscribe(message: UnsubscribeMessage): void {
  const sub = subscriptions.get(message.id);
  if (sub) {
    sub.target.removeListener(sub.listener);
    subscriptions.delete(message.id);
  }
}

// ── Startup ─────────────────────────────────────────────────────────

console.warn('[bg] background service worker loaded');
connectNative();
