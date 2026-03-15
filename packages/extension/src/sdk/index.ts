import { ChromeClient } from './client.js';

import type { ChromeClientOptions } from './client.js';

export { ChromeClient } from './client.js';
export type { ChromeClientOptions } from './client.js';
export type { GetPageMarkdownOptions } from './page-markdown.js';

export { connect } from './connect.js';
export type { ConnectOptions } from './connect.js';

/**
 * Create a ChromeClient and start the read loop.
 *
 * The read loop runs in the background — the client is immediately
 * usable for `call()` and `subscribe()`. The process stays alive
 * as long as Chrome keeps the native messaging port open.
 */
export function createChromeClient(opts?: ChromeClientOptions): ChromeClient {
  const client = new ChromeClient(opts);

  client.run().catch((error) => {
    process.stderr.write(
      `[chrome-client] fatal: ${error instanceof Error ? error.message : String(error)}\n`
    );
  });

  return client;
}
