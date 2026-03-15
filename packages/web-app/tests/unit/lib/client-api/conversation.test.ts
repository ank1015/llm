import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LiveRunSummaryDto, StreamEventMap } from '@ank1015/llm-app-contracts';

function createEventStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
    status: 200,
  });
}

describe('conversation client-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('parses SSE events from streamConversation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createEventStreamResponse([
          'event: ready\ndata: {"ok":true,"sessionId":"session-1","runId":"run-1","status":"running"}\n\n',
          'event: agent_event\ndata: {"seq":1,"event":{"type":"tool_call"}}\n\n',
          'event: done\ndata: {"ok":true,"sessionId":"session-1","runId":"run-1","status":"completed","messageCount":3}\n\n',
        ])
      );

    vi.stubGlobal('fetch', fetchMock);

    const events: Array<[keyof StreamEventMap, StreamEventMap[keyof StreamEventMap]]> = [];
    const { streamConversation } = await import('@/lib/client-api/conversation');

    await streamConversation(
      {
        api: 'codex',
        artifactId: 'artifact-1',
        message: 'hello',
        modelId: 'gpt-5.4',
        projectId: 'project-1',
        reasoningLevel: 'high',
        sessionId: 'session-1',
      },
      {
        onEvent: (eventName, data) => {
          events.push([eventName, data]);
        },
      }
    );

    expect(events.map(([eventName]) => eventName)).toEqual(['ready', 'agent_event', 'done']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws StreamConflictError for live-run conflicts', async () => {
    const liveRun: LiveRunSummaryDto = {
      finishedAt: undefined,
      mode: 'prompt',
      runId: 'run-1',
      startedAt: '2026-03-16T00:00:00.000Z',
      status: 'running',
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'A stream is already running for this session.',
          liveRun,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 409,
        }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const { StreamConflictError, streamConversation } =
      await import('@/lib/client-api/conversation');

    await expect(
      streamConversation({
        api: 'codex',
        artifactId: 'artifact-1',
        message: 'hello',
        modelId: 'gpt-5.4',
        projectId: 'project-1',
        reasoningLevel: 'high',
        sessionId: 'session-1',
      })
    ).rejects.toMatchObject({
      liveRun: {
        mode: liveRun.mode,
        runId: liveRun.runId,
        startedAt: liveRun.startedAt,
        status: liveRun.status,
      },
      name: StreamConflictError.name,
    });
  });
});
