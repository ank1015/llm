import { PassThrough } from 'node:stream';

import { describe, it, expect } from 'vitest';

import { readMessage } from '../../../src/native/stdio.js';
import { LENGTH_PREFIX_BYTES } from '../../../src/protocol/constants.js';
import { createChromeClient } from '../../../src/sdk/index.js';

import type { HostMessage, ChromeMessage } from '../../../src/protocol/types.js';

function encode(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf-8');
  const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

function createStreams() {
  return { input: new PassThrough(), output: new PassThrough() };
}

function pushMessage(stream: PassThrough, message: ChromeMessage): void {
  stream.write(encode(message));
}

describe('createChromeClient', () => {
  it('should return a client that is immediately usable', async () => {
    const { input, output } = createStreams();
    const client = createChromeClient({ input, output });

    const callPromise = client.call('tabs.query', { active: true });

    const sent = await readMessage<HostMessage>(output);
    expect(sent).toMatchObject({ type: 'call', method: 'tabs.query' });

    pushMessage(input, { id: sent!.id, type: 'result', data: [] });

    const result = await callPromise;
    expect(result).toEqual([]);

    input.end();
  });

  it('should handle read loop errors without crashing the process', async () => {
    const { input, output } = createStreams();
    const client = createChromeClient({ input, output });

    // Write invalid data to trigger a read error
    const badPrefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
    badPrefix.writeUInt32LE(100, 0);
    input.write(badPrefix);
    input.end();

    // Give the error handler time to run
    await new Promise((r) => setTimeout(r, 50));

    // Client should be closed — further calls reject
    await expect(client.call('tabs.query')).rejects.toThrow('connection is closed');
  });

  it('should reject pending calls when connection closes', async () => {
    const { input, output } = createStreams();
    const client = createChromeClient({ input, output });

    const callPromise = client.call('tabs.query');

    // Close without responding
    input.end();

    await expect(callPromise).rejects.toThrow('Connection closed');
  });
});
