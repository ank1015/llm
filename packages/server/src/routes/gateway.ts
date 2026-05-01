import { Hono } from 'hono';

import { GatewayLoginRequestSchema } from '../contracts/index.js';
import { getGatewaySession, loginGateway } from '../core/gateway-credentials.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  GatewayLoginRequest,
  GatewayLoginResult,
  GatewaySession,
} from '../contracts/index.js';

export const gatewayRoutes = new Hono();

gatewayRoutes.get('/gateway/session', async (c) => {
  return c.json<GatewaySession>(await getGatewaySession());
});

gatewayRoutes.post('/gateway/login', async (c) => {
  const rawBody = await readJsonBody(c);
  const validation = validateSchema(
    c,
    GatewayLoginRequestSchema,
    rawBody ?? {},
    'Invalid request body'
  );

  if (!validation.ok) {
    return validation.response;
  }

  const body = validation.value satisfies GatewayLoginRequest;
  const result = await loginGateway(body.username ?? '', body.password ?? '');

  return c.json<GatewayLoginResult>(result);
});
