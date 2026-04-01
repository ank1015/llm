import { afterEach, describe, expect, it, vi } from "vitest";

import type { LiveRunSummaryDto, StreamEventMap } from "@/lib/client-api";

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
      "Content-Type": "text/event-stream",
    },
    status: 200,
  });
}

describe("conversation client-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("parses SSE events from streamConversation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createEventStreamResponse([
        'event: ready\ndata: {"ok":true,"sessionId":"session-1","runId":"run-1","status":"running"}\n\n',
        'event: agent_event\ndata: {"seq":1,"event":{"type":"tool_call"}}\n\n',
        'event: done\ndata: {"ok":true,"sessionId":"session-1","runId":"run-1","status":"completed","messageCount":3}\n\n',
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const events: Array<[keyof StreamEventMap, StreamEventMap[keyof StreamEventMap]]> = [];
    const { streamConversation } = await import("@/lib/client-api/conversation");

    await streamConversation(
      {
        artifactId: "artifact-1",
        message: "hello",
        modelId: "gpt-5.4",
        projectId: "project-1",
        reasoningEffort: "high",
        sessionId: "session-1",
      },
      {
        onEvent: (eventName, data) => {
          events.push([eventName, data]);
        },
      },
    );

    expect(events.map(([eventName]) => eventName)).toEqual([
      "ready",
      "agent_event",
      "done",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws StreamConflictError for live-run conflicts", async () => {
    const liveRun: LiveRunSummaryDto = {
      mode: "prompt",
      runId: "run-1",
      startedAt: "2026-03-16T00:00:00.000Z",
      status: "running",
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "A stream is already running for this session.",
          liveRun,
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 409,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { StreamConflictError, streamConversation } = await import(
      "@/lib/client-api/conversation"
    );

    await expect(
      streamConversation({
        artifactId: "artifact-1",
        message: "hello",
        modelId: "gpt-5.4",
        projectId: "project-1",
        reasoningEffort: "high",
        sessionId: "session-1",
      }),
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

  it("includes attachments in the stream request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createEventStreamResponse([
        'event: done\ndata: {"ok":true,"sessionId":"session-1","runId":"run-1","status":"completed","messageCount":1}\n\n',
      ]),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { streamConversation } = await import("@/lib/client-api/conversation");

    await streamConversation({
      artifactId: "artifact-1",
      attachments: [
        {
          id: "file-1",
          type: "file",
          fileName: "report.pdf",
          mimeType: "application/pdf",
          size: 42,
          content: "JVBERi0xLjQK",
        },
      ],
      message: "",
      modelId: "gpt-5.4",
      projectId: "project-1",
      reasoningEffort: "high",
      sessionId: "session-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/projects/project-1/artifacts/artifact-1/sessions/session-1/stream",
      ),
      expect.objectContaining({
        body: JSON.stringify({
          message: "",
          attachments: [
            {
              id: "file-1",
              type: "file",
              fileName: "report.pdf",
              mimeType: "application/pdf",
              size: 42,
              content: "JVBERi0xLjQK",
            },
          ],
          modelId: "gpt-5.4",
          reasoningEffort: "high",
        }),
        method: "POST",
      }),
    );
  });

  it("calls the non-streaming prompt endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { promptSession } = await import("@/lib/client-api/conversation");

    await promptSession({
      artifactId: "artifact-1",
      message: "hello",
      modelId: "gpt-5.4",
      projectId: "project-1",
      reasoningEffort: "medium",
      sessionId: "session-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/sessions/session-1/prompt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "hello",
          modelId: "gpt-5.4",
          reasoningEffort: "medium",
        }),
      }),
    );
  });
});
