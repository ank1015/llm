import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseAssistantMessage } from "@ank1015/llm-sdk";

import type { SessionTreeResponse } from "@/lib/client-api";
import { getBrowserQueryClient } from "@/lib/query-client";
import { useChatStore } from "@/stores/chat-store";

const {
  attachToSessionRunMock,
  cancelSessionRunMock,
  getSessionMock,
  getSessionMessagesMock,
  getSessionTreeMock,
  streamConversationMock,
  streamEditConversationMock,
  streamRetryConversationMock,
} = vi.hoisted(() => ({
  attachToSessionRunMock: vi.fn(),
  cancelSessionRunMock: vi.fn(),
  getSessionMock: vi.fn(),
  getSessionMessagesMock: vi.fn(),
  getSessionTreeMock: vi.fn(),
  streamConversationMock: vi.fn(),
  streamEditConversationMock: vi.fn(),
  streamRetryConversationMock: vi.fn(),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");

  return {
    ...actual,
    attachToSessionRun: attachToSessionRunMock,
    cancelSessionRun: cancelSessionRunMock,
    getSession: getSessionMock,
    getSessionMessages: getSessionMessagesMock,
    getSessionTree: getSessionTreeMock,
    streamConversation: streamConversationMock,
    streamEditConversation: streamEditConversationMock,
    streamRetryConversation: streamRetryConversationMock,
  };
});

const ctx = {
  projectId: "project-1",
  artifactId: "artifact-1",
};

const session = { sessionId: "session-1" };

const persistedUserNode = {
  type: "message" as const,
  id: "node-user",
  parentId: "session-root",
  branch: "main",
  timestamp: "2026-03-30T10:00:00.000Z",
  message: {
    role: "user" as const,
    id: "message-user",
    timestamp: Date.now(),
    content: [{ type: "text" as const, content: "Hello" }],
  },
  metadata: { modelId: "codex/gpt-5.4" },
} as SessionTreeResponse["nodes"][number];

const persistedAssistantNode = {
  type: "message" as const,
  id: "node-assistant",
  parentId: "node-user",
  branch: "main",
  timestamp: "2026-03-30T10:00:01.000Z",
  message: {
    role: "assistant" as const,
    id: "message-assistant",
    api: "codex" as const,
    model: {
      id: "gpt-5.4",
      api: "codex" as const,
      name: "GPT-5.4",
      baseUrl: "https://example.com",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1,
      maxTokens: 1,
      tools: [],
    },
    timestamp: Date.now(),
    duration: 1,
    stopReason: "stop" as const,
    content: [],
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    message: {} as BaseAssistantMessage<"codex">["message"],
  },
  metadata: { modelId: "codex/gpt-5.4" },
} as SessionTreeResponse["nodes"][number];

describe("chat store", () => {
  beforeEach(() => {
    attachToSessionRunMock.mockReset();
    cancelSessionRunMock.mockReset();
    getSessionMock.mockReset();
    getSessionMessagesMock.mockReset();
    getSessionTreeMock.mockReset();
    streamConversationMock.mockReset();
    streamEditConversationMock.mockReset();
    streamRetryConversationMock.mockReset();
    getBrowserQueryClient().clear();
    useChatStore.getState().setActiveSession(null);
    useChatStore.getState().clearSessionState(session);

    getSessionMock.mockResolvedValue({
      id: session.sessionId,
      name: "Session",
      modelId: "codex/gpt-5.4",
      createdAt: "2026-03-30T09:59:00.000Z",
      activeBranch: "main",
    });
    getSessionMessagesMock.mockResolvedValue([persistedUserNode, persistedAssistantNode]);
    getSessionTreeMock.mockResolvedValue({
      nodes: [persistedUserNode, persistedAssistantNode],
      persistedLeafNodeId: persistedAssistantNode.id,
      activeBranch: "main",
      liveRun: undefined,
    });
  });

  afterEach(() => {
    getBrowserQueryClient().clear();
    useChatStore.getState().clearSessionState(session);
  });

  it("starts a stream with modelId and reasoningEffort and reloads current session data", async () => {
    streamConversationMock.mockImplementation(async (_request, handlers) => {
      handlers.onEvent?.("ready", {
        ok: true,
        sessionId: session.sessionId,
        runId: "run-1",
        status: "running",
      });
      handlers.onEvent?.("node_persisted", {
        seq: 1,
        node: persistedUserNode,
      });
      handlers.onEvent?.("done", {
        ok: true,
        sessionId: session.sessionId,
        runId: "run-1",
        status: "completed",
        messageCount: 2,
      });
    });

    useChatStore.getState().setActiveSession(session);

    await useChatStore.getState().startStream({
      ...ctx,
      sessionId: session.sessionId,
      prompt: "Hello",
      modelId: "codex/gpt-5.4",
      reasoningEffort: "high",
    });

    expect(streamConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "codex/gpt-5.4",
        reasoningEffort: "high",
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    expect(useChatStore.getState().messagesBySession[session.sessionId]).toHaveLength(2);
  });

  it("passes reasoningEffort through retry and edit stream requests", async () => {
    useChatStore.setState((state) => ({
      ...state,
      activeSession: session,
      messagesBySession: {
        ...state.messagesBySession,
        [session.sessionId]: [persistedUserNode],
      },
      messageTreesBySession: {
        ...state.messageTreesBySession,
        [session.sessionId]: [persistedUserNode],
      },
      persistedLeafNodeIdBySession: {
        ...state.persistedLeafNodeIdBySession,
        [session.sessionId]: persistedUserNode.id,
      },
      visibleLeafNodeIdBySession: {
        ...state.visibleLeafNodeIdBySession,
        [session.sessionId]: persistedUserNode.id,
      },
    }));

    streamRetryConversationMock.mockResolvedValue(undefined);
    streamEditConversationMock.mockResolvedValue(undefined);

    await useChatStore.getState().retryFromNode({
      ...ctx,
      sessionId: session.sessionId,
      nodeId: persistedUserNode.id,
      modelId: "codex/gpt-5.4",
      reasoningEffort: "medium",
    });

    await useChatStore.getState().editFromNode({
      ...ctx,
      sessionId: session.sessionId,
      nodeId: persistedUserNode.id,
      prompt: "Edited",
      modelId: "codex/gpt-5.4",
      reasoningEffort: "low",
    });

    expect(streamRetryConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: "medium",
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    expect(streamEditConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: "low",
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it("cancels a running stream using the current run id", async () => {
    useChatStore.setState((state) => ({
      ...state,
      liveRunBySession: {
        ...state.liveRunBySession,
        [session.sessionId]: {
          runId: "run-1",
          mode: "prompt",
          status: "running",
          startedAt: "2026-03-30T10:00:00.000Z",
        },
      },
    }));

    await useChatStore.getState().abortStream({
      session,
      ...ctx,
    });

    expect(cancelSessionRunMock).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      projectId: ctx.projectId,
      artifactId: ctx.artifactId,
      runId: "run-1",
    });
  });
});
