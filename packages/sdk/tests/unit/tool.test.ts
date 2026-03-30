import { Type } from '@sinclair/typebox';
import { describe, expect, it, vi } from 'vitest';

import { tool } from '../../src/index.js';

import type { Message } from '@ank1015/llm-core';

const QUERY_TOOL_PARAMETERS = Type.Object({
  query: Type.String(),
});

describe('tool helper', () => {
  it('returns a core-compatible tool with a flatter execute signature', async () => {
    const signal = new AbortController().signal;
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: [{ type: 'text', content: 'Find docs' }],
      },
    ];

    const execute = vi.fn(async (params, context) => {
      expect(params).toEqual({ query: 'sdk tool helper' });
      expect(context.messages).toBe(messages);
      expect(context.toolCallId).toBe('call-1');
      expect(context.signal).toBe(signal);

      return {
        content: [{ type: 'text', content: 'Found results' }],
        details: { count: 3 },
      };
    });

    const wrappedTool = tool({
      name: 'searchDocs',
      description: 'Search the docs',
      parameters: QUERY_TOOL_PARAMETERS,
      execute,
    });

    const result = await wrappedTool.execute({
      toolCallId: 'call-1',
      params: { query: 'sdk tool helper' },
      signal,
      context: {
        messages,
      },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [{ type: 'text', content: 'Found results' }],
      details: { count: 3 },
    });
  });

  it('forwards partial updates without changing content or details', async () => {
    const updates = vi.fn();

    const wrappedTool = tool({
      name: 'searchDocs',
      description: 'Search the docs',
      parameters: QUERY_TOOL_PARAMETERS,
      async execute(params, context) {
        expect(params).toEqual({ query: 'sdk tool helper' });

        await context.update({
          content: [{ type: 'text', content: 'Searching...' }],
          details: { progress: 50 },
        });

        return {
          content: [{ type: 'text', content: 'Done' }],
          details: { progress: 100 },
        };
      },
    });

    const result = await wrappedTool.execute({
      toolCallId: 'call-2',
      params: { query: 'sdk tool helper' },
      onUpdate: updates,
      context: {
        messages: [],
      },
    });

    expect(updates).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith({
      content: [{ type: 'text', content: 'Searching...' }],
      details: { progress: 50 },
    });
    expect(result).toEqual({
      content: [{ type: 'text', content: 'Done' }],
      details: { progress: 100 },
    });
  });

  it('provides a no-op update helper when no core onUpdate callback is present', async () => {
    const wrappedTool = tool({
      name: 'searchDocs',
      description: 'Search the docs',
      parameters: QUERY_TOOL_PARAMETERS,
      async execute(_params, context) {
        await expect(
          context.update({
            content: [{ type: 'text', content: 'Searching...' }],
            details: { progress: 50 },
          })
        ).resolves.toBeUndefined();

        return {
          content: [{ type: 'text', content: 'Done' }],
        };
      },
    });

    await expect(
      wrappedTool.execute({
        toolCallId: 'call-3',
        params: { query: 'sdk tool helper' },
        context: {
          messages: [],
        },
      })
    ).resolves.toEqual({
      content: [{ type: 'text', content: 'Done' }],
    });
  });
});
