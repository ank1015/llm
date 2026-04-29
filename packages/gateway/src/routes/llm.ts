import { Hono } from 'hono';

import { LlmStreamRequestSchema } from '../contracts/index.js';
import { jsonError } from '../http/response.js';
import { readJsonBody, validateSchema } from '../http/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { GatewayProxyError } from '../proxy/error.js';
import { createLlmStreamProxyResponse } from '../proxy/llm.js';

import type { GatewayEnv } from '../context.js';

export function createLlmRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.use('/v1/llm/*', authMiddleware());

  routes.post('/v1/llm/stream', async (c) => {
    const rawBody = await readJsonBody(c, c.get('services').config.maxRequestBodyBytes);
    const validation = validateSchema(
      c,
      LlmStreamRequestSchema,
      rawBody,
      'Invalid llm stream request body.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    try {
      return await createLlmStreamProxyResponse(c, validation.value);
    } catch (error) {
      if (error instanceof GatewayProxyError) {
        return jsonError(c, { error: error.message, code: error.code }, error.status);
      }

      const message = error instanceof Error ? error.message : 'Failed to proxy llm stream.';
      return c.json({ error: message }, 500);
    }
  });

  return routes;
}
