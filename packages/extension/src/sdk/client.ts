import { randomUUID } from 'node:crypto';

import { readMessageWithOptions, writeMessageWithOptions } from '../native/stdio.js';
import { MAX_MESSAGE_SIZE_BYTES } from '../protocol/constants.js';

import type { HostMessage, ChromeMessage } from '../protocol/types.js';
import type { Readable, Writable } from 'node:stream';

export interface ChromeClientOptions {
  input?: Readable;
  output?: Writable;
  maxIncomingMessageSizeBytes?: number;
  maxOutgoingMessageSizeBytes?: number;
}

interface PendingCall {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * RPC client for calling Chrome APIs over native messaging.
 *
 * Sends call/subscribe/unsubscribe messages to Chrome and routes
 * incoming result/error/event responses to the correct handlers.
 */
export class ChromeClient {
  private input: Readable | undefined;
  private output: Writable | undefined;
  private pendingCalls = new Map<string, PendingCall>();
  private eventCallbacks = new Map<string, (data: unknown) => void>();
  private closed = false;
  private maxIncomingMessageSizeBytes: number;
  private maxOutgoingMessageSizeBytes: number;

  constructor(opts?: ChromeClientOptions) {
    this.input = opts?.input;
    this.output = opts?.output;
    this.maxIncomingMessageSizeBytes = opts?.maxIncomingMessageSizeBytes ?? MAX_MESSAGE_SIZE_BYTES;
    this.maxOutgoingMessageSizeBytes = opts?.maxOutgoingMessageSizeBytes ?? MAX_MESSAGE_SIZE_BYTES;
  }

  /** Call a Chrome API method and wait for the result. */
  async call(method: string, ...args: unknown[]): Promise<unknown> {
    if (this.closed) {
      throw new Error('ChromeClient connection is closed');
    }

    const id = randomUUID();
    this.send({ id, type: 'call', method, args });

    return new Promise<unknown>((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
    });
  }

  /**
   * Subscribe to a Chrome event. Returns an unsubscribe function.
   *
   * The callback is invoked with the event arguments array each time
   * the Chrome event fires.
   */
  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (this.closed) {
      throw new Error('ChromeClient connection is closed');
    }

    const id = randomUUID();
    this.send({ id, type: 'subscribe', event });
    this.eventCallbacks.set(id, callback);

    return () => {
      this.send({ id, type: 'unsubscribe' });
      this.eventCallbacks.delete(id);
    };
  }

  /**
   * Start the read loop. Runs until stdin closes (EOF).
   *
   * Must be running for `call()` and `subscribe()` to receive responses.
   * The returned promise resolves on clean disconnect, rejects on read errors.
   */
  async run(): Promise<void> {
    while (true) {
      let message: ChromeMessage | null;

      try {
        message = await readMessageWithOptions<ChromeMessage>(this.input, {
          maxMessageSizeBytes: this.maxIncomingMessageSizeBytes,
        });
      } catch (error) {
        this.cleanup(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }

      if (message === null) {
        this.cleanup(new Error('Connection closed'));
        return;
      }

      switch (message.type) {
        case 'result': {
          const pending = this.pendingCalls.get(message.id);
          if (pending) {
            this.pendingCalls.delete(message.id);
            pending.resolve(message.data);
          }
          break;
        }

        case 'error': {
          const pending = this.pendingCalls.get(message.id);
          if (pending) {
            this.pendingCalls.delete(message.id);
            pending.reject(new Error(message.error));
          }
          // If error was for a subscription setup, clean it up
          if (this.eventCallbacks.has(message.id)) {
            this.eventCallbacks.delete(message.id);
          }
          break;
        }

        case 'event': {
          const callback = this.eventCallbacks.get(message.id);
          callback?.(message.data);
          break;
        }
      }
    }
  }

  private send(message: HostMessage): void {
    writeMessageWithOptions(message, this.output, {
      maxMessageSizeBytes: this.maxOutgoingMessageSizeBytes,
    });
  }

  private cleanup(error: Error): void {
    this.closed = true;
    for (const [, pending] of this.pendingCalls) {
      pending.reject(error);
    }
    this.pendingCalls.clear();
    this.eventCallbacks.clear();
  }
}
