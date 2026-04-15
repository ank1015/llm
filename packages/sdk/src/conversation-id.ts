import { createHash } from 'node:crypto';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toDeterministicUuidV7(input: string): string {
  if (input.length === 0) {
    throw new Error('Cannot derive a UUIDv7 conversation ID from an empty session ID.');
  }

  if (UUID_V7_PATTERN.test(input)) {
    return input;
  }

  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return [
    bytes.toString('hex', 0, 4),
    bytes.toString('hex', 4, 6),
    bytes.toString('hex', 6, 8),
    bytes.toString('hex', 8, 10),
    bytes.toString('hex', 10, 16),
  ].join('-');
}
