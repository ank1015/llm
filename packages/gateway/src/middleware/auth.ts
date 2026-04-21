import { GatewayAuthError } from '../auth/tokens.js';

import type { GatewayEnv } from '../context.js';
import type { MiddlewareHandler } from 'hono';

export function authMiddleware(): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const authorization = c.req.header('Authorization');
    const token = parseBearerToken(authorization);

    if (!token) {
      return c.json({ error: 'Authorization bearer token is required.' }, 401);
    }

    try {
      const services = c.get('services');
      const verification = await services.auth.verifyAccessToken(token);
      const sender = services.db.getSenderById(verification.senderId);

      if (!sender) {
        return c.json({ error: 'Sender for access token was not found.' }, 401);
      }

      if (sender.disabledAt !== null) {
        return c.json({ error: 'Sender has been disabled.' }, 403);
      }

      c.set('senderId', sender.id);
      return next();
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        return new Response(JSON.stringify({ error: error.message, code: error.code }), {
          status: error.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        });
      }

      return c.json({ error: 'Failed to verify access token.' }, 401);
    }
  };
}

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/u);
  return scheme === 'Bearer' && token ? token : undefined;
}
