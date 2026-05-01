import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Socket } from 'node:net';
import { dirname, join } from 'node:path';

import { createApp, createHttpServer, setConfig } from '@ank1015/llm-server';

import { desktopDataRoot } from '../desktop-paths.js';

import type { EmbeddedServerStatus } from '../../shared/desktop-api.js';
import type { AppConfig } from '@ank1015/llm-server';
import type { Duplex } from 'node:stream';

export type EmbeddedServerState = {
  readonly status: EmbeddedServerStatus;
  readonly url: string | null;
};

export type EmbeddedServerController = {
  readonly getState: () => EmbeddedServerState;
  readonly start: (options: { readonly projectsRoot: string }) => Promise<EmbeddedServerState>;
  readonly stop: () => Promise<void>;
};

type RunningServers = {
  readonly apiServer: Server;
  readonly publicServer: Server;
  readonly webProcess: ChildProcess;
};

const internalHost = '127.0.0.1';

export const createEmbeddedServerController = (appPath: string): EmbeddedServerController => {
  let state: EmbeddedServerState = {
    status: 'idle',
    url: null,
  };
  let runningServers: RunningServers | null = null;

  return {
    getState: () => state,

    start: async ({ projectsRoot }) => {
      if (state.status === 'running' && state.url) {
        return state;
      }

      if (state.status === 'starting') {
        return state;
      }

      state = {
        status: 'starting',
        url: null,
      };

      try {
        const webEntry = resolveWebEntry(appPath);
        if (!existsSync(webEntry)) {
          throw new Error(
            `Missing desktop web build at ${webEntry}. Run pnpm --filter @ank1015/llm-desktop-app build.`
          );
        }

        setConfig({
          dataRoot: desktopDataRoot,
          projectsRoot,
        } satisfies AppConfig);

        const apiServer = createHttpServer(createApp()) as unknown as Server;
        const apiPort = await listen(apiServer, '0', internalHost);
        const webPort = await findAvailablePort(internalHost);
        const webProcess = spawnWebServer(webEntry, webPort);
        await waitForHttpReady(webPort, internalHost);
        const publicServer = createProxyServer(apiPort, webPort, internalHost);
        const publicPort = await listen(publicServer, '0', internalHost);

        runningServers = {
          apiServer,
          publicServer,
          webProcess,
        };

        state = {
          status: 'running',
          url: `http://${internalHost}:${publicPort}`,
        };

        return state;
      } catch (error) {
        await stopRunningServers(runningServers);
        runningServers = null;
        state = {
          status: 'stopped',
          url: null,
        };
        throw error;
      }
    },

    stop: async () => {
      state = {
        ...state,
        status: 'stopping',
      };

      await stopRunningServers(runningServers);
      runningServers = null;
      state = {
        status: 'stopped',
        url: null,
      };
    },
  };
};

function resolveWebEntry(appPath: string): string {
  const resourcesRoot = appPath.endsWith('.asar') ? dirname(appPath) : appPath;

  return join(resourcesRoot, 'vendor/web/standalone/apps/web/server.js');
}

function spawnWebServer(webEntry: string, port: string): ChildProcess {
  const webProcess = spawn(process.execPath, [webEntry], {
    cwd: dirname(webEntry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      HOSTNAME: internalHost,
      PORT: port,
    },
    stdio: 'inherit',
  });

  webProcess.once('exit', () => {
    // The public proxy reports 502 for web requests if this process exits.
  });

  return webProcess;
}

function isApiRequest(url: string | undefined): boolean {
  return url === '/api' || url === '/health' || url?.startsWith('/api/') === true;
}

function createProxyServer(apiPort: string, webPort: string, host: string): Server {
  const server = createServer((request, response) => {
    const targetPort = isApiRequest(request.url) ? apiPort : webPort;
    proxyHttpRequest(targetPort, host, request, response);
  });

  server.on('upgrade', (request, socket, head) => {
    const targetPort = isApiRequest(request.url) ? apiPort : webPort;
    proxyUpgrade(targetPort, host, request, socket, head);
  });

  return server;
}

function getForwardedHeaders(
  request: IncomingMessage,
  targetHost: string,
  targetPort: string
): IncomingMessage['headers'] {
  return {
    ...request.headers,
    host: `${targetHost}:${targetPort}`,
    'x-forwarded-host': request.headers.host,
    'x-forwarded-proto': 'http',
  };
}

function proxyHttpRequest(
  targetPort: string,
  targetHost: string,
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse
): void {
  const proxyRequest = httpRequest(
    {
      headers: getForwardedHeaders(clientRequest, targetHost, targetPort),
      hostname: targetHost,
      method: clientRequest.method,
      path: clientRequest.url,
      port: Number(targetPort),
    },
    (proxyResponse) => {
      clientResponse.writeHead(proxyResponse.statusCode ?? 500, proxyResponse.headers);
      proxyResponse.pipe(clientResponse);
    }
  );

  proxyRequest.on('error', () => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }

    clientResponse.end('Upstream service is not ready yet.');
  });

  clientRequest.pipe(proxyRequest);
}

function proxyUpgrade(
  targetPort: string,
  targetHost: string,
  clientRequest: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer
): void {
  const upstreamSocket = new Socket();

  upstreamSocket.connect(Number(targetPort), targetHost, () => {
    const headers = Object.entries(getForwardedHeaders(clientRequest, targetHost, targetPort))
      .flatMap(([key, value]) => {
        if (value === undefined) {
          return [];
        }

        if (Array.isArray(value)) {
          return [`${key}: ${value.join(', ')}`];
        }

        return [`${key}: ${value}`];
      })
      .join('\r\n');

    upstreamSocket.write(
      `${clientRequest.method ?? 'GET'} ${clientRequest.url ?? '/'} HTTP/${clientRequest.httpVersion}\r\n${headers}\r\n\r\n`
    );

    if (head.length > 0) {
      upstreamSocket.write(head);
    }

    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamSocket.on('error', () => {
    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  });
}

function listen(server: Server, port: string, host: string): Promise<string> {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(Number(port), host, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to read listening port'));
        return;
      }

      resolveListen(String(address.port));
    });
  });
}

async function findAvailablePort(host: string): Promise<string> {
  const server = createServer();
  const port = await listen(server, '0', host);

  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolveClose();
    });
  });

  return port;
}

function waitForHttpReady(port: string, host: string): Promise<void> {
  const deadline = Date.now() + 20_000;

  return new Promise((resolveReady, reject) => {
    const attempt = (): void => {
      const request = httpRequest(
        {
          hostname: host,
          method: 'GET',
          path: '/',
          port: Number(port),
          timeout: 2_000,
        },
        (response) => {
          response.resume();
          resolveReady();
        }
      );

      request.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('Timed out waiting for web app to start.'));
          return;
        }

        setTimeout(attempt, 250);
      });

      request.on('timeout', () => {
        request.destroy();
      });

      request.end();
    };

    attempt();
  });
}

async function stopRunningServers(servers: RunningServers | null): Promise<void> {
  if (!servers) {
    return;
  }

  servers.webProcess.kill('SIGTERM');
  await Promise.all([closeServer(servers.publicServer), closeServer(servers.apiServer)]);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}
