import { Hono } from 'hono';

import { GatewayAuthError } from '../auth/tokens.js';
import { RefreshTokenBodySchema, UserLoginBodySchema } from '../contracts/index.js';
import { jsonError } from '../http/response.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type { GatewayEnv } from '../context.js';

export function createAuthRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.post('/v1/auth/login', async (c) => {
    const rawBody = await readJsonBody(c);
    const validation = validateSchema(
      c,
      UserLoginBodySchema,
      rawBody,
      'username and password are required.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    try {
      const result = await c
        .get('services')
        .auth.loginWithPassword(validation.value.username, validation.value.password);
      return c.json(result);
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        return jsonError(c, { error: error.message, code: error.code }, error.status);
      }

      return c.json({ error: 'Failed to log in.' }, 500);
    }
  });

  routes.post('/v1/auth/refresh', async (c) => {
    const rawBody = await readJsonBody(c);
    const validation = validateSchema(
      c,
      RefreshTokenBodySchema,
      rawBody,
      'refreshToken is required.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    try {
      const result = await c.get('services').auth.refresh(validation.value.refreshToken);
      return c.json(result);
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        return jsonError(c, { error: error.message, code: error.code }, error.status);
      }

      return c.json({ error: 'Failed to refresh access token.' }, 500);
    }
  });

  routes.post('/v1/auth/revoke', async (c) => {
    const rawBody = await readJsonBody(c);
    const validation = validateSchema(
      c,
      RefreshTokenBodySchema,
      rawBody,
      'refreshToken is required.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    const revoked = c.get('services').auth.revokeRefreshToken(validation.value.refreshToken);
    return c.json({ ok: true, revoked });
  });

  return routes;
}
