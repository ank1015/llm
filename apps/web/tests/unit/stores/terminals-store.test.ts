import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserQueryClient } from "@/lib/query-client";

import type {
  TerminalMetadataDto,
  TerminalServerMessage,
  TerminalSummaryDto,
} from "@/lib/client-api";

type MockSocketConnection = {
  request: {
    projectId: string;
    artifactId: string;
    terminalId: string;
    afterSeq?: number;
  };
  handlers: {
    onMessage?: (message: TerminalServerMessage) => void;
    onClose?: () => void;
    onError?: (error: Error) => void;
  };
  sendInput: ReturnType<typeof vi.fn>;
  sendResize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: () => number;
};

const {
  createTerminalMock,
  deleteTerminalMock,
  listTerminalsMock,
  openTerminalSocketMock,
  socketConnections,
} = vi.hoisted(() => ({
  createTerminalMock: vi.fn(),
  deleteTerminalMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  openTerminalSocketMock: vi.fn(),
  socketConnections: [] as MockSocketConnection[],
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");

  return {
    ...actual,
    createTerminal: createTerminalMock,
    deleteTerminal: deleteTerminalMock,
    listTerminals: listTerminalsMock,
    openTerminalSocket: openTerminalSocketMock,
  };
});

const ctx = {
  projectId: "project-1",
  artifactId: "artifact-1",
};

function createSummary(id: string, title: string): TerminalSummaryDto {
  return {
    id,
    title,
    status: "running",
    projectId: ctx.projectId,
    artifactId: ctx.artifactId,
    cols: 120,
    rows: 30,
    createdAt: `2026-03-27T00:00:0${id === "terminal-1" ? "1" : "2"}.000Z`,
    lastActiveAt: "2026-03-27T00:00:00.000Z",
    exitCode: null,
    signal: null,
    exitedAt: null,
  };
}

function createMetadata(id: string, title: string): TerminalMetadataDto {
  return {
    ...createSummary(id, title),
    cwdAtLaunch: `/tmp/${id}`,
    shell: "/bin/zsh",
  };
}

describe("terminals store", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    createTerminalMock.mockReset();
    deleteTerminalMock.mockReset();
    listTerminalsMock.mockReset();
    openTerminalSocketMock.mockReset();
    socketConnections.length = 0;
    getBrowserQueryClient().clear();
    deleteTerminalMock.mockResolvedValue({ deleted: true });

    openTerminalSocketMock.mockImplementation((request, handlers) => {
      const connection: MockSocketConnection = {
        request,
        handlers,
        sendInput: vi.fn(),
        sendResize: vi.fn(),
        close: vi.fn(),
        readyState: () => 1,
      };

      socketConnections.push(connection);
      return connection;
    });

    const { useTerminalStore } = await import("@/stores/terminals-store");
    useTerminalStore.getState().reset();
  });

  afterEach(async () => {
    const { useTerminalStore } = await import("@/stores/terminals-store");
    useTerminalStore.getState().reset();
    getBrowserQueryClient().clear();
    vi.useRealTimers();
  });

  it("opens the dock and auto-creates the first terminal when none exist", async () => {
    listTerminalsMock.mockResolvedValue([]);
    createTerminalMock.mockResolvedValue(createMetadata("terminal-1", "Terminal 1"));

    const { useTerminalStore } = await import("@/stores/terminals-store");

    await useTerminalStore.getState().activateArtifact(ctx);
    await useTerminalStore.getState().openDock(ctx);

    const artifactKey = "project-1::artifact-1";
    expect(createTerminalMock).toHaveBeenCalledTimes(1);
    expect(useTerminalStore.getState().dockByArtifact[artifactKey]).toMatchObject({
      open: true,
      activeTerminalId: "terminal-1",
      terminalIds: ["terminal-1"],
    });
    expect(openTerminalSocketMock).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalId: "terminal-1",
      }),
      expect.any(Object),
    );
  });

  it("reattaches a previously active terminal with afterSeq when switching tabs back", async () => {
    listTerminalsMock.mockResolvedValue([
      createSummary("terminal-1", "Terminal 1"),
      createSummary("terminal-2", "Terminal 2"),
    ]);

    const { useTerminalStore } = await import("@/stores/terminals-store");

    await useTerminalStore.getState().activateArtifact(ctx);
    await useTerminalStore.getState().openDock(ctx);

    const initialConnection = socketConnections[0];
    expect(initialConnection?.request.terminalId).toBe("terminal-2");

    initialConnection?.handlers.onMessage?.({
      type: "ready",
      terminal: createMetadata("terminal-2", "Terminal 2"),
    });
    initialConnection?.handlers.onMessage?.({
      type: "output",
      seq: 3,
      data: "hello\n",
    });

    await useTerminalStore.getState().selectTerminal(ctx, "terminal-1");
    await useTerminalStore.getState().selectTerminal(ctx, "terminal-2");

    const reconnectCall = openTerminalSocketMock.mock.calls.at(-1)?.[0];
    expect(reconnectCall).toMatchObject({
      terminalId: "terminal-2",
      afterSeq: 3,
    });
    expect(initialConnection?.close).toHaveBeenCalled();
  });

  it("reconnects a running active terminal after an unexpected socket close", async () => {
    vi.useFakeTimers();
    listTerminalsMock.mockResolvedValue([createSummary("terminal-1", "Terminal 1")]);

    const { useTerminalStore } = await import("@/stores/terminals-store");

    await useTerminalStore.getState().activateArtifact(ctx);
    await useTerminalStore.getState().openDock(ctx);

    const connection = socketConnections[0];
    connection?.handlers.onMessage?.({
      type: "ready",
      terminal: createMetadata("terminal-1", "Terminal 1"),
    });
    connection?.handlers.onClose?.();

    await vi.advanceTimersByTimeAsync(500);

    expect(openTerminalSocketMock).toHaveBeenCalledTimes(2);
    expect(openTerminalSocketMock.mock.calls[1]?.[0]).toMatchObject({
      terminalId: "terminal-1",
    });
  });

  it("closes the dock when the last terminal is deleted", async () => {
    listTerminalsMock.mockResolvedValue([createSummary("terminal-1", "Terminal 1")]);

    const { useTerminalStore } = await import("@/stores/terminals-store");

    await useTerminalStore.getState().activateArtifact(ctx);
    await useTerminalStore.getState().openDock(ctx);
    await useTerminalStore.getState().deleteTerminal(ctx, "terminal-1");

    const artifactKey = "project-1::artifact-1";
    expect(useTerminalStore.getState().dockByArtifact[artifactKey]).toMatchObject({
      open: false,
      terminalIds: [],
      activeTerminalId: null,
    });
  });
});
