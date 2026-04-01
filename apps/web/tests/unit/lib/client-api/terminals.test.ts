import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EventHandler = (event: Event | MessageEvent | CloseEvent) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private readonly listeners = new Map<string, EventHandler[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventHandler): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", { code: code ?? 1000, reason: reason ?? "" } as CloseEvent);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  emitMessage(data: string): void {
    this.emit("message", { data } as MessageEvent);
  }

  emitError(): void {
    this.emit("error", new Event("error"));
  }

  private emit(type: string, event: Event | MessageEvent | CloseEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("terminal client-api", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("opens a websocket with the terminal path and queues messages until open", async () => {
    const { openTerminalSocket } = await import("@/lib/client-api/terminals");
    const onMessage = vi.fn();

    const connection = openTerminalSocket(
      {
        projectId: "project-1",
        artifactId: "artifact-1",
        terminalId: "terminal-1",
        afterSeq: 12,
      },
      { onMessage },
    );

    const socket = MockWebSocket.instances[0];
    expect(socket?.url).toBe(
      "ws://localhost:8001/api/projects/project-1/artifacts/artifact-1/terminals/terminal-1/socket?afterSeq=12",
    );

    connection.sendInput("pwd\n");
    connection.sendResize({ cols: 120, rows: 40 });
    expect(socket?.sent).toEqual([]);

    socket?.open();
    expect(socket?.sent).toEqual([
      JSON.stringify({ type: "input", data: "pwd\n" }),
      JSON.stringify({ type: "resize", cols: 120, rows: 40 }),
    ]);

    socket?.emitMessage(JSON.stringify({ type: "output", seq: 1, data: "hello\n" }));
    expect(onMessage).toHaveBeenCalledWith({ type: "output", seq: 1, data: "hello\n" });
  });

  it("surfaces invalid socket frames as errors", async () => {
    const { openTerminalSocket } = await import("@/lib/client-api/terminals");
    const onError = vi.fn();

    openTerminalSocket(
      {
        projectId: "project-1",
        artifactId: "artifact-1",
        terminalId: "terminal-1",
      },
      { onError },
    );

    const socket = MockWebSocket.instances[0];
    socket?.emitMessage("not-json");
    socket?.emitError();

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("calls the REST terminal endpoints with the expected URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createTerminal, deleteTerminal, getTerminal, listTerminals } = await import(
      "@/lib/client-api/terminals"
    );
    const ctx = { projectId: "project-1", artifactId: "artifact-1" };

    await listTerminals(ctx);
    await createTerminal(ctx, { cols: 80, rows: 24 });
    await getTerminal(ctx, "terminal-1");
    await deleteTerminal(ctx, "terminal-1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/terminals",
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/terminals",
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/terminals/terminal-1",
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/terminals/terminal-1",
    ]);
  });
});
