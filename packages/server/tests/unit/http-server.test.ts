import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

vi.mock('ws', () => {
  const mockState = {
    mockClose: vi.fn(),
    mockSend: vi.fn(),
    mockHandleUpgrade: vi.fn(),
    mockWssClose: vi.fn(),
  };

  class MockWebSocket {
    readyState = 1;
    send = mockState.mockSend;
    close = mockState.mockClose;
  }

  class MockWebSocketServer {
    constructor(_: unknown) {}

    handleUpgrade = mockState.mockHandleUpgrade;
    close = mockState.mockWssClose;
  }

  return {
    WebSocket: {
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    },
    WebSocketServer: MockWebSocketServer,
    __mockState: mockState,
  };
});

const wsModule = (await import('ws')) as typeof import('ws') & {
  __mockState: {
    mockClose: ReturnType<typeof vi.fn>;
    mockSend: ReturnType<typeof vi.fn>;
    mockHandleUpgrade: ReturnType<typeof vi.fn>;
    mockWssClose: ReturnType<typeof vi.fn>;
  };
};

const { createApp } = await import('../../src/app.js');
const {
  createHttpServer,
  parseTerminalClientMessage,
  parseTerminalSocketRequest,
  writeUpgradeError,
} = await import('../../src/http-server.js');
const { terminalRegistry } = await import('../../src/core/terminal/terminal-registry.js');

describe('http server helpers', () => {
  beforeEach(() => {
    const { mockClose, mockHandleUpgrade, mockSend, mockWssClose } = wsModule.__mockState;
    mockClose.mockReset();
    mockSend.mockReset();
    mockHandleUpgrade.mockReset();
    mockWssClose.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid terminal socket requests and rejects invalid ones', () => {
    const validRequest = {
      url: '/api/projects/project-a/artifacts/artifact-b/terminals/terminal-c/socket?afterSeq=12',
    } as IncomingMessage;
    expect(parseTerminalSocketRequest(validRequest)).toEqual({
      ok: true,
      params: {
        projectId: 'project-a',
        artifactId: 'artifact-b',
        terminalId: 'terminal-c',
        afterSeq: 12,
      },
    });

    const invalidQueryRequest = {
      url: '/api/projects/project-a/artifacts/artifact-b/terminals/terminal-c/socket?afterSeq=-1',
    } as IncomingMessage;
    expect(parseTerminalSocketRequest(invalidQueryRequest)).toEqual({
      ok: false,
      status: 400,
      message: 'afterSeq must be a non-negative number',
    });

    const wrongPathRequest = {
      url: '/api/projects/project-a/artifacts/artifact-b/terminals/terminal-c',
    } as IncomingMessage;
    expect(parseTerminalSocketRequest(wrongPathRequest)).toEqual({
      ok: false,
      status: 404,
      message: 'Terminal socket route not found',
    });
  });

  it('validates terminal client socket messages', () => {
    expect(parseTerminalClientMessage(JSON.stringify({ type: 'input', data: 'ls' }))).toEqual({
      type: 'input',
      data: 'ls',
    });
    expect(
      parseTerminalClientMessage(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }))
    ).toEqual({
      type: 'resize',
      cols: 80,
      rows: 24,
    });
    expect(parseTerminalClientMessage(JSON.stringify({ type: 'resize', cols: 0, rows: 24 }))).toBe(
      null
    );
    expect(parseTerminalClientMessage('not json')).toBe(null);
  });

  it('writes upgrade errors and wires terminal upgrade handling into the HTTP server', () => {
    const socket = {
      write: vi.fn(),
      destroy: vi.fn(),
    } as unknown as Duplex;
    writeUpgradeError(socket, 400, 'bad request');
    expect(socket.write).toHaveBeenCalledWith(
      expect.stringContaining('HTTP/1.1 400 Bad Request')
    );
    expect(socket.destroy).toHaveBeenCalled();

    const app = createApp();
    const server = createHttpServer(app);
    const upgradeHandler = server.listeners('upgrade')[0] as (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer
    ) => void;

    vi.spyOn(terminalRegistry, 'getTerminal').mockReturnValue(null);
    const missingTerminalSocket = {
      write: vi.fn(),
      destroy: vi.fn(),
    } as unknown as Duplex;

    upgradeHandler(
      {
        url: '/api/projects/project-a/artifacts/artifact-b/terminals/terminal-c/socket',
      } as IncomingMessage,
      missingTerminalSocket,
      Buffer.alloc(0)
    );

    expect(missingTerminalSocket.write).toHaveBeenCalledWith(
      expect.stringContaining('Terminal not found')
    );
    const { mockHandleUpgrade, mockWssClose } = wsModule.__mockState;
    expect(mockHandleUpgrade).not.toHaveBeenCalled();

    server.emit('close');
    expect(mockWssClose).toHaveBeenCalled();
  });
});
