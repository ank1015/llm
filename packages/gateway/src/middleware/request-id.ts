import { randomUUID } from 'node:crypto';

import type { GatewayEnv } from '../context.js';
import type { MiddlewareHandler } from 'hono';

export function requestIdMiddleware(): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const requestId = randomUUID();
    c.set('requestId', requestId);
    c.header('X-Gateway-Request-Id', requestId);
    await next();
  };
}
