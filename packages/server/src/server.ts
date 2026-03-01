import { serve } from '@hono/node-server';

import { app } from './index.js';

const port = Number(process.env['PORT']) || 8001;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
});
