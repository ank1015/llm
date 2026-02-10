import { DEFAULT_PORT } from '../protocol/constants.js';
import { ChromeClient } from '../sdk/client.js';

import { ChromeServer } from './server.js';

function log(msg: string): void {
  process.stderr.write(`[host] ${msg}\n`);
}

log(`started (pid=${process.pid})`);

const client = new ChromeClient();
client.run().then(
  () => {
    log('Chrome disconnected, exiting');
    process.exit(0);
  },
  (e) => {
    log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
);

const port = process.env.CHROME_RPC_PORT ? parseInt(process.env.CHROME_RPC_PORT, 10) : DEFAULT_PORT;

new ChromeServer(client, { port });
