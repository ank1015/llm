import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTerminalPanel } from "@/components/project-terminal-panel";
import { getBrowserQueryClient } from "@/lib/query-client";

type MockSocketConnection = {
  sendInput: ReturnType<typeof vi.fn>;
  sendResize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: () => number;
};

const ctx = {
  projectId: "project-1",
  artifactId: "artifact-1",
};

const {
  createTerminalMock,
  deleteTerminalMock,
  listTerminalsMock,
  openTerminalSocketMock,
} = vi.hoisted(() => ({
  createTerminalMock: vi.fn(),
  deleteTerminalMock: vi.fn(),
  listTerminalsMock: vi.fn(),
  openTerminalSocketMock: vi.fn(),
}));

vi.mock("@/components/project-terminal-surface", () => ({
  ProjectTerminalSurface: ({ terminalId }: { terminalId: string }) => (
    <div>Surface {terminalId}</div>
  ),
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

function createSummary(id: string, title: string) {
  return {
    id,
    title,
    status: "running" as const,
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

function createMetadata(id: string, title: string) {
  return {
    ...createSummary(id, title),
    cwdAtLaunch: `/tmp/${id}`,
    shell: "/bin/zsh",
  };
}

async function flushTerminalUpdates() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProjectTerminalPanel", () => {
  beforeEach(async () => {
    listTerminalsMock.mockReset();
    createTerminalMock.mockReset();
    deleteTerminalMock.mockReset();
    openTerminalSocketMock.mockReset();
    getBrowserQueryClient().clear();

    listTerminalsMock.mockResolvedValue([]);
    createTerminalMock.mockResolvedValue(createMetadata("terminal-1", "Terminal 1"));
    deleteTerminalMock.mockResolvedValue({ deleted: true, terminalId: "terminal-1" });
    openTerminalSocketMock.mockReturnValue({
      sendInput: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
      readyState: () => 1,
    } satisfies MockSocketConnection);

    const { useTerminalStore } = await import("@/stores/terminals-store");
    const { useArtifactFilesStore } = await import("@/stores/artifact-files-store");
    useTerminalStore.getState().reset();
    useArtifactFilesStore.setState({
      selectedFileByArtifact: {},
      previewModeByArtifact: {},
    });
  });

  afterEach(async () => {
    const { useTerminalStore } = await import("@/stores/terminals-store");
    useTerminalStore.getState().reset();
    getBrowserQueryClient().clear();
  });

  it("opens the dock with Ctrl+` and auto-creates the first terminal", async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={getBrowserQueryClient()}>
          <ProjectTerminalPanel artifactContext={ctx} />
        </QueryClientProvider>,
      );
      await flushTerminalUpdates();
    });

    await act(async () => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        code: "Backquote",
      });
      await flushTerminalUpdates();
    });

    await waitFor(() => {
      expect(createTerminalMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Surface terminal-1")).toBeInTheDocument();
    expect(screen.queryByText("Terminal 1")).not.toBeInTheDocument();
  });

  it("keeps the dock chrome minimal when multiple terminals exist", async () => {
    listTerminalsMock.mockResolvedValue([
      createSummary("terminal-1", "Terminal 1"),
      createSummary("terminal-2", "Terminal 2"),
    ]);

    await act(async () => {
      render(
        <QueryClientProvider client={getBrowserQueryClient()}>
          <ProjectTerminalPanel artifactContext={ctx} />
        </QueryClientProvider>,
      );
      await flushTerminalUpdates();
    });

    await act(async () => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        code: "Backquote",
      });
      await flushTerminalUpdates();
    });

    await waitFor(() => {
      expect(screen.getByText("Surface terminal-2")).toBeInTheDocument();
    });
    expect(screen.queryByTitle("Terminal 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kill Terminal 1" })).not.toBeInTheDocument();
  });

  it("closes the dock with Ctrl+` while focus is inside the terminal", async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={getBrowserQueryClient()}>
          <ProjectTerminalPanel artifactContext={ctx} />
        </QueryClientProvider>,
      );
      await flushTerminalUpdates();
    });

    await act(async () => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        code: "Backquote",
      });
      await flushTerminalUpdates();
    });

    await waitFor(() => {
      expect(screen.getByText("Surface terminal-1")).toBeInTheDocument();
    });

    const terminalHost = document.createElement("div");
    terminalHost.className = "artifact-terminal-surface";
    const terminalInput = document.createElement("textarea");
    terminalInput.className = "xterm-helper-textarea";
    terminalHost.appendChild(terminalInput);
    document.body.appendChild(terminalHost);

    await act(async () => {
      fireEvent.keyDown(terminalInput, {
        ctrlKey: true,
        code: "Backquote",
      });
      await flushTerminalUpdates();
    });

    await waitFor(() => {
      expect(screen.queryByText("Surface terminal-1")).not.toBeInTheDocument();
    });

    terminalHost.remove();
  });
});
