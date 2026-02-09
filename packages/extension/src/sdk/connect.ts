import { connect as tcpConnect } from 'node:net';

import { DEFAULT_PORT } from '../protocol/constants.js';

import { ChromeClient } from './client.js';

export interface ConnectOptions {
  port?: number;
  host?: string;
}

/**
 * Connect to the Chrome RPC server over TCP.
 *
 * Returns a ChromeClient with the same `call()` and `subscribe()` API
 * as the native host uses directly. The connection is multiplexed —
 * multiple calls and subscriptions can be in-flight simultaneously.
 *
 * @example
 * ```ts
 * import { connect } from '@ank1015/llm-extension';
 *
 * const chrome = await connect();
 * const tabs = await chrome.call('tabs.query', { active: true });
 * ```
 */
export async function connect(opts?: ConnectOptions): Promise<ChromeClient> {
  const port = opts?.port ?? DEFAULT_PORT;
  const host = opts?.host ?? '127.0.0.1';

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
