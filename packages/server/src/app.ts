import { Hono } from 'hono';

import { xRoutes } from './routes/x.js';

/**
 * Creates and configures the Hono application.
 *
 * @returns Configured Hono app instance
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.route('/x', xRoutes);

  return app;
}
