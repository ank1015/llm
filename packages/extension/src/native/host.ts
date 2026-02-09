import { createChromeClient } from '../sdk/index.js';

function log(msg: string): void {
  process.stderr.write(`[host] ${msg}\n`);
}

log(`started (pid=${process.pid})`);

// Create the client and start the read loop.
// The process stays alive as long as Chrome keeps the native messaging port open.
createChromeClient();
