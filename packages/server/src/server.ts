import { serve } from '@hono/node-server';

import { app } from './index.js';

const hostname = process.env['HOST']?.trim() || '127.0.0.1';
const port = Number(process.env['PORT']) || 8001;

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.warn(`Server listening on http://${hostname}:${info.port}`);
});
