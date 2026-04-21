import { fileURLToPath } from 'node:url';

import { createAdaptorServer } from '@hono/node-server';

import { createGatewayAppWithServices } from './app.js';
import { getGatewayConfig } from './config.js';

import type { GatewayConfigInput } from './config.js';

export function createGatewayServer(
  configInput: Partial<GatewayConfigInput> = {}
): ReturnType<typeof createAdaptorServer> {
  const { app, services } = createGatewayAppWithServices(configInput);
  const server = createAdaptorServer({
    fetch: app.fetch,
  });

  server.on('close', () => {
    services.db.close();
  });

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = getGatewayConfig();
  const server = createGatewayServer(config);

  server.listen(config.port, config.host, () => {
    console.warn(`Gateway listening on http://${config.host}:${config.port}`);
  });
}
