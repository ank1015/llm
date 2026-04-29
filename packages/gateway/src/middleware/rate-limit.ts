import { createJsonResponse } from '../http/response.js';
import { getClientIdentifier } from '../rate-limit.js';

import type { GatewayEnv } from '../context.js';
import type { RateLimitGroup, RateLimitResult } from '../rate-limit.js';
import type { Context, MiddlewareHandler } from 'hono';

export function rateLimitMiddleware(group: RateLimitGroup): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const result = consumeRateLimit(c, group);
    if (!result.allowed) {
      return rateLimitJsonResponse(c, result);
    }

    return next();
  };
}

export function consumeRateLimit(c: Context<GatewayEnv>, group: RateLimitGroup): RateLimitResult {
  const services = c.get('services');
  return services.rateLimiter.check({
    group,
    identifier: getClientIdentifier(c, services.config),
  });
}

export function rateLimitJsonResponse(c: Context<GatewayEnv>, result: RateLimitResult): Response {
  c.header('Retry-After', String(result.retryAfterSeconds));
  return createJsonResponse(
    c,
    {
      error: 'Too many requests. Please try again later.',
      code: 'rate_limited',
    },
    429
  );
}
