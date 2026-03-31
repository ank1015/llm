import { createAdaptorServer } from '@hono/node-server';
import { Value } from '@sinclair/typebox/value';
import { WebSocket, WebSocketServer } from 'ws';

import {
  AttachTerminalQuerySchema,
  TerminalClientMessageSchema,
} from './contracts/index.js';
import { terminalRegistry } from './core/terminal/terminal-registry.js';

import type {
  AttachTerminalQuery,
  TerminalClientMessage,
  TerminalServerMessage,
} from './contracts/index.js';
import type { Hono } from 'hono';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

type TerminalSocketParams = {
  projectId: string;
  artifactId: string;
  terminalId: string;
  afterSeq: number;
};

function writeUpgradeError(socket: Duplex, statusCode: 400 | 404, message: string): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusCode === 404 ? 'Not Found' : 'Bad Request'}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n` +
      '\r\n' +
      message
  );
  socket.destroy();
}

function parseTerminalSocketRequest(
  request: IncomingMessage
): { ok: true; params: TerminalSocketParams } | { ok: false; status: 400 | 404; message: string } {
  if (!request.url) {
    return {
      ok: false,
      status: 400,
      message: 'Missing request URL',
    };
  }

  const url = new URL(request.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts.length !== 8 ||
    parts[0] !== 'api' ||
    parts[1] !== 'projects' ||
    parts[3] !== 'artifacts' ||
    parts[5] !== 'terminals' ||
    parts[7] !== 'socket'
  ) {
    return {
      ok: false,
      status: 404,
      message: 'Terminal socket route not found',
    };
  }

  const queryObject = Object.fromEntries(url.searchParams.entries());
  if (!Value.Check(AttachTerminalQuerySchema, queryObject)) {
    return {
      ok: false,
      status: 400,
      message: 'Invalid terminal socket query parameters',
    };
  }

  const query = queryObject as AttachTerminalQuery;
  const afterSeq = query.afterSeq === undefined ? 0 : Number(query.afterSeq);
  if (!Number.isFinite(afterSeq) || afterSeq < 0) {
    return {
      ok: false,
      status: 400,
      message: 'afterSeq must be a non-negative number',
    };
  }

  try {
    return {
      ok: true,
      params: {
        projectId: decodeURIComponent(parts[2]!),
        artifactId: decodeURIComponent(parts[4]!),
        terminalId: decodeURIComponent(parts[6]!),
        afterSeq: Math.floor(afterSeq),
      },
    };
  } catch {
    return {
      ok: false,
      status: 400,
      message: 'Invalid terminal socket path',
    };
  }
}

function sendWebSocketMessage(socket: WebSocket, message: TerminalServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function closeWebSocket(socket: WebSocket, code = 1000, reason = 'Terminal closed'): void {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
    return;
  }

  socket.close(code, reason);
}

function parseTerminalClientMessage(data: string): TerminalClientMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    return Value.Check(TerminalClientMessageSchema, parsed)
      ? (parsed as TerminalClientMessage)
      : null;
  } catch {
    return null;
  }
}

function attachTerminalSocket(socket: WebSocket, params: TerminalSocketParams): void {
  const detach = terminalRegistry.attachTerminal(
    params.projectId,
    params.artifactId,
    params.terminalId,
    {
      send: (message) => {
        sendWebSocketMessage(socket, message);
      },
      close: (code, reason) => {
        closeWebSocket(socket, code, reason);
      },
    },
    params.afterSeq
  );

  if (!detach) {
    closeWebSocket(socket, 1008, 'Terminal not found');
    return;
  }

  socket.on('message', (raw, isBinary) => {
    if (isBinary) {
      closeWebSocket(socket, 1003, 'Binary terminal messages are not supported');
      return;
    }

    const message = parseTerminalClientMessage(String(raw));
    if (!message) {
      closeWebSocket(socket, 1008, 'Invalid terminal message');
      return;
    }

    try {
      if (message.type === 'input') {
        terminalRegistry.writeInput(
          params.projectId,
          params.artifactId,
          params.terminalId,
          message.data
        );
        return;
      }

      terminalRegistry.resizeTerminal(
        params.projectId,
        params.artifactId,
        params.terminalId,
        message.cols,
        message.rows
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terminal socket command failed';
      closeWebSocket(socket, 1011, message);
    }
  });

  socket.on('close', () => {
    detach();
  });

  socket.on('error', () => {
    detach();
  });
}

export function createHttpServer(app: Hono): ReturnType<typeof createAdaptorServer> {
  const server = createAdaptorServer({
    fetch: app.fetch,
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const parsed = parseTerminalSocketRequest(request);
    if (!parsed.ok) {
      writeUpgradeError(socket, parsed.status, parsed.message);
      return;
    }

    const terminal = terminalRegistry.getTerminal(
      parsed.params.projectId,
      parsed.params.artifactId,
      parsed.params.terminalId
    );
    if (!terminal) {
      writeUpgradeError(socket, 404, 'Terminal not found');
      return;
    }

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      attachTerminalSocket(webSocket, parsed.params);
    });
  });

  server.on('close', () => {
    wss.close();
  });

  return server;
}

export {
  attachTerminalSocket,
  parseTerminalClientMessage,
  parseTerminalSocketRequest,
  writeUpgradeError,
};
