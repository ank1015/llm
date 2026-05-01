import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { desktopRoute } from './routes/desktop-route.js';
import { echoRoute } from './routes/echo-route.js';
import { healthRoute } from './routes/health-route.js';

/**
 * Build the Hono app that powers the embedded backend. Routes are mounted under
 * `/api` to mirror the contract in `@shared/api-contract`.
 */
export const createBackendApp = (): Hono => {
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  );

  app.route('/api/health', healthRoute);
  app.route('/api/echo', echoRoute);
  app.route('/api/desktop', desktopRoute);

  return app;
};
