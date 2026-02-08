import { Readable, Writable } from 'node:stream';

import { describe, it, expect } from 'vitest';

import { readMessage, writeMessage } from '../../../src/native/stdio.js';
import {
  LENGTH_PREFIX_BYTES,
  MAX_MESSAGE_SIZE_BYTES,
} from '../../../src/shared/protocol.constants.js';

/** Encode a JSON object into a length-prefixed buffer (same format as writeMessage). */
function encode(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf-8');
  const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

/** Create a readable stream that yields the given buffer. */
function readableFrom(buf: Buffer): Readable {
  return new Readable({
    read() {
      this.push(buf);
      this.push(null);
    },
  });
}

/** Collect all data written to a writable stream. */
function collectWritable(): { writable: Writable; data: () => Buffer } {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return { writable, data: () => Buffer.concat(chunks) };
}

// ── writeMessage ────────────────────────────────────────────────────

describe('writeMessage', () => {
  it('should write a 4-byte LE length prefix followed by JSON', () => {
    const { writable, data } = collectWritable();
    const message = { type: 'pong', requestId: '1' };

    writeMessage(message, writable);

    const result = data();
    const expectedJson = Buffer.from(JSON.stringify(message), 'utf-8');
    const expectedLength = Buffer.alloc(LENGTH_PREFIX_BYTES);
    expectedLength.writeUInt32LE(expectedJson.length, 0);

    expect(result.subarray(0, LENGTH_PREFIX_BYTES)).toEqual(expectedLength);
    expect(result.subarray(LENGTH_PREFIX_BYTES)).toEqual(expectedJson);
  });

  it('should throw when serialized message exceeds max size', () => {
    const { writable } = collectWritable();
    const oversized = { data: 'x'.repeat(MAX_MESSAGE_SIZE_BYTES) };

    expect(() => writeMessage(oversized, writable)).toThrow(/exceeds maximum/);
  });
});

// ── readMessage ─────────────────────────────────────────────────────

describe('readMessage', () => {
  it('should parse a length-prefixed JSON message', async () => {
    const original = { type: 'ping', requestId: 'abc' };
    const input = readableFrom(encode(original));

    const result = await readMessage(input);

    expect(result).toEqual(original);
  });

  it('should return null on clean EOF (empty stream)', async () => {
    const input = new Readable({
      read() {
        this.push(null);
      },
    });

    const result = await readMessage(input);

    expect(result).toBeNull();
  });

  it('should throw when message length exceeds max size', async () => {
    const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
    length.writeUInt32LE(MAX_MESSAGE_SIZE_BYTES + 1, 0);
    const input = readableFrom(length);

    await expect(readMessage(input)).rejects.toThrow(/exceeds maximum/);
  });

  it('should throw on zero-length message', async () => {
    const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
    length.writeUInt32LE(0, 0);
    const input = readableFrom(length);

    await expect(readMessage(input)).rejects.toThrow(/zero-length/);
  });

  it('should handle messages delivered in multiple chunks', async () => {
    const original = { type: 'execute', requestId: '42', payload: { command: 'test' } };
    const fullBuf = encode(original);

    // Split the buffer into 3-byte chunks to simulate partial reads
    const input = new Readable({
      read() {
        let offset = 0;
        while (offset < fullBuf.length) {
          const end = Math.min(offset + 3, fullBuf.length);
          this.push(fullBuf.subarray(offset, end));
          offset = end;
        }
        this.push(null);
      },
    });

    const result = await readMessage(input);

    expect(result).toEqual(original);
  });

  it('should throw when stream ends mid-read (partial length prefix)', async () => {
    // Only 2 bytes of the 4-byte length prefix
    const partial = Buffer.alloc(2);
    partial.writeUInt16LE(10, 0);
    const input = readableFrom(partial);

    await expect(readMessage(input)).rejects.toThrow(/Stream ended/);
  });
});
