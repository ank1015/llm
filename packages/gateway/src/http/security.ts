import type { GatewayEnv } from '../context.js';
import type { MiddlewareHandler } from 'hono';

export function securityHeadersMiddleware(): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    await next();
  };
}
