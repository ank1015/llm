/**
 * Server entry point
 *
 * Starts the HTTP server on the configured port.
 */

import { serve } from '@hono/node-server';

import app from './index.js';

const port = Number(process.env.PORT) || 3001;

// eslint-disable-next-line no-console
console.log(`Starting server on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
