import { describe, expect, it } from 'vitest';

import { toDeterministicUuidV7 } from '../../src/conversation-id.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('conversation id helpers', () => {
  it('maps the same UUIDv4 session ID to the same UUIDv7-shaped ID', () => {
    const sessionId = '76b274ae-f417-4abb-acf9-8e4062b86eed';

    expect(toDeterministicUuidV7(sessionId)).toBe(toDeterministicUuidV7(sessionId));
  });

  it('maps different session IDs to different UUIDv7-shaped IDs', () => {
    const first = toDeterministicUuidV7('76b274ae-f417-4abb-acf9-8e4062b86eed');
    const second = toDeterministicUuidV7('203368c9-32af-425c-b858-6ef31e6b5122');

    expect(first).not.toBe(second);
    expect(first).toMatch(UUID_V7_PATTERN);
    expect(second).toMatch(UUID_V7_PATTERN);
  });

  it('sets UUID version 7 and RFC 4122 variant bits', () => {
    const conversationId = toDeterministicUuidV7('76b274ae-f417-4abb-acf9-8e4062b86eed');

    expect(conversationId.at(14)).toBe('7');
    expect(conversationId.at(19)).toMatch(/[89ab]/);
  });

  it('returns existing UUIDv7 IDs unchanged', () => {
    const conversationId = '018f1f2e-7c99-7cc1-9f5d-2a2a9f3c7b11';

    expect(toDeterministicUuidV7(conversationId)).toBe(conversationId);
  });

  it('maps custom non-UUID session IDs to UUIDv7-shaped IDs', () => {
    expect(toDeterministicUuidV7('gmail-summary')).toMatch(UUID_V7_PATTERN);
  });
});
