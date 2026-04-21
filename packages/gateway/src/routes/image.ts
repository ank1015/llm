import { Hono } from 'hono';

import { ImageGenerateRequestSchema } from '../contracts/index.js';
import { jsonError } from '../http/response.js';
import { readJsonBody, validateSchema } from '../http/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { GatewayProxyError } from '../proxy/error.js';
import { runImageProxy } from '../proxy/image.js';

import type { GatewayEnv } from '../context.js';

export function createImageRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.use('/v1/image/*', authMiddleware());

  routes.post('/v1/image/generate', async (c) => {
    const rawBody = await readJsonBody(c);
    const validation = validateSchema(
      c,
      ImageGenerateRequestSchema,
      rawBody,
      'Invalid image generation request body.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    try {
      const result = await runImageProxy(c, validation.value);
      return c.json({ result });
    } catch (error) {
      if (error instanceof GatewayProxyError) {
        return jsonError(c, { error: error.message, code: error.code }, error.status);
      }

      const message = error instanceof Error ? error.message : 'Failed to proxy image request.';
      return c.json({ error: message }, 500);
    }
  });

  return routes;
}
