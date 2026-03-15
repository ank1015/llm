import { PassThrough } from 'node:stream';

import { afterEach, describe, it, expect, vi } from 'vitest';

import { readMessage } from '../../../src/native/stdio.js';
import { LENGTH_PREFIX_BYTES } from '../../../src/protocol/constants.js';
import { ChromeClient } from '../../../src/sdk/client.js';

import type { HostMessage, ChromeMessage } from '../../../src/protocol/types.js';

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
function pushMessage(stream: PassThrough, message: ChromeMessage): void {
  stream.write(encode(message));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── call() ──────────────────────────────────────────────────────────

describe('ChromeClient.call', () => {
  it('should send a call message and resolve with the result', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    // Read the outgoing call message to get the ID
    const callPromise = client.call('tabs.query', { active: true });

    const sent = await readMessage<HostMessage>(output);
    expect(sent).toMatchObject({
      type: 'call',
      method: 'tabs.query',
      args: [{ active: true }],
    });

    // Respond with result using the same ID
    pushMessage(input, {
      id: sent!.id,
      type: 'result',
      data: [{ id: 1, url: 'https://example.com' }],
    });

    const result = await callPromise;
    expect(result).toEqual([{ id: 1, url: 'https://example.com' }]);

    input.end();
    await runPromise;
  });

  it('should reject when Chrome returns an error', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    const callPromise = client.call('tabs.get', 999);

    const sent = await readMessage<HostMessage>(output);
    pushMessage(input, { id: sent!.id, type: 'error', error: 'No tab with id: 999' });

    await expect(callPromise).rejects.toThrow('No tab with id: 999');

    input.end();
    await runPromise;
  });

  it('should throw if called after connection closes', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    input.end();
    await runPromise;

    await expect(client.call('tabs.query')).rejects.toThrow('connection is closed');
  });

  it('should reject pending calls on disconnect', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    const callPromise = client.call('tabs.query', { active: true });

    // Close before responding
    input.end();
    await runPromise;

    await expect(callPromise).rejects.toThrow('Connection closed');
  });
});

// ── subscribe() ─────────────────────────────────────────────────────

describe('ChromeClient.subscribe', () => {
  it('should send a subscribe message and receive events', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    const events: unknown[] = [];
    client.subscribe('tabs.onUpdated', (data) => events.push(data));

    const sent = await readMessage<HostMessage>(output);
    expect(sent).toMatchObject({ type: 'subscribe', event: 'tabs.onUpdated' });

    // Push two events
    pushMessage(input, { id: sent!.id, type: 'event', data: [1, { status: 'loading' }] });
    pushMessage(input, { id: sent!.id, type: 'event', data: [1, { status: 'complete' }] });

    await new Promise((r) => setTimeout(r, 10));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual([1, { status: 'loading' }]);
    expect(events[1]).toEqual([1, { status: 'complete' }]);

    input.end();
    await runPromise;
  });

  it('should send unsubscribe and stop receiving events', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    const events: unknown[] = [];
    const unsubscribe = client.subscribe('tabs.onUpdated', (data) => events.push(data));

    const sent = await readMessage<HostMessage>(output);

    // One event before unsubscribe
    pushMessage(input, { id: sent!.id, type: 'event', data: [1, { status: 'loading' }] });
    await new Promise((r) => setTimeout(r, 10));

    unsubscribe();

    // Read the unsubscribe message
    const unsub = await readMessage<HostMessage>(output);
    expect(unsub).toMatchObject({ id: sent!.id, type: 'unsubscribe' });

    // Event after unsubscribe — should be ignored
    pushMessage(input, { id: sent!.id, type: 'event', data: [1, { status: 'complete' }] });
    await new Promise((r) => setTimeout(r, 10));

    expect(events).toHaveLength(1);

    input.end();
    await runPromise;
  });

  it('should clean up subscription on error from Chrome', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    const events: unknown[] = [];
    client.subscribe('nonexistent.onFoo', (data) => events.push(data));

    const sent = await readMessage<HostMessage>(output);
    pushMessage(input, {
      id: sent!.id,
      type: 'error',
      error: 'chrome.nonexistent.onFoo is not available',
    });

    await new Promise((r) => setTimeout(r, 10));

    // Event after error — subscription was cleaned up, should be ignored
    pushMessage(input, { id: sent!.id, type: 'event', data: 'should not arrive' });
    await new Promise((r) => setTimeout(r, 10));

    expect(events).toHaveLength(0);

    input.end();
    await runPromise;
  });
});

// ── run() ───────────────────────────────────────────────────────────

describe('ChromeClient.run', () => {
  it('should return on clean EOF', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });

    input.end();
    await client.run();
  });

  it('should rethrow fatal read errors', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });

    const runPromise = client.run();

    // Write invalid data (length prefix but no body, then close)
    const badPrefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
    badPrefix.writeUInt32LE(100, 0);
    input.write(badPrefix);
    input.end();

    await expect(runPromise).rejects.toThrow(/Stream ended/);
  });
});

// ── getPageMarkdown() ──────────────────────────────────────────────

describe('ChromeClient.getPageMarkdown', () => {
  it('should read page HTML and convert it to markdown', async () => {
    const client = new ChromeClient();
    const callSpy = vi.spyOn(client, 'call').mockImplementation(async (method, ...args) => {
      if (method === 'tabs.get') {
        return { status: 'complete' };
      }

      if (method === 'debugger.evaluate') {
        expect(args[0]).toMatchObject({
          tabId: 123,
          awaitPromise: false,
          userGesture: false,
        });

        return {
          result: '<!DOCTYPE html>\n<html><body><h1>Alpha</h1><p>Beta</p></body></html>',
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ markdown: '# Alpha\n\nBeta' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const markdown = await client.getPageMarkdown(123);

    expect(markdown).toBe('# Alpha\n\nBeta');
    expect(callSpy).toHaveBeenCalledWith('tabs.get', 123);
    expect(callSpy).toHaveBeenCalledWith(
      'debugger.evaluate',
      expect.objectContaining({ tabId: 123 })
    );
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: '<!DOCTYPE html>\n<html><body><h1>Alpha</h1><p>Beta</p></body></html>',
      }),
    });
  });

  it('should throw when the converter is unavailable', async () => {
    const client = new ChromeClient();
    vi.spyOn(client, 'call').mockImplementation(async (method) => {
      if (method === 'tabs.get') {
        return { status: 'complete' };
      }

      if (method === 'debugger.evaluate') {
        return {
          result: '<!DOCTYPE html>\n<html><body><h1>Alpha</h1></body></html>',
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    await expect(client.getPageMarkdown(123)).rejects.toThrow(
      'Failed to reach markdown converter'
    );
  });
});

// ── interleaved call + subscribe ────────────────────────────────────

describe('ChromeClient interleaved flow', () => {
  it('should handle calls and events arriving interleaved', async () => {
    const { input, output } = createStreams();
    const client = new ChromeClient({ input, output });
    const runPromise = client.run();

    // Start a subscription
    const events: unknown[] = [];
    client.subscribe('tabs.onUpdated', (data) => events.push(data));
    const subMsg = await readMessage<HostMessage>(output);

    // Start a call
    const callPromise = client.call('tabs.query', { active: true });
    const callMsg = await readMessage<HostMessage>(output);

    // Chrome sends an event, then the call result — interleaved
    pushMessage(input, { id: subMsg!.id, type: 'event', data: [42, { status: 'loading' }] });
    pushMessage(input, { id: callMsg!.id, type: 'result', data: [{ id: 42 }] });
    pushMessage(input, { id: subMsg!.id, type: 'event', data: [42, { status: 'complete' }] });

    const result = await callPromise;
    expect(result).toEqual([{ id: 42 }]);

    await new Promise((r) => setTimeout(r, 10));
    expect(events).toHaveLength(2);

    input.end();
    await runPromise;
  });
});
