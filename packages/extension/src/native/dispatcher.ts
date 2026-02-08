import { readMessage, writeMessage } from './stdio.js';

import type {
  ExtensionMessage,
  ExtensionResponse,
  NativeInbound,
  NativeOutbound,
  NativeRequest,
} from '../shared/message.types.js';
import type { Readable, Writable } from 'node:stream';

export interface DispatcherOptions {
  input?: Readable;
  output?: Writable;
}

interface PendingRequest {
  resolve: (response: ExtensionResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Multiplexed message dispatcher over the native messaging protocol.
 *
 * Continuously reads stdin, routing messages to either:
 *  - pending request resolvers (for responses to native-initiated requests)
 *  - an external handler (for extension-initiated requests like ping/execute)
 *
 * Provides `send()` for fire-and-forget messages (events, responses) and
 * `request()` for request-response exchanges (e.g. getPageHtml).
 */
export class MessageDispatcher {
  private input: Readable | undefined;
  private output: Writable | undefined;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(opts?: DispatcherOptions) {
    this.input = opts?.input;
    this.output = opts?.output;
  }

  /** Write a message to the extension (fire and forget). */
  send(message: NativeOutbound): void {
    writeMessage(message, this.output);
  }

  /**
   * Send a request to the extension and wait for the matching response.
   * Rejects if the extension responds with an error type.
   */
  async request(message: NativeRequest): Promise<ExtensionResponse> {
    writeMessage(message, this.output);
    return new Promise<ExtensionResponse>((resolve, reject) => {
      this.pendingRequests.set(message.requestId, { resolve, reject });
    });
  }

  /**
   * Start the read loop. Runs until stdin closes (EOF).
   *
   * The handler is called without awaiting so the read loop stays
   * unblocked — this allows interleaved request/response exchanges
   * while the handler (e.g. an agent run) is in progress.
   */
  async run(handler: (message: ExtensionMessage) => void): Promise<void> {
    while (true) {
      let message: NativeInbound | null;

      try {
        message = await readMessage<NativeInbound>(this.input);
      } catch (error) {
        this.rejectAllPending(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }

      if (message === null) {
        this.rejectAllPending(new Error('Connection closed'));
        return;
      }

      // Route responses to pending requests
      if (this.isResponse(message)) {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          if (message.type === 'pageHtmlError') {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message);
          }
          continue;
        }
      }

      // Extension-initiated request — dispatch without blocking
      handler(message as ExtensionMessage);
    }
  }

  private isResponse(message: NativeInbound): message is ExtensionResponse {
    return message.type === 'pageHtml' || message.type === 'pageHtmlError';
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
