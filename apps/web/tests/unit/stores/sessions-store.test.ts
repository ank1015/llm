import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserQueryClient } from "@/lib/query-client";
import { useSessionsStore } from "@/stores/sessions-store";

import type { SessionSummaryDto } from "@/lib/client-api";

const {
  createSessionMock,
  listSessionsMock,
  renameSessionMock,
  deleteSessionMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  listSessionsMock: vi.fn(),
  renameSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");

  return {
    ...actual,
    createSession: createSessionMock,
    deleteSession: deleteSessionMock,
    listSessions: listSessionsMock,
    renameSession: renameSessionMock,
  };
});

const ctx = {
  projectId: "project-1",
  artifactId: "artifact-1",
};

const SESSION_A: SessionSummaryDto = {
  createdAt: "2026-03-16T00:00:00.000Z",
  nodeCount: 2,
  sessionId: "session-a",
  sessionName: "Alpha",
  updatedAt: null,
};

const SESSION_B: SessionSummaryDto = {
  createdAt: "2026-03-16T01:00:00.000Z",
  nodeCount: 1,
  sessionId: "session-b",
  sessionName: "Beta",
  updatedAt: null,
};

describe("sessions store", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    listSessionsMock.mockReset();
    renameSessionMock.mockReset();
    deleteSessionMock.mockReset();
    getBrowserQueryClient().clear();
    useSessionsStore.getState().reset();
  });

  afterEach(() => {
    getBrowserQueryClient().clear();
    useSessionsStore.getState().reset();
  });

  it("renames and removes sessions optimistically", () => {
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [SESSION_A, SESSION_B],
    }));

    useSessionsStore.getState().optimisticRenameSession("session-a", "Renamed");
    useSessionsStore.getState().optimisticRemoveSession("session-b");

    expect(useSessionsStore.getState().sessions).toEqual([
      {
        ...SESSION_A,
        sessionName: "Renamed",
      },
    ]);
  });

  it("upserts existing sessions and prepends new ones", () => {
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [SESSION_A],
    }));

    useSessionsStore.getState().upsertSession({
      ...SESSION_A,
      nodeCount: 5,
    });
    useSessionsStore.getState().upsertSession(SESSION_B);

    expect(useSessionsStore.getState().sessions).toEqual([
      SESSION_B,
      {
        ...SESSION_A,
        nodeCount: 5,
      },
    ]);
  });

  it("creates a session with only current model settings input", async () => {
    createSessionMock.mockResolvedValue({
      id: "session-new",
      name: "Session New",
      modelId: "codex/gpt-5.4",
      createdAt: "2026-03-16T02:00:00.000Z",
      activeBranch: "main",
    });
    listSessionsMock.mockResolvedValue([SESSION_A]);

    const result = await useSessionsStore.getState().createSession(ctx, {
      sessionName: "Session New",
      modelId: "codex/gpt-5.4",
    });

    expect(createSessionMock).toHaveBeenCalledWith(ctx, {
      name: "Session New",
      modelId: "codex/gpt-5.4",
    });
    expect(result).toEqual({ sessionId: "session-new" });
  });
});
