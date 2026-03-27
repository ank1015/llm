import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { setConfig } from '../../../src/core/config.js';
import { resetTerminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { app, createHttpServer } from '../../../src/index.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';
import { resetAgentMocks } from '../../helpers/mock-agents.js';

import type { AddressInfo } from 'node:net';
import type { RawData } from 'ws';

let projectsRoot: string;
let dataRoot: string;
let fakePtys: ReturnType<typeof createFakePtyFactory>;
let server: ReturnType<typeof createHttpServer> | null = null;
let baseWsUrl = '';
let openSockets: WebSocket[] = [];

const PROJECT = 'terminal-project';
const ARTIFACT = 'workspace';

beforeEach(async () => {
  resetAgentMocks();
  fakePtys = createFakePtyFactory();
  resetTerminalRegistry(fakePtys.factory);
  projectsRoot = await mkdtemp(join(tmpdir(), 'terminal-ws-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'terminal-ws-data-'));
  setConfig({ projectsRoot, dataRoot });

  await app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PROJECT }),
  });
  await app.request(`/api/projects/${PROJECT}/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ARTIFACT }),
  });

  server = createHttpServer(app);
  await new Promise<void>((resolve) => {
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseWsUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const socket of openSockets) {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
    socket.removeAllListeners();
  }
  openSockets = [];

  resetTerminalRegistry();
  if (server) {
    const currentServer = server;
    server = null;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      currentServer.close((error) => {
        finish(error);
      });
      setTimeout(() => {
        finish(null);
      }, 50);
    });
  } else {
    server = null;
  }
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

async function createTerminal() {
  const response = await app.request(`/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return response.json();
}

type SocketHarness = {
  socket: WebSocket;
  nextMessage: () => Promise<any>;
  waitForClose: () => Promise<{ code: number; reason: string }>;
};

function createSocketHarness(socket: WebSocket): SocketHarness {
  const queuedMessages: any[] = [];
  const pendingResolvers: Array<{
    resolve: (message: any) => void;
    reject: (error: Error) => void;
  }> = [];
  let closeInfo: { code: number; reason: string } | null = null;
  let terminalError: Error | null = null;

  socket.on('message', (raw: RawData) => {
    const parsed = JSON.parse(String(raw));
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
      pendingResolvers.shift()!.reject(new Error('Socket closed before the next message arrived'));
    }
  });

  socket.on('error', (error) => {
    terminalError = error;
    while (pendingResolvers.length > 0) {
      pendingResolvers.shift()!.reject(error);
    }
  });

  return {
    socket,
    nextMessage: () => {
      if (queuedMessages.length > 0) {
        return Promise.resolve(queuedMessages.shift());
      }

      if (terminalError) {
        return Promise.reject(terminalError);
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

async function openSocket(url: string): Promise<SocketHarness> {
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

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000,
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

describe('Terminal WebSocket server', () => {
  it('streams output, accepts input and resize commands, and replays missed output after reconnect', async () => {
    const created = await createTerminal();
    const socketPath = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals/${created.id}/socket`;

    const firstSocket = await openSocket(`${baseWsUrl}${socketPath}`);
    expect(await firstSocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'ready',
        terminal: expect.objectContaining({ id: created.id }),
      })
    );

    fakePtys.instances[0]!.emitData('hello');
    expect(await firstSocket.nextMessage()).toEqual({
      type: 'output',
      seq: 1,
      data: 'hello',
    });

    firstSocket.socket.send(JSON.stringify({ type: 'input', data: 'pwd\n' }));
    firstSocket.socket.send(JSON.stringify({ type: 'resize', cols: 160, rows: 48 }));

    await waitForCondition(() => fakePtys.instances[0]!.writes.length === 1);
    await waitForCondition(() => fakePtys.instances[0]!.resizeCalls.length === 1);
    expect(fakePtys.instances[0]!.writes).toEqual(['pwd\n']);
    expect(fakePtys.instances[0]!.resizeCalls).toEqual([{ cols: 160, rows: 48 }]);

    const firstSocketClosed = firstSocket.waitForClose();
    firstSocket.socket.close();
    await firstSocketClosed;

    fakePtys.instances[0]!.emitData('missed output');

    const secondSocket = await openSocket(`${baseWsUrl}${socketPath}?afterSeq=1`);
    expect(await secondSocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'ready',
      })
    );
    expect(await secondSocket.nextMessage()).toEqual({
      type: 'output',
      seq: 2,
      data: 'missed output',
    });

    const secondSocketClosed = secondSocket.waitForClose();
    secondSocket.socket.close();
    await secondSocketClosed;
  });

  it('replaces the active controller and replays exited terminals before closing the socket', async () => {
    const created = await createTerminal();
    const socketPath = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals/${created.id}/socket`;

    const firstSocket = await openSocket(`${baseWsUrl}${socketPath}`);
    await firstSocket.nextMessage();

    const firstSocketClosed = firstSocket.waitForClose();
    const secondSocket = await openSocket(`${baseWsUrl}${socketPath}`);
    expect((await firstSocketClosed).code).toBe(4101);
    expect(await secondSocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'ready',
      })
    );

    fakePtys.instances[0]!.emitData('before exit');
    expect(await secondSocket.nextMessage()).toEqual({
      type: 'output',
      seq: 1,
      data: 'before exit',
    });

    const secondSocketClosed = secondSocket.waitForClose();
    fakePtys.instances[0]!.emitExit({ exitCode: 0 });
    expect(await secondSocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'exit',
        seq: 2,
        exitCode: 0,
      })
    );
    expect((await secondSocketClosed).code).toBe(1000);

    const replaySocket = await openSocket(`${baseWsUrl}${socketPath}`);
    const replaySocketClosed = replaySocket.waitForClose();
    expect(await replaySocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'ready',
        terminal: expect.objectContaining({
          status: 'exited',
        }),
      })
    );
    expect(await replaySocket.nextMessage()).toEqual({
      type: 'output',
      seq: 1,
      data: 'before exit',
    });
    expect(await replaySocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'exit',
        seq: 2,
        exitCode: 0,
      })
    );
    expect((await replaySocketClosed).code).toBe(1000);
  });
});
