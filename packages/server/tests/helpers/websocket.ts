import WebSocket from 'ws';

import type { RawData } from 'ws';

export type SocketHarness = {
  socket: WebSocket;
  nextMessage: () => Promise<unknown>;
  waitForClose: () => Promise<{ code: number; reason: string }>;
};

export function createSocketHarness(socket: WebSocket): SocketHarness {
  const queuedMessages: unknown[] = [];
  const pendingResolvers: Array<{
    resolve: (message: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  let closeInfo: { code: number; reason: string } | null = null;
  let socketError: Error | null = null;

  socket.on('message', (raw: RawData) => {
    const parsed = JSON.parse(String(raw)) as unknown;
    const pending = pendingResolvers.shift();
    if (pending) {
      pending.resolve(parsed);
      return;
    }

    queuedMessages.push(parsed);
  });

  socket.on('close', (code, reason) => {
    closeInfo = {
      code,
      reason: reason.toString(),
    };

    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()?.reject(
        new Error('Socket closed before the next message arrived')
      );
    }
  });

  socket.on('error', (error) => {
    socketError = error;
    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()?.reject(error);
    }
  });

  return {
    socket,
    nextMessage: () => {
      if (queuedMessages.length > 0) {
        return Promise.resolve(queuedMessages.shift());
      }

      if (socketError) {
        return Promise.reject(socketError);
      }

      if (closeInfo) {
        return Promise.reject(new Error('Socket closed before the next message arrived'));
      }

      return new Promise((resolve, reject) => {
        pendingResolvers.push({ resolve, reject });
      });
    },
    waitForClose: () => {
      if (closeInfo) {
        return Promise.resolve(closeInfo);
      }

      return new Promise((resolve) => {
        socket.once('close', (code, reason) => {
          resolve({
            code,
            reason: reason.toString(),
          });
        });
      });
    },
  };
}

export async function openSocket(url: string, openSockets: WebSocket[]): Promise<SocketHarness> {
  const socket = new WebSocket(url);
  openSockets.push(socket);
  const harness = createSocketHarness(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
    socket.once('unexpected-response', (_request, response) => {
      reject(new Error(`Unexpected terminal websocket response: ${response.statusCode ?? 0}`));
    });
  });

  return harness;
}

export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2_000,
  intervalMs = 10
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
