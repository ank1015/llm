import { exec } from 'node:child_process';
import { connect as tcpConnect } from 'node:net';

import { DEFAULT_PORT } from '../protocol/constants.js';

import { ChromeClient } from './client.js';

export interface ConnectOptions {
  port?: number;
  host?: string;
  /** Launch Chrome automatically if connection fails. Default: false */
  launch?: boolean;
  /** Max ms to wait for Chrome + native host to be ready. Default: 30000 */
  launchTimeout?: number;
}

const DEFAULT_LAUNCH_TIMEOUT = 30_000;

/**
 * Connect to the Chrome RPC server over TCP.
 *
 * Returns a ChromeClient with the same `call()` and `subscribe()` API
 * as the native host uses directly. The connection is multiplexed —
 * multiple calls and subscriptions can be in-flight simultaneously.
 *
 * When `launch: true` is set, Chrome will be opened automatically
 * if the connection fails, then retried until the native host is ready.
 *
 * @example
 * ```ts
 * import { connect } from '@ank1015/llm-extension';
 *
 * const chrome = await connect({ launch: true });
 * const tabs = await chrome.call('tabs.query', { active: true });
 * ```
 */
export async function connect(opts?: ConnectOptions): Promise<ChromeClient> {
  const port = opts?.port ?? DEFAULT_PORT;
  const host = opts?.host ?? '127.0.0.1';

  try {
    return await tryConnect(port, host);
  } catch (error) {
    if (!opts?.launch || !isConnectionRefused(error)) {
      throw error;
    }

    await launchChrome();

    const timeout = opts.launchTimeout ?? DEFAULT_LAUNCH_TIMEOUT;
    const deadline = Date.now() + timeout;
    let delay = 200;

    while (Date.now() < deadline) {
      await sleep(delay);
      try {
        return await tryConnect(port, host);
      } catch (retryError) {
        if (!isConnectionRefused(retryError)) throw retryError;
      }
      delay = Math.min(delay * 2, 2000);
    }

    throw new Error(
      `Chrome did not become available on ${host}:${port} within ${timeout}ms. ` +
        'Ensure the extension is installed and the native host is registered.'
    );
  }
}

function tryConnect(port: number, host: string): Promise<ChromeClient> {
  return new Promise<ChromeClient>((resolve, reject) => {
    const socket = tcpConnect({ port, host }, () => {
      const client = new ChromeClient({ input: socket, output: socket });
      client.run().catch(() => {
        // Errors propagate to pending calls via client.closed
      });
      resolve(client);
    });
    socket.once('error', reject);
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
  const platform = process.platform;

  let command: string;
  if (platform === 'darwin') {
    command = 'open -a "Google Chrome"';
  } else if (platform === 'linux') {
    command = 'google-chrome --no-first-run &';
  } else {
    throw new Error(`Auto-launch is not supported on ${platform}`);
  }

  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) reject(new Error(`Failed to launch Chrome: ${error.message}`));
      else resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
