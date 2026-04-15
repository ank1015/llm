#!/usr/bin/env node

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Duplex } from 'node:stream';

type CliOptions = {
  apiPort: string;
  host: string;
  openBrowser: boolean;
  port: string;
  webPort: string;
};

const DEFAULT_OPTIONS: CliOptions = {
  apiPort: '0',
  host: '127.0.0.1',
  openBrowser: true,
  port: '3210',
  webPort: '0',
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDirectory, '..');
const require = createRequire(import.meta.url);

function parseOptions(arguments_: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--no-open') {
      options.openBrowser = false;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    }

    if (argument === '--host') {
      options.host = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--api-port') {
      options.apiPort = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--port') {
      options.port = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--web-port') {
      options.webPort = readValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

function readValue(arguments_: string[], index: number, option: string): string {
  const value = arguments_[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`Usage: llm [options]

Options:
  --host <host>       Host for the public app URL. Defaults to 127.0.0.1.
  --port <port>       Public app port for web and API. Defaults to 3210.
  --api-port <port>   Internal Hono API port. Defaults to a free random port.
  --web-port <port>   Internal Next.js web port. Defaults to a free random port.
  --no-open           Do not open the browser automatically.
  -h, --help          Show this help message.
`);
}

function resolveServerEntry(): string {
  return require.resolve('@ank1015/llm-server/server');
}

function resolveWebEntry(): string {
  return join(packageRoot, 'vendor/web/standalone/apps/web/server.js');
}

function spawnNode(entry: string, env: NodeJS.ProcessEnv, cwd?: string): ChildProcess {
  return spawn(process.execPath, [entry], {
    cwd,
    env,
    stdio: 'inherit',
  });
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

function isApiRequest(url: string | undefined): boolean {
  return url === '/api' || url === '/health' || url?.startsWith('/api/') === true;
}

function createGatewayServer(
  apiPort: string,
  webPort: string,
  internalHost: string
): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    const targetPort = isApiRequest(request.url) ? apiPort : webPort;
    proxyHttpRequest(targetPort, internalHost, request, response);
  });

  server.on('upgrade', (request, socket, head) => {
    const targetPort = isApiRequest(request.url) ? apiPort : webPort;
    proxyUpgrade(targetPort, internalHost, request, socket, head);
  });

  return server;
}

function openUrl(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  const child = spawn(opener, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
}

function shutdown(children: ChildProcess[]): void {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

function listen(
  server: ReturnType<typeof createServer>,
  port: string,
  host: string
): Promise<string> {
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

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const webEntry = resolveWebEntry();
  const serverEntry = resolveServerEntry();

  if (!existsSync(webEntry)) {
    throw new Error(
      `Missing assembled web server at ${webEntry}. Run pnpm release:app:build first.`
    );
  }

  const internalHost = '127.0.0.1';
  const webCwd = dirname(webEntry);
  const children: ChildProcess[] = [];
  const apiPort = options.apiPort === '0' ? await findAvailablePort(internalHost) : options.apiPort;
  const webPort = options.webPort === '0' ? await findAvailablePort(internalHost) : options.webPort;
  const publicServer = createGatewayServer(apiPort, webPort, internalHost);
  const gatewayPort = await listen(publicServer, options.port, options.host);
  const gatewayBaseUrl = `http://${options.host}:${gatewayPort}`;
  const apiBaseUrl = gatewayBaseUrl;

  children.push(
    spawnNode(serverEntry, {
      ...process.env,
      HOST: internalHost,
      PORT: apiPort,
    })
  );

  children.push(
    spawnNode(
      webEntry,
      {
        ...process.env,
        HOSTNAME: internalHost,
        NEXT_PUBLIC_LLM_SERVER_BASE_URL: apiBaseUrl,
        PORT: webPort,
      },
      webCwd
    )
  );

  console.log(`LLM app: ${gatewayBaseUrl}`);
  console.log(`LLM API: ${gatewayBaseUrl}/api`);

  if (options.openBrowser) {
    setTimeout(() => openUrl(gatewayBaseUrl), 1500);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      publicServer.close();
      shutdown(children);
      process.exit(0);
    });
  }

  for (const child of children) {
    child.on('exit', (code, signal) => {
      publicServer.close();
      shutdown(children);

      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 1);
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
