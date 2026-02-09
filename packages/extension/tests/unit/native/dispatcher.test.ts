import { PassThrough } from 'node:stream';

import { describe, it, expect, vi } from 'vitest';

import { MessageDispatcher } from '../../../src/native/dispatcher.js';
import { readMessage } from '../../../src/native/stdio.js';
import { LENGTH_PREFIX_BYTES } from '../../../src/shared/protocol.constants.js';

import type {
  ExtensionMessage,
  NativeOutbound,
  PageHtmlResponse,
  HighlightTextResponse,
} from '../../../src/shared/message.types.js';

/** Encode an object as a length-prefixed buffer (native messaging format). */
function encode(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf-8');
  const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

function createStreams() {
  return { input: new PassThrough(), output: new PassThrough() };
}

/** Push a length-prefixed message into a stream. */
function pushMessage(stream: PassThrough, message: unknown): void {
  stream.write(encode(message));
}

// ── send() ─────────────────────────────────────────────────────────

describe('MessageDispatcher.send', () => {
  it('should write a message to the output stream', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const message: NativeOutbound = { type: 'pong', requestId: 'test-1' };
    dispatcher.send(message);

    const received = await readMessage<NativeOutbound>(output);
    expect(received).toEqual(message);
  });

  it('should write agent events to the output stream', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const event: NativeOutbound = {
      type: 'agentEvent',
      requestId: 'req-1',
      event: { type: 'turn_start' },
    };
    dispatcher.send(event);

    const received = await readMessage<NativeOutbound>(output);
    expect(received).toEqual(event);
  });
});

// ── run() — routing extension messages to handler ──────────────────

describe('MessageDispatcher.run', () => {
  it('should route extension messages to the handler', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const received: ExtensionMessage[] = [];
    const runPromise = dispatcher.run((msg) => received.push(msg));

    pushMessage(input, { type: 'ping', requestId: 'p-1' });
    pushMessage(input, { type: 'execute', requestId: 'e-1', payload: { command: 'test' } });

    // Allow microtasks to process
    await new Promise((r) => setTimeout(r, 10));

    input.end();
    await runPromise;

    expect(received).toHaveLength(2);
    expect(received[0]!.type).toBe('ping');
    expect(received[1]!.type).toBe('execute');
  });

  it('should return on clean EOF', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const handler = vi.fn();
    input.end();

    await dispatcher.run(handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should rethrow fatal read errors', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    // Write invalid data (non-zero length prefix but no body, then close)
    const badPrefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
    badPrefix.writeUInt32LE(100, 0);
    input.write(badPrefix);
    input.end();

    await expect(runPromise).rejects.toThrow(/Stream ended/);
  });
});

// ── request() — native-initiated request/response ──────────────────

describe('MessageDispatcher.request', () => {
  it('should resolve when a matching response arrives', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    const responsePromise = dispatcher.request({
      type: 'getPageHtml',
      requestId: 'req-1',
      tabId: 42,
    });

    // Simulate extension responding
    pushMessage(input, { type: 'pageHtml', requestId: 'req-1', html: '<p>hello</p>' });

    const response = await responsePromise;
    expect(response).toEqual({
      type: 'pageHtml',
      requestId: 'req-1',
      html: '<p>hello</p>',
    });
    expect((response as PageHtmlResponse).html).toBe('<p>hello</p>');

    input.end();
    await runPromise;
  });

  it('should reject when a pageHtmlError response arrives', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    const responsePromise = dispatcher.request({
      type: 'getPageHtml',
      requestId: 'req-2',
      tabId: 99,
    });

    pushMessage(input, {
      type: 'pageHtmlError',
      requestId: 'req-2',
      error: 'Tab not found',
    });

    await expect(responsePromise).rejects.toThrow('Tab not found');

    input.end();
    await runPromise;
  });

  it('should write the request to output', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    // Don't await — just start the request
    const responsePromise = dispatcher.request({
      type: 'getPageHtml',
      requestId: 'req-3',
      tabId: 7,
    });

    // Verify the request was written to output
    const written = await readMessage<NativeOutbound>(output);
    expect(written).toEqual({
      type: 'getPageHtml',
      requestId: 'req-3',
      tabId: 7,
    });

    // Resolve the request so we can clean up
    pushMessage(input, { type: 'pageHtml', requestId: 'req-3', html: '' });
    await responsePromise;

    input.end();
    await runPromise;
  });

  it('should resolve when a highlightTextResult response arrives', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    const responsePromise = dispatcher.request({
      type: 'highlightText',
      requestId: 'req-hl-1',
      tabId: 42,
      text: 'hello world',
    });

    pushMessage(input, {
      type: 'highlightTextResult',
      requestId: 'req-hl-1',
      highlightedText: 'hello world',
    });

    const response = await responsePromise;
    expect(response).toEqual({
      type: 'highlightTextResult',
      requestId: 'req-hl-1',
      highlightedText: 'hello world',
    });
    expect((response as HighlightTextResponse).highlightedText).toBe('hello world');

    input.end();
    await runPromise;
  });

  it('should reject when a highlightTextError response arrives', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    const responsePromise = dispatcher.request({
      type: 'highlightText',
      requestId: 'req-hl-2',
      tabId: 99,
      text: 'nonexistent',
    });

    pushMessage(input, {
      type: 'highlightTextError',
      requestId: 'req-hl-2',
      error: 'Text not found on page: "nonexistent"',
    });

    await expect(responsePromise).rejects.toThrow('Text not found');

    input.end();
    await runPromise;
  });

  it('should reject pending requests on EOF', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    const runPromise = dispatcher.run(() => {});

    const responsePromise = dispatcher.request({
      type: 'getPageHtml',
      requestId: 'req-4',
      tabId: 1,
    });

    // Close connection before response arrives
    input.end();

    await expect(responsePromise).rejects.toThrow('Connection closed');
    await runPromise;
  });
});

// ── interleaved flow ───────────────────────────────────────────────

describe('MessageDispatcher interleaved flow', () => {
  it('should handle a request/response while processing an execute', async () => {
    const { input, output } = createStreams();
    const dispatcher = new MessageDispatcher({ input, output });

    // Handler simulates an agent run that needs page HTML
    const handlerComplete = new Promise<string>((resolve) => {
      dispatcher.run(async (msg) => {
        if (msg.type === 'execute') {
          // Agent tool calls request() mid-execution
          const response = await dispatcher.request({
            type: 'getPageHtml',
            requestId: 'html-req',
            tabId: 10,
          });

          const html = (response as PageHtmlResponse).html;

          // Send the final result
          dispatcher.send({
            type: 'success',
            requestId: msg.requestId,
            data: { markdown: `converted: ${html}` },
          });

          resolve(html);
        }
      });
    });

    // 1. Extension sends execute
    pushMessage(input, {
      type: 'execute',
      requestId: 'exec-1',
      payload: { command: 'extract' },
    });

    // 2. Give handler time to start and send getPageHtml request
    await new Promise((r) => setTimeout(r, 10));

    // 3. Verify the getPageHtml request was written
    const nativeRequest = await readMessage<NativeOutbound>(output);
    expect(nativeRequest).toEqual({
      type: 'getPageHtml',
      requestId: 'html-req',
      tabId: 10,
    });

    // 4. Extension responds with HTML
    pushMessage(input, {
      type: 'pageHtml',
      requestId: 'html-req',
      html: '<h1>Test</h1>',
    });

    // 5. Handler resolves, sends success response
    const html = await handlerComplete;
    expect(html).toBe('<h1>Test</h1>');

    // 6. Verify the success response was written
    const successResponse = await readMessage<NativeOutbound>(output);
    expect(successResponse).toEqual({
      type: 'success',
      requestId: 'exec-1',
      data: { markdown: 'converted: <h1>Test</h1>' },
    });

    input.end();
  });
});
