import { describe, expect, it } from 'vitest';

import { toolResultMessage, userMessage } from '../../src/index.js';

describe('userMessage', () => {
  it('builds a text user message from a string and generates an id', () => {
    const message = userMessage('Hello from the sdk');

    expect(message).toEqual({
      role: 'user',
      id: expect.any(String),
      content: [{ type: 'text', content: 'Hello from the sdk' }],
    });
  });

  it('preserves explicit id, timestamp, and structured content', () => {
    const message = userMessage(
      [
        { type: 'text', content: 'Describe this image' },
        { type: 'image', data: 'base64-data', mimeType: 'image/png' },
      ],
      {
        id: 'msg-custom',
        timestamp: 1234,
      }
    );

    expect(message).toEqual({
      role: 'user',
      id: 'msg-custom',
      timestamp: 1234,
      content: [
        { type: 'text', content: 'Describe this image' },
        { type: 'image', data: 'base64-data', mimeType: 'image/png' },
      ],
    });
  });

  it('builds a tool result message and generates id and timestamp', () => {
    const message = toolResultMessage({
      toolCall: {
        type: 'toolCall',
        name: 'lookup_weather',
        arguments: { city: 'London' },
        toolCallId: 'tool-1',
      },
      content: [{ type: 'text', content: '72F, sunny' }],
      details: { source: 'test' },
    });

    expect(message).toEqual({
      role: 'toolResult',
      id: expect.any(String),
      toolName: 'lookup_weather',
      toolCallId: 'tool-1',
      content: [{ type: 'text', content: '72F, sunny' }],
      details: { source: 'test' },
      isError: false,
      timestamp: expect.any(Number),
    });
  });

  it('supports explicit tool result error details', () => {
    const message = toolResultMessage({
      toolCall: {
        type: 'toolCall',
        name: 'read_file',
        arguments: { path: '/tmp/missing' },
        toolCallId: 'tool-2',
      },
      content: [{ type: 'text', content: 'ENOENT' }],
      error: {
        message: 'File not found',
        name: 'ENOENT',
      },
      id: 'tool-result-2',
      timestamp: 99,
    });

    expect(message).toEqual({
      role: 'toolResult',
      id: 'tool-result-2',
      toolName: 'read_file',
      toolCallId: 'tool-2',
      content: [{ type: 'text', content: 'ENOENT' }],
      isError: true,
      error: {
        message: 'File not found',
        name: 'ENOENT',
      },
      timestamp: 99,
    });
  });
});
