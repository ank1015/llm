import { Hono } from 'hono';

import { echoMessage } from '../services/system-service.js';

import type { ApiErrorResponse, EchoRequestBody, EchoResponse } from '../../shared/api-contract.js';

const isEchoRequestBody = (value: unknown): value is EchoRequestBody => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record['message'] === 'string';
};

export const echoRoute = new Hono().post('/', async (c) => {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch {
    const body: ApiErrorResponse = {
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    };

    return c.json(body, 400);
  }

  if (!isEchoRequestBody(payload)) {
    const body: ApiErrorResponse = {
      error: { code: 'INVALID_BODY', message: 'Request must include a string `message`.' },
    };

    return c.json(body, 400);
  }

  const result = echoMessage(payload.message);
  const body: EchoResponse = {
    received: result.received,
    receivedAt: result.receivedAt,
  };

  return c.json(body);
});
