import type { GatewayEnv } from '../context.js';
import type { MiddlewareHandler } from 'hono';

export function adminAuthMiddleware(): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const token = parseBearerToken(c.req.header('Authorization'));
    const adminToken = c.get('services').config.adminToken;

    if (!token || token !== adminToken) {
      return c.json({ error: 'Admin bearer token is required.' }, 401);
    }

    return next();
  };
}

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/u);
  return scheme === 'Bearer' && token ? token : undefined;
}
