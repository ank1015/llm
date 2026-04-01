import { describe, expect, it } from 'vitest';

import { getText, getThinking, getToolCalls } from '../../src/index.js';

import type { BaseAssistantMessage } from '../../src/index.js';

describe('response helpers', () => {
  it('extracts text, thinking, and tool calls from an assistant message', () => {
    const message = buildAssistantMessage();

    expect(getText(message)).toBe('Hello world');
    expect(getThinking(message)).toBe('First thought\n\nSecond thought');
    expect(getToolCalls(message)).toEqual([
      {
        type: 'toolCall',
        name: 'lookup_weather',
        arguments: { city: 'London' },
        toolCallId: 'tool-1',
      },
    ]);
  });

  it('also works when passed message.content directly', () => {
    const message = buildAssistantMessage();

    expect(getText(message.content)).toBe('Hello world');
    expect(getThinking(message.content)).toBe('First thought\n\nSecond thought');
    expect(getToolCalls(message.content)).toHaveLength(1);
  });

  it('returns empty values when there is no assistant message', () => {
    expect(getText(undefined)).toBe('');
    expect(getThinking(undefined)).toBe('');
    expect(getToolCalls(undefined)).toEqual([]);
  });
});

function buildAssistantMessage(): BaseAssistantMessage<'openai'> {
  return {
    role: 'assistant',
    api: 'openai',
    id: 'assistant-1',
    model: {
      api: 'openai',
      id: 'gpt-5.4-mini',
      info: {
        api: 'openai',
        supportsImages: true,
        supportsFiles: true,
        supportsPromptCache: false,
        supportsReasoning: true,
        supportsToolChoice: true,
        supportsTools: true,
      },
    },
    message: { id: 'native-1' } as BaseAssistantMessage<'openai'>['message'],
    timestamp: 1,
    duration: 1,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        response: [
          { type: 'text', content: 'Hello ' },
          { type: 'image', data: 'base64', mimeType: 'image/png' },
          { type: 'text', content: 'world' },
        ],
      },
      { type: 'thinking', thinkingText: 'First thought' },
      {
        type: 'toolCall',
        name: 'lookup_weather',
        arguments: { city: 'London' },
        toolCallId: 'tool-1',
      },
      { type: 'thinking', thinkingText: 'Second thought' },
    ],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}
