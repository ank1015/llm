import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTerminalSurface } from "@/components/project-terminal-surface";

type MockTerminalRecord = {
  id: string;
  title: string;
  status: "running" | "exited";
  projectId: string;
  artifactId: string;
  cols: number;
  rows: number;
  createdAt: string;
  lastActiveAt: string;
  exitCode: number | null;
  signal: string | null;
  exitedAt: string | null;
  cwdAtLaunch: string;
  shell: string;
  connectionState: "disconnected" | "connecting" | "connected" | "reconnecting";
  socketError: string | null;
  lastSeq: number;
  bufferVersion: number;
  isDeleting: boolean;
};

type MockDockState = {
  open: boolean;
  heightPx: number;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  terminalIds: string[];
  activeTerminalId: string | null;
  lastHydratedAt: number;
  filesystemEpoch: number;
};

const artifactContext = {
  projectId: "project-1",
  artifactId: "artifact-1",
} as const;

const artifactKey = `${artifactContext.projectId}::${artifactContext.artifactId}`;

function createTerminalRecord(id: string, title: string): MockTerminalRecord {
  return {
    id,
    title,
    status: "running",
    projectId: "project-1",
    artifactId: "artifact-1",
    cols: 80,
    rows: 24,
    createdAt: "2026-03-27T00:00:00.000Z",
    lastActiveAt: "2026-03-27T00:00:00.000Z",
    exitCode: null,
    signal: null,
    exitedAt: null,
    cwdAtLaunch: `/tmp/${id}`,
    shell: "/bin/zsh",
    connectionState: "connected",
    socketError: null,
    lastSeq: 1,
    bufferVersion: 1,
    isDeleting: false,
  };
}

function createDockState(terminalIds: string[], activeTerminalId: string | null) {
  return {
    open: true,
    heightPx: 320,
    hasHydrated: true,
    isLoading: false,
    error: null,
    terminalIds,
    activeTerminalId,
    lastHydratedAt: Date.now(),
    filesystemEpoch: 0,
  };
}

const terminalState = vi.hoisted(() => ({
  terminalsById: {
    "project-1::artifact-1::terminal-1": createTerminalRecord("terminal-1", "Terminal 1"),
  } as Record<string, MockTerminalRecord>,
  dockByArtifact: {
    "project-1::artifact-1": createDockState(["terminal-1"], "terminal-1"),
  } as Record<string, MockDockState>,
  createTerminal: vi.fn(() => Promise.resolve("terminal-2")),
  deleteTerminal: vi.fn(() => Promise.resolve()),
  selectTerminal: vi.fn(() => Promise.resolve()),
  sendInput: vi.fn(),
  resizeTerminal: vi.fn(),
  replayFrames: [
    {
      type: "output" as const,
      seq: 1,
      data: "hello\n",
    },
  ],
}));

const terminalMockState = vi.hoisted(() => {
  const instances: Array<{
    write: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    loadAddon: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    attachCustomWheelEventHandler: ReturnType<typeof vi.fn>;
    onData: ReturnType<typeof vi.fn>;
    cols: number;
    rows: number;
    options: Record<string, unknown>;
    dataListener?: (data: string) => void;
  }> = [];

  class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    write = vi.fn();
    focus = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    attachCustomWheelEventHandler = vi.fn();
    onData = vi.fn((listener: (data: string) => void) => {
      this.dataListener = listener;
      return {
        dispose: vi.fn(),
      };
    });
    dataListener?: (data: string) => void;

    constructor() {
      instances.push(this);
    }
  }

  class MockFitAddon {
    fit = vi.fn();
  }

  return {
    instances,
    MockTerminal,
    MockFitAddon,
  };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: terminalMockState.MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: terminalMockState.MockFitAddon,
}));

vi.mock("@/stores/terminals-store", () => ({
  getTerminalArtifactKey: (projectId: string, artifactId: string) => `${projectId}::${artifactId}`,
  getTerminalRecordKey: (ctx: { projectId: string; artifactId: string }, terminalId: string) =>
    `${ctx.projectId}::${ctx.artifactId}::${terminalId}`,
  getTerminalReplayFrames: () => terminalState.replayFrames,
  useTerminalStore: (selector: (state: typeof terminalState) => unknown) => selector(terminalState),
}));

vi.mock("@/stores/ui-store", () => ({
  useUiStore: (selector: (state: { theme: "light" | "dark" }) => unknown) =>
    selector({ theme: "light" }),
}));

describe("ProjectTerminalSurface", () => {
  beforeEach(() => {
    terminalState.terminalsById = {
      [`${artifactKey}::terminal-1`]: createTerminalRecord("terminal-1", "Terminal 1"),
    };
    terminalState.dockByArtifact = {
      [artifactKey]: createDockState(["terminal-1"], "terminal-1"),
    };
    terminalState.createTerminal.mockClear();
    terminalState.deleteTerminal.mockClear();
    terminalState.selectTerminal.mockClear();
    terminalState.sendInput.mockClear();
    terminalState.resizeTerminal.mockClear();
    terminalMockState.instances.length = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 320,
      height: 320,
      left: 0,
      right: 1200,
      toJSON: () => ({}),
      top: 0,
      width: 1200,
      x: 0,
      y: 0,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replays output and forwards input and resize events", () => {
    render(
      <ProjectTerminalSurface artifactContext={artifactContext} terminalId="terminal-1" />,
    );

    const instance = terminalMockState.instances[0];
    expect(instance).toBeDefined();
    expect(instance?.attachCustomWheelEventHandler).not.toHaveBeenCalled();
    expect(instance?.write).toHaveBeenCalledWith("hello\n");
    expect(terminalState.resizeTerminal).toHaveBeenCalledWith(
      artifactContext,
      "terminal-1",
      80,
      24,
    );
    expect(screen.queryByLabelText("Terminal sessions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New terminal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kill current terminal" })).toBeInTheDocument();

    instance?.dataListener?.("pwd\n");
    expect(terminalState.sendInput).toHaveBeenCalledWith(artifactContext, "terminal-1", "pwd\n");
  });

  it("shows the sessions rail automatically and routes terminal actions through the store", () => {
    terminalState.terminalsById[`${artifactKey}::terminal-2`] = createTerminalRecord(
      "terminal-2",
      "Terminal 2",
    );
    terminalState.dockByArtifact[artifactKey] = createDockState(
      ["terminal-1", "terminal-2"],
      "terminal-1",
    );

    render(
      <ProjectTerminalSurface artifactContext={artifactContext} terminalId="terminal-1" />,
    );

    expect(screen.getByLabelText("Terminal sessions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));
    expect(terminalState.createTerminal).toHaveBeenCalledWith(artifactContext);

    fireEvent.click(screen.getByRole("button", { name: "Kill current terminal" }));
    expect(terminalState.deleteTerminal).toHaveBeenCalledWith(artifactContext, "terminal-1");

    fireEvent.click(screen.getByRole("button", { name: "Switch to Terminal 2" }));
    expect(terminalState.selectTerminal).toHaveBeenCalledWith(artifactContext, "terminal-2");
  });

  it("shows socket and exit state banners", () => {
    terminalState.terminalsById[`${artifactKey}::terminal-1`] = {
      ...terminalState.terminalsById[`${artifactKey}::terminal-1`],
      status: "exited",
      exitCode: 2,
      socketError: "Socket dropped",
    };

    render(
      <ProjectTerminalSurface artifactContext={artifactContext} terminalId="terminal-1" />,
    );

    expect(screen.getByText("Socket dropped")).toBeInTheDocument();
    expect(screen.getByText("Process exited with code 2.")).toBeInTheDocument();
  });

  it("skips fitting while the terminal surface is transiently collapsed", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 40,
      toJSON: () => ({}),
      top: 0,
      width: 40,
      x: 0,
      y: 0,
    });

    render(
      <ProjectTerminalSurface artifactContext={artifactContext} terminalId="terminal-1" />,
    );

    expect(terminalState.resizeTerminal).not.toHaveBeenCalled();
  });
});
