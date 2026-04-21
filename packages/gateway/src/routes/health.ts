import { Hono } from 'hono';

import type { GatewayEnv } from '../context.js';

export function createHealthRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  return routes;
}
