import { GatewayAuthError } from '../auth/tokens.js';

import { consumeRateLimit, rateLimitJsonResponse } from './rate-limit.js';

import type { GatewayEnv } from '../context.js';
import type { MiddlewareHandler } from 'hono';

export function authMiddleware(): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const authorization = c.req.header('Authorization');
    const token = parseBearerToken(authorization);

    if (!token) {
      const rateLimit = consumeRateLimit(c, 'unauthenticated');
      if (!rateLimit.allowed) {
        return rateLimitJsonResponse(c, rateLimit);
      }

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

      const session = services.db.getRefreshTokenById(verification.tokenId);
      if (
        !session ||
        session.senderId !== sender.id ||
        session.revokedAt !== null ||
        session.expiresAt <= Date.now()
      ) {
        return c.json({ error: 'Access token session is no longer active.' }, 401);
      }

      c.set('senderId', sender.id);
      return next();
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        const rateLimit = consumeRateLimit(c, 'unauthenticated');
        if (!rateLimit.allowed) {
          return rateLimitJsonResponse(c, rateLimit);
        }

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
