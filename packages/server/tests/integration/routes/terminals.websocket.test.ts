import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createApp } from '../../../src/app.js';
import { createHttpServer } from '../../../src/http-server.js';
import { resetTerminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';
import { createTempServerConfig, jsonRequest } from '../../helpers/server-fixture.js';
import { openSocket, waitForCondition } from '../../helpers/websocket.js';

import type { AddressInfo } from 'node:net';

let cleanup: (() => Promise<void>) | null = null;
let fakePtys: ReturnType<typeof createFakePtyFactory>;
let server: ReturnType<typeof createHttpServer> | null = null;
let app = createApp();
let baseWsUrl = '';
let openSockets: WebSocket[] = [];

const PROJECT = 'terminal-project';
const ARTIFACT = 'workspace';

beforeEach(async () => {
  fakePtys = createFakePtyFactory();
  resetTerminalRegistry(fakePtys.factory);

  const fixture = await createTempServerConfig('llm-server-terminal-ws');
  cleanup = fixture.cleanup;
  app = createApp();

  await jsonRequest(app, '/api/projects', 'POST', { name: PROJECT });
  await jsonRequest(app, `/api/projects/${PROJECT}/artifacts`, 'POST', { name: ARTIFACT });

  server = createHttpServer(app);
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseWsUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const socket of openSockets) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.terminate();
      } catch {
        // Ignore teardown races for rejected websocket connections.
      }
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
  }

  await cleanup?.();
  cleanup = null;
});

async function createTerminal(): Promise<{ id: string }> {
  const response = await jsonRequest(
    app,
    `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals`,
    'POST',
    {}
  );
  return response.json() as Promise<{ id: string }>;
}

describe('Terminal WebSocket server', () => {
  it('streams output, accepts input and resize commands, and replays missed output after reconnect', async () => {
    const created = await createTerminal();
    const socketPath = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals/${created.id}/socket`;

    const firstSocket = await openSocket(`${baseWsUrl}${socketPath}`, openSockets);
    expect(await firstSocket.nextMessage()).toEqual(
      expect.objectContaining({
        type: 'ready',
        terminal: expect.objectContaining({ id: created.id }),
      })
    );

    fakePtys.instances[0]?.emitData('hello');
    expect(await firstSocket.nextMessage()).toEqual({
      type: 'output',
      seq: 1,
      data: 'hello',
    });

    firstSocket.socket.send(JSON.stringify({ type: 'input', data: 'pwd\n' }));
    firstSocket.socket.send(JSON.stringify({ type: 'resize', cols: 160, rows: 48 }));

    await waitForCondition(() => (fakePtys.instances[0]?.writes.length ?? 0) === 1);
    await waitForCondition(() => (fakePtys.instances[0]?.resizeCalls.length ?? 0) === 1);
    expect(fakePtys.instances[0]?.writes).toEqual(['pwd\n']);
    expect(fakePtys.instances[0]?.resizeCalls).toEqual([{ cols: 160, rows: 48 }]);

    const firstSocketClosed = firstSocket.waitForClose();
    firstSocket.socket.close();
    await firstSocketClosed;

    fakePtys.instances[0]?.emitData('missed output');

    const secondSocket = await openSocket(`${baseWsUrl}${socketPath}?afterSeq=1`, openSockets);
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

  it('rejects connections to terminals that do not exist', async () => {
    const missingSocket = new WebSocket(
      `${baseWsUrl}/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals/missing/socket`
    );
    openSockets.push(missingSocket);

    await expect(
      new Promise<void>((resolve, reject) => {
        missingSocket.once('unexpected-response', (_request, response) => {
          missingSocket.removeAllListeners();
          if (response.statusCode === 404) {
            resolve();
            return;
          }
          reject(new Error(`Unexpected status: ${response.statusCode ?? 0}`));
        });
        missingSocket.once('open', () => reject(new Error('Socket should not open')));
        missingSocket.once('error', reject);
      })
    ).resolves.toBeUndefined();
  });
});
