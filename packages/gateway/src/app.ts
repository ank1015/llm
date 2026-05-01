import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { GatewayAuthError } from './auth/tokens.js';
import { jsonError } from './http/response.js';
import { securityHeadersMiddleware } from './http/security.js';
import { RequestBodyError } from './http/validation.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { GatewayProxyError } from './proxy/error.js';
import { createAdminRoutes } from './routes/admin.js';
import { createAuthRoutes } from './routes/auth.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createHealthRoutes } from './routes/health.js';
import { createImageRoutes } from './routes/image.js';
import { createLlmRoutes } from './routes/llm.js';
import { createGatewayServices } from './runtime.js';

import type { GatewayConfigInput } from './config.js';
import type { GatewayEnv, GatewayServices } from './context.js';
import type { Context } from 'hono';

export function createGatewayApp(configInput: Partial<GatewayConfigInput> = {}): Hono<GatewayEnv> {
  return createGatewayAppWithServices(configInput).app;
}

export function createGatewayAppWithServices(configInput: Partial<GatewayConfigInput> = {}): {
  app: Hono<GatewayEnv>;
  services: GatewayServices;
} {
  const services = createGatewayServices(configInput);
  const app = new Hono<GatewayEnv>();

  app.use(
    '*',
    cors({
      origin:
        services.config.corsOrigins.length === 1
          ? services.config.corsOrigins[0]!
          : services.config.corsOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
    })
  );
  app.use('*', securityHeadersMiddleware());
  app.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });
  app.use('*', requestIdMiddleware());

  app.route('/', createHealthRoutes());
  app.route('/', createAuthRoutes());
  app.route('/', createLlmRoutes());
  app.route('/', createImageRoutes());
  app.route('/', createDashboardRoutes());
  app.route('/', createAdminRoutes());

  app.onError((error, c) => {
    const requestId = tryGetRequestId(c);
    if (requestId) {
      c.header('X-Gateway-Request-Id', requestId);
    }

    if (error instanceof GatewayProxyError || error instanceof GatewayAuthError) {
      return jsonError(c, { error: error.message, code: error.code }, error.status);
    }

    if (error instanceof RequestBodyError) {
      return jsonError(c, { error: error.message, code: error.code }, error.status);
    }

    const message = error instanceof Error ? error.message : 'Gateway request failed.';
    return jsonError(c, { error: message }, 500);
  });

  return {
    app,
    services,
  };
}

function tryGetRequestId(c: Context<GatewayEnv>): string | undefined {
  try {
    return c.get('requestId');
  } catch {
    return undefined;
  }
}
