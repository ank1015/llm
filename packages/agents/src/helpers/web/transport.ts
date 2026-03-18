import { exec } from 'node:child_process';
import { connect as tcpConnect } from 'node:net';

import { ChromeClient, DEFAULT_PORT, MAX_TCP_MESSAGE_SIZE_BYTES } from '@ank1015/llm-extension';

import type { ConnectOptions, GetPageMarkdownOptions } from '@ank1015/llm-extension';
import type { Socket } from 'node:net';

export interface ManagedChromeBridgeClient {
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  getPageMarkdown(tabId: number, options?: GetPageMarkdownOptions): Promise<string>;
}

export interface ManagedChromeBridge {
  client: ManagedChromeBridgeClient;
  close(): Promise<void>;
}

export interface ConnectWebTransportOptions extends ConnectOptions {}

const DEFAULT_LAUNCH_TIMEOUT = 30_000;

export async function connectManagedChromeBridge(
  options?: ConnectWebTransportOptions
): Promise<ManagedChromeBridge> {
  const port = options?.port ?? DEFAULT_PORT;
  const host = options?.host ?? '127.0.0.1';

  try {
    return await tryConnect(port, host);
  } catch (error) {
    if (!options?.launch || !isConnectionRefused(error)) {
      throw error;
    }

    await launchChrome();

    const timeout = options.launchTimeout ?? DEFAULT_LAUNCH_TIMEOUT;
    const deadline = Date.now() + timeout;
    let delay = 200;

    while (Date.now() < deadline) {
      await sleep(delay);
      try {
        return await tryConnect(port, host);
      } catch (retryError) {
        if (!isConnectionRefused(retryError)) {
          throw retryError;
        }
      }

      delay = Math.min(delay * 2, 2_000);
    }

    throw new Error(
      `Chrome did not become available on ${host}:${port} within ${timeout}ms. ` +
        'Ensure the extension is installed and the native host is registered.'
    );
  }
}

function tryConnect(port: number, host: string): Promise<ManagedChromeBridge> {
  return new Promise<ManagedChromeBridge>((resolve, reject) => {
    const socket = tcpConnect({ port, host });

    const handleError = (error: Error): void => {
      socket.removeListener('connect', handleConnect);
      reject(error);
    };

    const handleConnect = (): void => {
      socket.removeListener('error', handleError);

      const client = new ChromeClient({
        input: socket,
        output: socket,
        maxIncomingMessageSizeBytes: MAX_TCP_MESSAGE_SIZE_BYTES,
        maxOutgoingMessageSizeBytes: MAX_TCP_MESSAGE_SIZE_BYTES,
      });

      client.run().catch(() => {
        // Pending requests are rejected by the underlying client cleanup.
      });

      resolve({
        client: {
          call: async <T = unknown>(method: string, ...args: unknown[]): Promise<T> => {
            return (await client.call(method, ...args)) as T;
          },
          getPageMarkdown: async (
            tabId: number,
            options?: GetPageMarkdownOptions
          ): Promise<string> => {
            return await client.getPageMarkdown(tabId, options);
          },
        },
        close: async (): Promise<void> => {
          await closeSocket(socket);
        },
      });
    };

    socket.once('error', handleError);
    socket.once('connect', handleConnect);
  });
}

async function closeSocket(socket: Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = setTimeout(() => {
      socket.destroy();
      finish();
    }, 500);

    socket.once('close', finish);
    socket.once('error', finish);
    socket.end();
  });
}

function isConnectionRefused(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ECONNREFUSED'
  );
}

function launchChrome(): Promise<void> {
  let command: string;

  if (process.platform === 'darwin') {
    command = 'open -a "Google Chrome"';
  } else if (process.platform === 'linux') {
    command = 'google-chrome --no-first-run &';
  } else {
    throw new Error(`Auto-launch is not supported on ${process.platform}`);
  }

  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(new Error(`Failed to launch Chrome: ${error.message}`));
        return;
      }

      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
